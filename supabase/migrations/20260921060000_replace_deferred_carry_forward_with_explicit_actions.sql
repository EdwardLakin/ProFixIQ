-- Contract change, explicitly approved by the user: the automatic carry-
-- forward trigger silently inserted a new, non-actionable 'deferred'
-- work_order_lines row (plus a linked quote line) into every new work order
-- for a vehicle with unresolved declined/deferred history. The user wants
-- this to stop being automatic. Previous recommendations should be visible
-- to the advisor on the new work order, and the advisor decides explicitly:
--
--   - Add: the customer agreed to the work now. Creates a real, actionable
--     work_order_lines row (status = 'awaiting_approval', same as any
--     manually added job) plus a linked quote line carrying the prior
--     pricing forward.
--   - Decline: the customer was asked again and said no again at this
--     visit. Records a fresh quote-only decision (no work_order_lines row)
--     chained to the prior one via source_row_id, exactly like an ordinary
--     customer decline elsewhere in the app.
--   - Completed elsewhere: the customer already had the work done at
--     another shop. Marks the recommendation permanently resolved; it never
--     surfaces again for this vehicle.
--
-- This retires the AFTER INSERT/UPDATE trigger this repository's
-- Additive-First Change Control section flags as an unapproved shared-
-- contract change (attaching a trigger to the pre-existing work_orders
-- table) -- removing it resolves that governance question at its root
-- rather than requesting retroactive approval for it.
--
-- Legacy carried lines already in production (metadata->>'carry_forward' =
-- 'true', inserted automatically between 2026-09-10 and this migration)
-- are left exactly as they are: ordinary work_order_lines rows going
-- forward, no special handling needed since no more get created.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

-- ---------------------------------------------------------------------
-- 1. Retire the automatic carry-forward trigger.
-- ---------------------------------------------------------------------

drop trigger if exists trg_work_orders_carry_forward_deferred_work
  on public.work_orders;

drop function if exists public.carry_forward_deferred_work_for_work_order();

-- ---------------------------------------------------------------------
-- 2. A recommendation can now be closed out without ever becoming a work
--    order line: "the customer already had this done elsewhere."
-- ---------------------------------------------------------------------

alter table public.work_order_quote_lines
  add column if not exists resolved_elsewhere_at timestamptz,
  add column if not exists resolved_elsewhere_by_user_id uuid
    references auth.users(id) on delete set null;

create index if not exists idx_work_order_quote_lines_unresolved_elsewhere
  on public.work_order_quote_lines (shop_id, vehicle_id)
  where resolved_elsewhere_at is null;

-- The pre-existing work_order_quote_lines_shop_update policy and default
-- authenticated grants let any authenticated shop user update these two new
-- columns directly, bypassing resolve_deferred_recommendation_elsewhere's
-- role check and actor binding. Guard them the same way
-- enforce_work_order_archive_write_boundary guards work_orders.archived_at:
-- the guarded function sets a transaction-local flag; nothing else may move
-- these columns.
create function public.enforce_deferred_recommendation_resolution_write_boundary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $boundary$
begin
  if new.resolved_elsewhere_at is distinct from old.resolved_elsewhere_at
     or new.resolved_elsewhere_by_user_id is distinct from old.resolved_elsewhere_by_user_id
  then
    if coalesce(current_setting('app.deferred_recommendation_resolving', true), '0') <> '1' then
      raise exception using
        errcode = '42501',
        message = 'DEFERRED_RECOMMENDATION_RESOLUTION_DIRECT_WRITE: this state changes only through resolve_deferred_recommendation_elsewhere.';
    end if;
  end if;

  return new;
end;
$boundary$;

drop trigger if exists work_order_quote_lines_enforce_deferred_resolution_boundary
  on public.work_order_quote_lines;
create trigger work_order_quote_lines_enforce_deferred_resolution_boundary
  before update on public.work_order_quote_lines
  for each row
  execute function public.enforce_deferred_recommendation_resolution_write_boundary();

