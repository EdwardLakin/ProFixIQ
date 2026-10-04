begin;

-- Customer portal parts quote requests: a customer asks the shop to quote
-- parts only. The request is anchored here (no work order) and is priced and
-- ordered through the shop Parts system via a linked public.part_requests row.
create table if not exists public.portal_parts_quote_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  part_request_id uuid references public.part_requests(id) on delete set null,
  status text not null default 'requested',
  description text not null,
  notes text,
  qty numeric not null default 1,
  operation_key text not null,
  currency text not null default 'cad',
  subtotal numeric(12, 2),
  tax_rate numeric(6, 3),
  tax_total numeric(12, 2),
  total numeric(12, 2),
  priced_items jsonb not null default '[]'::jsonb,
  quoted_at timestamptz,
  send_claimed_at timestamptz,
  sent_at timestamptz,
  email_sent_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  approval_choice text,
  paid_at timestamptz,
  amount_paid_cents integer,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_connected_account_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_parts_quote_requests_status_check
    check (status in ('requested', 'quoted', 'sent', 'approved', 'declined', 'cancelled')),
  constraint portal_parts_quote_requests_choice_check
    check (approval_choice is null or approval_choice in ('order_parts', 'book_install')),
  constraint portal_parts_quote_requests_description_check
    check (length(trim(description)) > 0),
  constraint portal_parts_quote_requests_qty_check
    check (qty > 0),
  constraint portal_parts_quote_requests_amounts_check
    check (
      (subtotal is null or subtotal >= 0)
      and (tax_total is null or tax_total >= 0)
      and (total is null or total >= 0)
    )
);

create unique index if not exists portal_parts_quote_requests_operation_key_unique
  on public.portal_parts_quote_requests (operation_key);
create unique index if not exists portal_parts_quote_requests_part_request_unique
  on public.portal_parts_quote_requests (part_request_id);