-- ---------------------------------------------------------------------
-- 3. Idempotency receipts shared by the Add/Decline actions below. Kept
--    inaccessible to every role; only the SECURITY DEFINER functions in
--    this migration touch it.
-- ---------------------------------------------------------------------

create table public.work_order_deferred_recommendation_receipts (
  action_id uuid primary key,
  shop_id uuid not null,
  work_order_id uuid not null,
  quote_line_id uuid not null,
  action text not null check (action in ('add', 'decline')),
  request_sha256 text not null
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

comment on table public.work_order_deferred_recommendation_receipts is
  'Idempotency receipts for the explicit Add/Decline deferred-recommendation actions, keyed by a client-supplied action id.';

alter table public.work_order_deferred_recommendation_receipts enable row level security;
revoke all on table public.work_order_deferred_recommendation_receipts
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Add: bring a prior recommendation onto this work order as a real,
--    actionable line, carrying its pricing forward.
-- ---------------------------------------------------------------------

create function public.add_deferred_recommendation_to_work_order(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_id uuid,
  p_new_line_id uuid,
  p_authenticated_user_id uuid,
  p_actor_profile_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_source_quote public.work_order_quote_lines%rowtype;
  v_root_line public.work_order_lines%rowtype;
  v_receipt public.work_order_deferred_recommendation_receipts%rowtype;
  v_receipt_inserted boolean;
  v_request jsonb;
  v_request_sha256 text;
  v_root_line_id uuid;
  v_finding_key text;
  v_existing_carry_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_SERVICE_ROLE_REQUIRED';
  end if;

  if p_shop_id is null
     or p_work_order_id is null
     or p_quote_line_id is null
     or p_new_line_id is null
     or p_authenticated_user_id is null
     or p_actor_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_INVALID_ARGUMENT';
  end if;

  select profile.*
    into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id
    and (
      profile.id = p_authenticated_user_id
      or profile.user_id = p_authenticated_user_id
    )
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_ACTOR_FORBIDDEN';
  end if;

  v_actor_role := lower(btrim(coalesce(v_actor.role::text, '')));
  if v_actor_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_ACTOR_FORBIDDEN';
  end if;

  select wo.*
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DEFERRED_RECOMMENDATION_WORK_ORDER_NOT_FOUND';
  end if;

  if v_work_order.archived_at is not null
     or lower(coalesce(v_work_order.status::text, '')) in (
       'invoiced', 'cancelled', 'canceled', 'archived'
     ) then
    raise exception using
      errcode = '55000',
      message = 'DEFERRED_RECOMMENDATION_WORK_ORDER_CLOSED';
  end if;

  if public.work_order_is_financially_locked(v_work_order.shop_id, v_work_order.id) then
    raise exception using
      errcode = '55000',
      message = 'DEFERRED_RECOMMENDATION_FINANCIALLY_LOCKED';
  end if;

  select quote_line.*
    into v_source_quote
  from public.work_order_quote_lines quote_line
  where quote_line.id = p_quote_line_id
    and quote_line.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DEFERRED_RECOMMENDATION_NOT_FOUND';
  end if;

  if v_source_quote.vehicle_id is distinct from v_work_order.vehicle_id then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_VEHICLE_MISMATCH';
  end if;

  if v_source_quote.resolved_elsewhere_at is not null then
    raise exception using
      errcode = '55000',
      message = 'DEFERRED_RECOMMENDATION_ALREADY_RESOLVED';
  end if;

  if not (
    lower(coalesce(v_source_quote.status::text, '')) in ('declined', 'deferred')
    or lower(coalesce(v_source_quote.stage::text, '')) in ('customer_declined', 'customer_deferred')
    or lower(coalesce(v_source_quote.decision::text, '')) in ('declined', 'deferred')
  ) then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_NOT_UNRESOLVED';
  end if;

  v_root_line_id := coalesce(
    v_source_quote.source_work_order_line_id,
    v_source_quote.work_order_line_id
  );
  if v_root_line_id is null then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_MISSING_ROOT';
  end if;

  select line.*
    into v_root_line
  from public.work_order_lines line
  where line.id = v_root_line_id
    and line.shop_id = p_shop_id
  for update;

  if not found or v_root_line.voided_at is not null then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_MISSING_ROOT';
  end if;

  v_finding_key := coalesce(
    v_source_quote.metadata ->> 'inspection_finding_identity',
    v_root_line_id::text
  );

  v_request := jsonb_build_object(
    'shop_id', p_shop_id,
    'work_order_id', p_work_order_id,
    'quote_line_id', p_quote_line_id,
    'new_line_id', p_new_line_id,
    'action', 'add'
  );
  v_request_sha256 := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Defense in depth: a prior add for this exact recommendation already
  -- landed on this work order (e.g. a retried click racing the receipt, or a
  -- different client-generated line id for the same recommendation). Computed
  -- before the receipt check below so a retry of an action id that lost this
  -- race can also resolve to the line that actually exists.
  select quote_line.work_order_line_id
    into v_existing_carry_id
  from public.work_order_quote_lines quote_line
  where quote_line.shop_id = p_shop_id
    and quote_line.work_order_id = p_work_order_id
    and quote_line.source_work_order_line_id = v_root_line_id
    and quote_line.id <> p_quote_line_id
    and lower(coalesce(quote_line.metadata ->> 'carry_forward', 'false')) = 'true'
    and coalesce(
      quote_line.metadata ->> 'inspection_finding_identity',
      quote_line.source_work_order_line_id::text
    ) = v_finding_key
  limit 1;

  insert into public.work_order_deferred_recommendation_receipts (
    action_id, shop_id, work_order_id, quote_line_id, action, request_sha256
  ) values (
    p_new_line_id, v_work_order.shop_id, v_work_order.id, p_quote_line_id,
    'add', v_request_sha256
  )
  on conflict (action_id) do nothing;
  v_receipt_inserted := found;

  select receipt.*
    into v_receipt
  from public.work_order_deferred_recommendation_receipts receipt
  where receipt.action_id = p_new_line_id
  for update;

  if not found
     or v_receipt.shop_id is distinct from v_work_order.shop_id
     or v_receipt.work_order_id is distinct from v_work_order.id
     or v_receipt.quote_line_id is distinct from p_quote_line_id
     or v_receipt.action is distinct from 'add'
     or v_receipt.request_sha256 is distinct from v_request_sha256 then
    raise exception using
      errcode = '23505',
      message = 'DEFERRED_RECOMMENDATION_ID_CONFLICT';
  end if;

  if not v_receipt_inserted then
    -- This exact action id was already processed. Its work_order_lines row
    -- is usually p_new_line_id itself, but if a concurrent add for the same
    -- recommendation under a different client-generated id won the race, it
    -- is the other line the defense-in-depth check above found instead.
    if v_existing_carry_id is not null then
      return jsonb_build_object('ok', true, 'line_id', v_existing_carry_id, 'idempotent', true);
    end if;
    return jsonb_build_object('ok', true, 'line_id', p_new_line_id, 'idempotent', true);
  end if;

  if v_existing_carry_id is not null then
    return jsonb_build_object('ok', true, 'line_id', v_existing_carry_id, 'idempotent', true);
  end if;

  -- Mutual exclusion: once this exact quote line has been consumed by any
  -- prior Add or Decline (both chain their new row to it via source_row_id),
  -- it can never be a valid action target again. Checked only on this fresh
  -- (non-retry) path -- a genuine retry of this same action id is handled by
  -- the receipt/existing-carry lookups above and must stay idempotent, not
  -- trip over the row its own prior successful call created. Without this,
  -- two stale tabs could Add and Decline the same recommendation and leave
  -- both an actionable line and a contradictory terminal decision.
  if exists (
    select 1
    from public.work_order_quote_lines existing
    where existing.shop_id = p_shop_id
      and existing.source_row_id = p_quote_line_id::text
  ) then
    raise exception using
      errcode = '55000',
      message = 'DEFERRED_RECOMMENDATION_ALREADY_ACTIONED';
  end if;

  insert into public.work_order_lines (
    id,
    work_order_id,
    vehicle_id,
    complaint,
    cause,
    correction,
    description,
    notes,
    status,
    approval_state,
    job_type,
    shop_id,
    user_id,
    urgency
  ) values (
    p_new_line_id,
    v_work_order.id,
    v_work_order.vehicle_id,
    v_root_line.complaint,
    v_root_line.cause,
    v_root_line.correction,
    coalesce(v_source_quote.description, v_source_quote.title, v_root_line.description),
    v_root_line.notes,
    'awaiting_approval',
    'pending',
    coalesce(v_root_line.job_type, 'repair'),
    v_work_order.shop_id,
    p_authenticated_user_id,
    coalesce(v_root_line.urgency, 'medium')
  );

  insert into public.work_order_quote_lines (
    shop_id,
    work_order_id,
    work_order_line_id,
    source_work_order_line_id,
    source_row_id,
    vehicle_id,
    title,
    description,
    line_type,
    status,
    labor_hours,
    est_labor_hours,
    labor_rate,
    labor_total,
    parts_total,
    subtotal,
    discount_total,
    tax_total,
    grand_total,
    metadata
  ) values (
    v_work_order.shop_id,
    v_work_order.id,
    p_new_line_id,
    v_root_line_id,
    p_quote_line_id,
    v_work_order.vehicle_id,
    v_source_quote.title,
    v_source_quote.description,
    'job',
    'draft',
    coalesce(v_source_quote.labor_hours, 0),
    coalesce(v_source_quote.est_labor_hours, 0),
    v_source_quote.labor_rate,
    coalesce(v_source_quote.labor_total, 0),
    coalesce(v_source_quote.parts_total, 0),
    coalesce(v_source_quote.subtotal, 0),
    coalesce(v_source_quote.discount_total, 0),
    coalesce(v_source_quote.tax_total, 0),
    coalesce(v_source_quote.grand_total, 0),
    coalesce(v_source_quote.metadata, '{}'::jsonb) || jsonb_build_object(
      'carry_forward', true,
      'added_from_deferred_history', true,
      'source_quote_line_id', p_quote_line_id,
      'source_work_order_line_id', v_root_line_id,
      'added_by_user_id', p_authenticated_user_id
    )
  );

  return jsonb_build_object('ok', true, 'line_id', p_new_line_id, 'idempotent', false);
end;
$$;

comment on function public.add_deferred_recommendation_to_work_order(
  uuid, uuid, uuid, uuid, uuid, uuid
) is
  'Advisor-initiated: brings a prior declined/deferred recommendation onto this work order as a real, actionable line with its pricing carried forward. Idempotent per client-supplied line id.';

revoke all on function public.add_deferred_recommendation_to_work_order(
  uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.add_deferred_recommendation_to_work_order(
  uuid, uuid, uuid, uuid, uuid, uuid
) to service_role;

-- ---------------------------------------------------------------------
-- 5. Decline: the customer was asked again at this visit and said no
--    again. Quote-only, chained to the prior decision, no line created.
-- ---------------------------------------------------------------------

create function public.decline_deferred_recommendation(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_id uuid,
  p_action_id uuid,
  p_authenticated_user_id uuid,
  p_actor_profile_id uuid,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_source_quote public.work_order_quote_lines%rowtype;
  v_root_line_id uuid;
  v_receipt public.work_order_deferred_recommendation_receipts%rowtype;
  v_receipt_inserted boolean;
  v_request jsonb;
  v_request_sha256 text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_new_quote_line_id uuid;
  v_existing_quote_line_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_SERVICE_ROLE_REQUIRED';
  end if;

  if p_shop_id is null
     or p_work_order_id is null
     or p_quote_line_id is null
     or p_action_id is null
     or p_authenticated_user_id is null
     or p_actor_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_INVALID_ARGUMENT';
  end if;

  select profile.*
    into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id
    and (
      profile.id = p_authenticated_user_id
      or profile.user_id = p_authenticated_user_id
    )
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_ACTOR_FORBIDDEN';
  end if;

  -- Decline is a customer decision (equivalent to declining a quote), the
  -- same authorization boundary the canonical
  -- /api/work-orders/quotes/[id]/decline route enforces via
  -- canAuthorizeQuotes. lead_hand can manage work orders but is deliberately
  -- excluded from quote authorization in that role matrix.
  v_actor_role := lower(btrim(coalesce(v_actor.role::text, '')));
  if v_actor_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_ACTOR_FORBIDDEN';
  end if;

  select wo.*
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DEFERRED_RECOMMENDATION_WORK_ORDER_NOT_FOUND';
  end if;

  if v_work_order.archived_at is not null
     or lower(coalesce(v_work_order.status::text, '')) in (
       'invoiced', 'cancelled', 'canceled', 'archived'
     ) then
    raise exception using
      errcode = '55000',
      message = 'DEFERRED_RECOMMENDATION_WORK_ORDER_CLOSED';
  end if;

  select quote_line.*
    into v_source_quote
  from public.work_order_quote_lines quote_line
  where quote_line.id = p_quote_line_id
    and quote_line.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DEFERRED_RECOMMENDATION_NOT_FOUND';
  end if;

  if v_source_quote.vehicle_id is distinct from v_work_order.vehicle_id then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_VEHICLE_MISMATCH';
  end if;

  if v_source_quote.resolved_elsewhere_at is not null then
    raise exception using
      errcode = '55000',
      message = 'DEFERRED_RECOMMENDATION_ALREADY_RESOLVED';
  end if;

  if not (
    lower(coalesce(v_source_quote.status::text, '')) in ('declined', 'deferred')
    or lower(coalesce(v_source_quote.stage::text, '')) in ('customer_declined', 'customer_deferred')
    or lower(coalesce(v_source_quote.decision::text, '')) in ('declined', 'deferred')
  ) then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_NOT_UNRESOLVED';
  end if;

  v_root_line_id := coalesce(
    v_source_quote.source_work_order_line_id,
    v_source_quote.work_order_line_id
  );
  if v_root_line_id is null then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_MISSING_ROOT';
  end if;

  if not exists (
    select 1
    from public.work_order_lines line
    where line.id = v_root_line_id
      and line.shop_id = p_shop_id
      and line.voided_at is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_MISSING_ROOT';
  end if;

  v_request := jsonb_build_object(
    'shop_id', p_shop_id,
    'work_order_id', p_work_order_id,
    'quote_line_id', p_quote_line_id,
    'action_id', p_action_id,
    'action', 'decline'
  );
  v_request_sha256 := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.work_order_deferred_recommendation_receipts (
    action_id, shop_id, work_order_id, quote_line_id, action, request_sha256
  ) values (
    p_action_id, v_work_order.shop_id, v_work_order.id, p_quote_line_id,
    'decline', v_request_sha256
  )
  on conflict (action_id) do nothing;
  v_receipt_inserted := found;

  select receipt.*
    into v_receipt
  from public.work_order_deferred_recommendation_receipts receipt
  where receipt.action_id = p_action_id
  for update;

  if not found
     or v_receipt.shop_id is distinct from v_work_order.shop_id
     or v_receipt.work_order_id is distinct from v_work_order.id
     or v_receipt.quote_line_id is distinct from p_quote_line_id
     or v_receipt.action is distinct from 'decline'
     or v_receipt.request_sha256 is distinct from v_request_sha256 then
    raise exception using
      errcode = '23505',
      message = 'DEFERRED_RECOMMENDATION_ID_CONFLICT';
  end if;

  if not v_receipt_inserted then
    select quote_line.id
      into v_existing_quote_line_id
    from public.work_order_quote_lines quote_line
    where quote_line.shop_id = p_shop_id
      and quote_line.work_order_id = p_work_order_id
      and quote_line.source_row_id = p_quote_line_id::text
    order by quote_line.created_at desc
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'quote_line_id', coalesce(v_existing_quote_line_id, p_quote_line_id),
      'idempotent', true
    );
  end if;

  -- Mutual exclusion: once this exact quote line has been consumed by any
  -- prior Add or Decline (both chain their new row to it via source_row_id),
  -- it can never be a valid action target again. Checked only on this fresh
  -- (non-retry) path -- a genuine retry of this same action id is handled by
  -- the receipt/existing-row lookup above and must stay idempotent.
  if exists (
    select 1
    from public.work_order_quote_lines existing
    where existing.shop_id = p_shop_id
      and existing.source_row_id = p_quote_line_id::text
  ) then
    raise exception using
      errcode = '55000',
      message = 'DEFERRED_RECOMMENDATION_ALREADY_ACTIONED';
  end if;

  insert into public.work_order_quote_lines (
    shop_id,
    work_order_id,
    work_order_line_id,
    source_work_order_line_id,
    source_row_id,
    vehicle_id,
    title,
    description,
    line_type,
    status,
    stage,
    decision,
    decline_reason,
    labor_hours,
    est_labor_hours,
    labor_rate,
    labor_total,
    parts_total,
    subtotal,
    discount_total,
    tax_total,
    grand_total,
    metadata,
    declined_at
  ) values (
    v_work_order.shop_id,
    v_work_order.id,
    null,
    v_root_line_id,
    p_quote_line_id,
    v_work_order.vehicle_id,
    v_source_quote.title,
    v_source_quote.description,
    'job',
    'declined',
    'customer_declined',
    'declined',
    v_note,
    coalesce(v_source_quote.labor_hours, 0),
    coalesce(v_source_quote.est_labor_hours, 0),
    v_source_quote.labor_rate,
    coalesce(v_source_quote.labor_total, 0),
    coalesce(v_source_quote.parts_total, 0),
    coalesce(v_source_quote.subtotal, 0),
    coalesce(v_source_quote.discount_total, 0),
    coalesce(v_source_quote.tax_total, 0),
    coalesce(v_source_quote.grand_total, 0),
    coalesce(v_source_quote.metadata, '{}'::jsonb) || jsonb_build_object(
      'redeclined_at_visit', true,
      'source_quote_line_id', p_quote_line_id,
      'source_work_order_line_id', v_root_line_id,
      'declined_by_user_id', p_authenticated_user_id
    ),
    now()
  )
  returning id into v_new_quote_line_id;

  return jsonb_build_object('ok', true, 'quote_line_id', v_new_quote_line_id, 'idempotent', false);
end;
$$;

comment on function public.decline_deferred_recommendation(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) is
  'Advisor-initiated: records that the customer declined a prior recommendation again at this visit. Quote-only, chained via source_row_id; no work order line is created. Idempotent per client-supplied action id.';

revoke all on function public.decline_deferred_recommendation(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

grant execute on function public.decline_deferred_recommendation(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) to service_role;

-- ---------------------------------------------------------------------
-- 6. Completed elsewhere: permanently resolve a recommendation without
--    creating any work order line.
-- ---------------------------------------------------------------------

create function public.resolve_deferred_recommendation_elsewhere(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_id uuid,
  p_authenticated_user_id uuid,
  p_actor_profile_id uuid,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_source_quote public.work_order_quote_lines%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_SERVICE_ROLE_REQUIRED';
  end if;

  if p_shop_id is null
     or p_work_order_id is null
     or p_quote_line_id is null
     or p_authenticated_user_id is null
     or p_actor_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_INVALID_ARGUMENT';
  end if;

  select profile.*
    into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id
    and (
      profile.id = p_authenticated_user_id
      or profile.user_id = p_authenticated_user_id
    )
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_ACTOR_FORBIDDEN';
  end if;

  -- Completed elsewhere permanently records a customer outcome, the same
  -- authorization boundary as Decline: lead_hand can manage work orders but
  -- is deliberately excluded from quote/customer-decision authorization.
  v_actor_role := lower(btrim(coalesce(v_actor.role::text, '')));
  if v_actor_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'DEFERRED_RECOMMENDATION_ACTOR_FORBIDDEN';
  end if;

  -- Context/tenant scoping only; this action does not mutate the work
  -- order itself, so an already-closed work order is not a blocker.
  select wo.*
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DEFERRED_RECOMMENDATION_WORK_ORDER_NOT_FOUND';
  end if;

  select quote_line.*
    into v_source_quote
  from public.work_order_quote_lines quote_line
  where quote_line.id = p_quote_line_id
    and quote_line.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DEFERRED_RECOMMENDATION_NOT_FOUND';
  end if;

  if v_source_quote.vehicle_id is distinct from v_work_order.vehicle_id then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_VEHICLE_MISMATCH';
  end if;

  if v_source_quote.resolved_elsewhere_at is not null then
    return jsonb_build_object('ok', true, 'quote_line_id', v_source_quote.id, 'idempotent', true);
  end if;

  -- Only an unresolved declined/deferred recommendation can be closed out
  -- this way -- the same predicate Add and Decline enforce. Without this, any
  -- draft/approved/sent quote line for the shop and vehicle could be marked
  -- permanently resolved, silently suppressing a legitimate recommendation.
  if not (
    lower(coalesce(v_source_quote.status::text, '')) in ('declined', 'deferred')
    or lower(coalesce(v_source_quote.stage::text, '')) in ('customer_declined', 'customer_deferred')
    or lower(coalesce(v_source_quote.decision::text, '')) in ('declined', 'deferred')
  ) then
    raise exception using
      errcode = '22023',
      message = 'DEFERRED_RECOMMENDATION_NOT_UNRESOLVED';
  end if;

  -- Mutual exclusion: once this exact quote line has been consumed by a
  -- prior Add or Decline (both chain their new row to it via source_row_id),
  -- it can never also be closed out as completed elsewhere.
  if exists (
    select 1
    from public.work_order_quote_lines existing
    where existing.shop_id = p_shop_id
      and existing.source_row_id = p_quote_line_id::text
  ) then
    raise exception using
      errcode = '55000',
      message = 'DEFERRED_RECOMMENDATION_ALREADY_ACTIONED';
  end if;

  perform set_config('app.deferred_recommendation_resolving', '1', true);

  update public.work_order_quote_lines
  set resolved_elsewhere_at = now(),
      resolved_elsewhere_by_user_id = p_authenticated_user_id,
      metadata = metadata || jsonb_build_object(
        'resolved_elsewhere_note', v_note,
        'resolved_elsewhere_from_work_order_id', p_work_order_id
      ),
      updated_at = now()
  where id = p_quote_line_id
    and shop_id = p_shop_id;

  perform set_config('app.deferred_recommendation_resolving', '0', true);

  return jsonb_build_object('ok', true, 'quote_line_id', p_quote_line_id, 'idempotent', false);
end;
$$;

comment on function public.resolve_deferred_recommendation_elsewhere(
  uuid, uuid, uuid, uuid, uuid, text
) is
  'Advisor-initiated: permanently marks a prior recommendation resolved because the customer already had it done elsewhere. No work order line is created or changed; naturally idempotent.';

revoke all on function public.resolve_deferred_recommendation_elsewhere(
  uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

grant execute on function public.resolve_deferred_recommendation_elsewhere(
  uuid, uuid, uuid, uuid, uuid, text
) to service_role;

notify pgrst, 'reload schema';

commit;