create unique index if not exists portal_parts_quote_requests_checkout_session_unique
  on public.portal_parts_quote_requests (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create index if not exists portal_parts_quote_requests_shop_status_idx
  on public.portal_parts_quote_requests (shop_id, status, created_at desc);
create index if not exists portal_parts_quote_requests_customer_idx
  on public.portal_parts_quote_requests (customer_id, created_at desc);

drop trigger if exists trg_portal_parts_quote_requests_updated_at
  on public.portal_parts_quote_requests;
create trigger trg_portal_parts_quote_requests_updated_at
  before update on public.portal_parts_quote_requests
  for each row execute function public.set_updated_at();

alter table public.portal_parts_quote_requests enable row level security;

drop policy if exists portal_parts_quote_requests_customer_select
  on public.portal_parts_quote_requests;
create policy portal_parts_quote_requests_customer_select
  on public.portal_parts_quote_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.customers c
      where c.id = portal_parts_quote_requests.customer_id
        and c.shop_id = portal_parts_quote_requests.shop_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists portal_parts_quote_requests_staff_select
  on public.portal_parts_quote_requests;
create policy portal_parts_quote_requests_staff_select
  on public.portal_parts_quote_requests
  for select to authenticated
  using (
    shop_id in (
      select p.shop_id
      from public.profiles p
      where p.id = (select auth.uid())
    )
  );

-- Writes happen only through reviewed server functions running as service_role
-- or security-definer RPCs; clients get read access scoped by the policies above.
revoke all on table public.portal_parts_quote_requests from public, anon, authenticated;
grant select on table public.portal_parts_quote_requests to authenticated;
grant all on table public.portal_parts_quote_requests to service_role;

-- Additive integration with the shared Parts lifecycle.
--
-- A portal parts quote request has no work order, so the existing approval
-- anchors (approved quote line / approved work-order line) can never be true
-- for it, and the reconciler would revert a customer-approved request to
-- 'quoted' and block ordering (PARTS_APPROVAL_REQUIRED). The only change
-- below is the v_portal_status lookup and the two OR-ed assignments after it;
-- every other statement is the unchanged live definition.
create or replace function public.parts_reconcile_request_lifecycle(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request public.part_requests%rowtype;
  v_quote_status text := '';
  v_quote_stage text := '';
  v_quote_approved boolean := false;
  v_quote_declined boolean := false;
  v_quote_deferred boolean := false;
  v_line_approved boolean := false;
  v_portal_status text := '';
  v_item_count integer := 0;
  v_all_priced boolean := false;
  v_all_handed_off boolean := false;
  v_old_stage text;
  v_new_stage text;
  v_new_status public.part_request_status;
  v_link_result jsonb := '{}'::jsonb;
  v_previous_guard text := coalesce(
    current_setting('app.parts_lifecycle_reconciling', true),
    '0'
  );
begin
  select * into v_request
  from public.part_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'request_not_found');
  end if;

  v_old_stage := public.parts_request_operational_stage(p_request_id);
  perform set_config('app.parts_lifecycle_reconciling', '1', true);

  if v_request.quote_line_id is not null then
    select lower(coalesce(q.status::text, '')),
           lower(coalesce(q.stage::text, '')),
           (
             q.approved_at is not null
             or q.work_order_line_id is not null
             or lower(coalesce(q.status::text, '')) in ('approved', 'converted')
             or lower(coalesce(q.stage::text, '')) = 'customer_approved'
           ),
           (
             lower(coalesce(q.status::text, '')) in (
               'declined', 'rejected', 'cancelled'
             )
             or lower(coalesce(q.stage::text, '')) = 'customer_declined'
           ),
           (
             lower(coalesce(q.status::text, '')) = 'deferred'
             or lower(coalesce(q.stage::text, '')) = 'customer_deferred'
           )
      into v_quote_status, v_quote_stage, v_quote_approved,
           v_quote_declined, v_quote_deferred
    from public.work_order_quote_lines q
    where q.id = v_request.quote_line_id
      and q.shop_id = v_request.shop_id
      and q.work_order_id = v_request.work_order_id;
  end if;

  select coalesce(lower(pq.status), '')
    into v_portal_status
  from public.portal_parts_quote_requests pq
  where pq.part_request_id = p_request_id
    and pq.shop_id = v_request.shop_id;
  v_portal_status := coalesce(v_portal_status, '');
  v_quote_approved := v_quote_approved or v_portal_status = 'approved';
  v_quote_declined := v_quote_declined or v_portal_status in ('declined', 'cancelled');

  if v_request.job_id is not null then
    select exists (
      select 1
      from public.work_order_lines wol
      where wol.id = v_request.job_id
        and wol.shop_id = v_request.shop_id
        and wol.work_order_id = v_request.work_order_id
        and (
          lower(coalesce(wol.approval_state::text, '')) = 'approved'
          or lower(coalesce(wol.line_status::text, '')) = 'authorized'
        )
    ) into v_line_approved;
  end if;

  select
    count(*),
    coalesce(bool_and(public.part_request_item_is_quote_ready(
      pri.description,
      pri.part_id,
      pri.requested_part_number,
      pri.requested_manufacturer,
      greatest(
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0),
        0
      ),
      coalesce(pri.quoted_price, pri.unit_price)
    )), false),
    coalesce(bool_and(
      greatest(
        coalesce(pri.qty_consumed, 0) - coalesce(pri.qty_returned, 0),
        0
      ) >= greatest(
        coalesce(pri.qty_approved, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0),
        0
      )
    ), false)
  into v_item_count, v_all_priced, v_all_handed_off
  from public.part_request_items pri
  where pri.request_id = p_request_id
    and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled';

  if lower(v_request.status::text) in ('fulfilled', 'returned', 'cancelled') then
    v_new_status := v_request.status;
  elsif v_request.handoff_completed_at is not null
        or (v_item_count > 0 and v_all_handed_off) then
    v_new_status := 'fulfilled';
  elsif v_quote_approved then
    v_new_status := 'approved';
  elsif v_quote_declined then
    v_new_status := 'rejected';
  elsif v_quote_deferred then
    v_new_status := 'deferred';
  elsif lower(v_request.status::text) in ('rejected', 'deferred') then
    v_new_status := v_request.status;
  elsif v_line_approved then
    v_new_status := 'approved';
  elsif v_item_count > 0 and v_all_priced then
    v_new_status := 'quoted';
  else
    v_new_status := 'requested';
  end if;

  if v_new_status::text = 'quoted'
     and not v_line_approved
     and v_request.job_id is not null
     and v_request.quote_line_id is null then
    v_link_result := public.parts_ensure_request_quote_line(p_request_id);
    if coalesce((v_link_result ->> 'ok')::boolean, false)
       and nullif(v_link_result ->> 'quote_line_id', '') is not null then
      select * into v_request
      from public.part_requests
      where id = p_request_id
      for update;
    end if;
  end if;

  if v_new_status::text not in ('fulfilled', 'returned') then
    update public.part_request_items pri
    set status = case
          when v_new_status::text in (
            'rejected', 'cancelled', 'deferred'
          ) then 'cancelled'::public.part_request_item_status
          when v_new_status::text = 'approved'
            then 'approved'::public.part_request_item_status
          when v_new_status::text = 'quoted'
               and coalesce(pri.quote_line_id, v_request.quote_line_id) is not null
            then 'awaiting_customer_approval'::public.part_request_item_status
          when v_new_status::text = 'quoted'
            then 'quoted'::public.part_request_item_status
          else 'requested'::public.part_request_item_status
        end,
        approved = v_new_status::text = 'approved',
        qty_approved = case
          when v_new_status::text = 'approved' then greatest(
            coalesce(pri.qty_approved, 0),
            coalesce(pri.qty_requested, 0),
            coalesce(pri.qty, 0),
            0
          )
          else 0
        end,
        updated_at = now()
    where pri.request_id = p_request_id
      and coalesce(pri.qty_ordered, 0) = 0
      and coalesce(pri.qty_received, 0) = 0
      and coalesce(pri.qty_reserved, 0) = 0
      and coalesce(pri.qty_consumed, 0) = 0
      and coalesce(pri.qty_returned, 0) = 0
      and pri.po_id is null
      and lower(coalesce(pri.status::text, 'requested')) not in (
        'ordered', 'partially_ordered', 'partially_received', 'received',
        'reserved', 'picking', 'picked', 'partially_consumed', 'consumed',
        'partially_returned', 'returned'
      )
      and (
        v_new_status::text in (
          'approved', 'rejected', 'cancelled', 'deferred', 'requested'
        )
        or (
          v_new_status::text = 'quoted'
          and public.part_request_item_is_quote_ready(
            pri.description,
            pri.part_id,
            pri.requested_part_number,
            pri.requested_manufacturer,
            greatest(
              coalesce(pri.qty_requested, 0),
              coalesce(pri.qty, 0),
              0
            ),
            coalesce(pri.quoted_price, pri.unit_price)
          )
        )
      );
  end if;

  update public.part_requests
  set status = v_new_status,
      handoff_completed_at = case
        when v_new_status::text = 'fulfilled'
          then coalesce(handoff_completed_at, now())
        else handoff_completed_at
      end,
      handoff_completed_by = case
        when v_new_status::text = 'fulfilled'
          then coalesce(handoff_completed_by, auth.uid())
        else handoff_completed_by
      end
  where id = p_request_id
    and (
      status is distinct from v_new_status
      or (v_new_status::text = 'fulfilled' and handoff_completed_at is null)
    );

  if v_request.quote_line_id is not null then
    perform public.sync_quote_line_pricing_from_parts(
      v_request.shop_id,
      v_request.quote_line_id
    );
  end if;

  v_new_stage := public.parts_request_operational_stage(p_request_id);
  perform public.parts_publish_request_notification(p_request_id, v_new_stage);
  perform set_config(
    'app.parts_lifecycle_reconciling',
    v_previous_guard,
    true
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'quote_line_id', v_request.quote_line_id,
    'request_status', v_new_status,
    'previous_stage', v_old_stage,
    'stage', v_new_stage,
    'item_count', v_item_count,
    'all_priced', v_all_priced,
    'approved', v_quote_approved or v_line_approved,
    'linkage', v_link_result
  );
exception when others then
  perform set_config(
    'app.parts_lifecycle_reconciling',
    v_previous_guard,
    true
  );
  raise;
end;
$function$;

commit;
