-- Fixes from review of the vehicle-pickup migrations (20260928010000,
-- 20260928020000, 20260928040000):
--
-- 1. history.shop_id is referenced unconditionally by both the existing
--    paid-closeout trigger and the new pickup trigger, but no migration in
--    this repository ever adds it - it exists in production only because it
--    was added out of band. A clean-replay environment would 500 the first
--    time either trigger fires. Add it defensively; this is additive and
--    idempotent, and fixes both triggers going forward without touching the
--    already-applied migration that first depended on it.
-- 2. mark_work_order_picked_up_atomic: updated_at must track transaction
--    time, not the (possibly backdated/forward-dated) pickup timestamp -
--    every surface that orders/ages work orders by updated_at would
--    otherwise reorder or hide current work. A non-customer collector must
--    be named, since an unnamed "authorized representative" or "fleet
--    driver" is not a usable handover record. The unpaid-release reason
--    belongs in the immutable audit entry too, since reversal clears it off
--    the work_orders row.
-- 3. reverse_work_order_pickup_atomic left public.history untouched, so a
--    reversed, unpaid pickup stayed permanently visible in customer/shop
--    history as picked up while the work order simultaneously went back to
--    active. Reversal now removes a pickup-only history row (nothing else
--    closed it out) or, if the visit is also paid, clears only the pickup
--    fields on that row and leaves the paid closeout intact.
-- 4. payment_receipt_object_in_shop used a hard-coded role list instead of
--    the established capability chain
--    (20260824020000_enforce_work_order_financial_read_boundaries.sql), so a
--    role whose invoice capability was explicitly revoked would still pass.
--    Switch it to workspace_actor_has_capability, and gate the attachment
--    table's own RLS the same way the sibling financial tables already are.

begin;

alter table public.history
  add column if not exists shop_id uuid;

create or replace function public.mark_work_order_picked_up_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_collected_by_type text,
  p_collected_by_name text default null,
  p_notes text default null,
  p_override_unpaid boolean default false,
  p_release_reason text default null,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_work_order public.work_orders%rowtype;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_actor_auth_user_id uuid;
  v_now timestamptz := coalesce(p_at, now());
  v_collected_by_type text := lower(trim(coalesce(p_collected_by_type, '')));
  v_collected_by_name text := nullif(trim(coalesce(p_collected_by_name, '')), '');
  v_released_unpaid boolean;
begin
  select p.id,
         lower(trim(coalesce(p.role, ''))),
         coalesce(p.user_id, p.id)
    into v_actor_profile_id, v_actor_role, v_actor_auth_user_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found
    or v_actor_auth_user_id is distinct from p_actor_user_id
    or not exists (select 1 from auth.users u where u.id = v_actor_auth_user_id)
    or (auth.uid() is not null and auth.uid() is distinct from v_actor_auth_user_id)
  then
    raise exception using errcode = 'P0001', message = 'PICKUP_FORBIDDEN: actor is not available for this shop.';
  end if;

  if v_actor_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor',
    'service advisor', 'lead_hand', 'leadhand', 'lead hand', 'lead', 'foreman'
  ) then
    raise exception using errcode = 'P0001', message = 'PICKUP_FORBIDDEN: actor cannot confirm vehicle handover.';
  end if;

  if v_collected_by_type not in ('customer', 'authorized_representative', 'fleet_driver') then
    raise exception using errcode = 'P0001', message = 'PICKUP_INVALID_COLLECTED_BY: collected_by_type must be customer, authorized_representative, or fleet_driver.';
  end if;

  if v_collected_by_type <> 'customer' and v_collected_by_name is null then
    raise exception using errcode = 'P0001', message = 'PICKUP_COLLECTOR_NAME_REQUIRED: a name is required when the collector is not the customer.';
  end if;

  select *
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_NOT_FOUND: work order not found for shop.';
  end if;

  if v_work_order.picked_up_at is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'picked_up', true,
      'work_order_id', v_work_order.id,
      'customer_id', v_work_order.customer_id,
      'picked_up_at', v_work_order.picked_up_at,
      'picked_up_by_user_id', v_work_order.picked_up_by_user_id
    );
  end if;

  if v_work_order.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'PICKUP_WORK_ORDER_ARCHIVED: archived work orders cannot be marked picked up.';
  end if;

  if lower(trim(coalesce(v_work_order.status, ''))) not in ('completed', 'ready_to_invoice', 'invoiced') then
    raise exception using errcode = 'P0001', message = 'PICKUP_NOT_READY: work order is not ready for vehicle handover yet.';
  end if;

  v_released_unpaid := coalesce(v_work_order.payment_status, 'unpaid') <> 'paid';

  if v_released_unpaid then
    if not coalesce(p_override_unpaid, false) then
      raise exception using errcode = 'P0001', message = 'PICKUP_UNPAID_BALANCE_REQUIRES_OVERRIDE: an authorized override with a reason is required to release an unpaid vehicle.';
    end if;
    if coalesce(trim(p_release_reason), '') = '' then
      raise exception using errcode = 'P0001', message = 'PICKUP_RELEASE_REASON_REQUIRED: a reason is required to release an unpaid vehicle.';
    end if;
  else
    v_released_unpaid := false;
  end if;

  perform set_config('app.work_order_pickup_writing', '1', true);

  update public.work_orders
  set picked_up_at = v_now,
      picked_up_by_user_id = v_actor_auth_user_id,
      collected_by_type = v_collected_by_type,
      collected_by_name = v_collected_by_name,
      pickup_notes = nullif(trim(coalesce(p_notes, '')), ''),
      pickup_released_unpaid = v_released_unpaid,
      pickup_release_reason = case when v_released_unpaid then nullif(trim(p_release_reason), '') else null end,
      pickup_release_authorized_by_user_id = case when v_released_unpaid then v_actor_auth_user_id else null end,
      updated_at = now()
  where id = p_work_order_id
    and shop_id = p_shop_id;

  perform set_config('app.work_order_pickup_writing', '0', true);

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'work_order_picked_up',
    v_actor_auth_user_id,
    v_now,
    'work_orders',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'status_preserved', v_work_order.status,
      'customer_id', v_work_order.customer_id,
      'vehicle_id', v_work_order.vehicle_id,
      'collected_by_type', v_collected_by_type,
      'collected_by_name', v_collected_by_name,
      'released_unpaid', v_released_unpaid,
      'release_reason', case when v_released_unpaid then p_release_reason else null end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'picked_up', true,
    'work_order_id', p_work_order_id,
    'customer_id', v_work_order.customer_id,
    'picked_up_at', v_now,
    'picked_up_by_user_id', v_actor_auth_user_id
  );
end;
$function$;

create or replace function public.reverse_work_order_pickup_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_work_order public.work_orders%rowtype;
  v_actor_role text;
  v_actor_auth_user_id uuid;
  v_now timestamptz := now();
  v_history_id uuid;
  v_history_status text;
begin
  select lower(trim(coalesce(p.role, ''))),
         coalesce(p.user_id, p.id)
    into v_actor_role, v_actor_auth_user_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found
    or v_actor_auth_user_id is distinct from p_actor_user_id
    or not exists (select 1 from auth.users u where u.id = v_actor_auth_user_id)
    or (auth.uid() is not null and auth.uid() is distinct from v_actor_auth_user_id)
  then
    raise exception using errcode = 'P0001', message = 'PICKUP_REVERSAL_FORBIDDEN: actor is not available for this shop.';
  end if;

  if v_actor_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor',
    'service advisor', 'lead_hand', 'leadhand', 'lead hand', 'lead', 'foreman'
  ) then
    raise exception using errcode = 'P0001', message = 'PICKUP_REVERSAL_FORBIDDEN: actor cannot reverse vehicle handover.';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'PICKUP_REVERSAL_REASON_REQUIRED: a reason is required to reverse a pickup confirmation.';
  end if;

  select *
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_NOT_FOUND: work order not found for shop.';
  end if;

  if v_work_order.picked_up_at is null then
    raise exception using errcode = 'P0001', message = 'PICKUP_NOT_CONFIRMED: this work order has no pickup confirmation to reverse.';
  end if;

  -- Undo whatever the pickup trigger projected into history. A row whose
  -- historical_status is still 'picked_up' exists only because of this
  -- pickup (no payment closed it out), so reversing pickup removes it
  -- entirely; a 'paid' row's closeout stands and only the pickup fields on
  -- it are cleared.
  select h.id, h.historical_status
    into v_history_id, v_history_status
  from public.history h
  where h.work_order_id = p_work_order_id
  order by h.created_at asc nulls last, h.id
  limit 1
  for update;

  if v_history_id is not null then
    if coalesce(v_history_status, '') = 'paid' then
      update public.history
      set picked_up_at = null,
          collected_by_type = null,
          collected_by_name = null
      where id = v_history_id;
    else
      delete from public.history where id = v_history_id;
    end if;
  end if;

  perform set_config('app.work_order_pickup_writing', '1', true);

  update public.work_orders
  set picked_up_at = null,
      picked_up_by_user_id = null,
      collected_by_type = null,
      collected_by_name = null,
      pickup_notes = null,
      pickup_released_unpaid = false,
      pickup_release_reason = null,
      pickup_release_authorized_by_user_id = null,
      updated_at = v_now
  where id = p_work_order_id
    and shop_id = p_shop_id;

  perform set_config('app.work_order_pickup_writing', '0', true);

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'work_order_pickup_reversed',
    v_actor_auth_user_id,
    v_now,
    'work_orders',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'reason', p_reason,
      'previous_picked_up_at', v_work_order.picked_up_at,
      'previous_collected_by_type', v_work_order.collected_by_type,
      'previous_collected_by_name', v_work_order.collected_by_name,
      'history_row_removed', v_history_id is not null and coalesce(v_history_status, '') <> 'paid'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'reversed', true,
    'work_order_id', p_work_order_id,
    'reversed_at', v_now
  );
end;
$function$;

create or replace function public.sync_picked_up_work_order_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_history_id uuid;
  v_description text;
  v_causes text;
  v_corrections text;
  v_labor_hours numeric := 0;
  v_advisor_name text;
  v_technician_name text;
  v_notes text;
  v_odometer numeric;
begin
  if new.picked_up_at is null or new.customer_id is null then
    return new;
  end if;

  select h.id
  into v_history_id
  from public.history h
  where h.work_order_id = new.id
  order by h.created_at asc nulls last, h.id
  limit 1
  for update;

  if v_history_id is not null then
    -- A row already exists (most likely from the paid-closeout trigger).
    -- Only touch the pickup-specific columns so we never clobber payment
    -- fields that trigger already set.
    update public.history
    set picked_up_at = new.picked_up_at,
        collected_by_type = new.collected_by_type,
        collected_by_name = new.collected_by_name,
        historical_status = case
          when coalesce(historical_status, '') = 'paid' then 'paid'
          else 'picked_up'
        end
    where id = v_history_id;

    return new;
  end if;

  -- No history row yet: this is a pickup that happened ahead of (or without)
  -- payment settlement. Build a full row the same way the paid trigger does,
  -- so shop/vehicle history reads consistently regardless of which event
  -- created the record first.
  select i.*
  into v_invoice
  from public.invoices i
  where i.work_order_id = new.id
    and i.shop_id = new.shop_id
  order by
    (i.active_invoice_version_id is not null) desc,
    i.issued_at desc nulls last,
    i.created_at desc
  limit 1;

  select
    pg_catalog.string_agg(
      nullif(pg_catalog.concat_ws(
        ' / ',
        nullif(pg_catalog.btrim(wol.description), ''),
        nullif(pg_catalog.btrim(wol.complaint), ''),
        nullif(pg_catalog.btrim(wol.cause), ''),
        nullif(pg_catalog.btrim(wol.correction), '')
      ), ''),
      E'\n' order by wol.created_at, wol.id
    ),
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.cause), ''), E'\n'
    ),
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.correction), ''), E'\n'
    ),
    coalesce(pg_catalog.sum(wol.labor_time), 0)
  into v_description, v_causes, v_corrections, v_labor_hours
  from public.work_order_lines wol
  where wol.work_order_id = new.id
    and wol.voided_at is null;

  select nullif(pg_catalog.btrim(p.full_name), '')
  into v_advisor_name
  from public.profiles p
  where p.id = new.advisor_id;

  select pg_catalog.string_agg(distinct nullif(pg_catalog.btrim(p.full_name), ''), ', ')
  into v_technician_name
  from public.work_order_lines wol
  left join public.work_order_line_technicians wolt
    on wolt.work_order_line_id = wol.id
  left join public.profiles p
    on p.id = coalesce(wolt.technician_id, wol.assigned_tech_id, wol.assigned_to)
  where wol.work_order_id = new.id
    and wol.voided_at is null;

  begin
    select nullif(pg_catalog.regexp_replace(coalesce(v.mileage, ''), '[^0-9.]', '', 'g'), '')::numeric
    into v_odometer
    from public.vehicles v
    where v.id = new.vehicle_id;
  exception when others then
    v_odometer := null;
  end;

  v_description := coalesce(
    nullif(pg_catalog.btrim(v_description), ''),
    nullif(pg_catalog.btrim(new.notes), ''),
    'Completed work order ' || coalesce(new.custom_id, new.id::text)
  );

  -- The unpaid-release reason is an internal authorization record, not a
  -- customer-facing note - it stays only on work_orders.pickup_release_reason
  -- (audited separately in activity_logs), never copied into history.notes,
  -- which /portal/history renders close to verbatim.
  v_notes := pg_catalog.concat_ws(
    E'\n',
    'Work order: ' || coalesce(new.custom_id, new.id::text),
    case when v_invoice.invoice_number is not null
      then 'Invoice: ' || v_invoice.invoice_number else null end,
    nullif(pg_catalog.btrim(new.notes), '')
  );

  insert into public.history(
    customer_id,
    vehicle_id,
    work_order_id,
    service_date,
    description,
    notes,
    source_system,
    source_external_id,
    work_order_number,
    invoice_number,
    opened_at,
    closed_at,
    historical_status,
    advisor_name,
    assigned_tech_name,
    priority,
    odometer,
    cause,
    correction,
    labor_hours,
    labor_sale,
    parts_sale,
    shop_supplies,
    discount,
    tax,
    total,
    approval_state,
    payment_state,
    picked_up_at,
    collected_by_type,
    collected_by_name,
    source_payload,
    shop_id
  ) values (
    new.customer_id,
    new.vehicle_id,
    new.id,
    new.picked_up_at,
    v_description,
    v_notes,
    'profixiq_live',
    new.id::text,
    new.custom_id,
    v_invoice.invoice_number,
    new.created_at,
    new.picked_up_at,
    'picked_up',
    v_advisor_name,
    v_technician_name,
    new.priority::text,
    v_odometer,
    v_causes,
    v_corrections,
    v_labor_hours,
    coalesce(v_invoice.labor_cost, new.labor_total, 0),
    coalesce(v_invoice.parts_cost, new.parts_total, 0),
    coalesce(v_invoice.shop_supplies_total, 0),
    coalesce(v_invoice.discount_total, 0),
    coalesce(v_invoice.tax_total, 0),
    coalesce(v_invoice.total, new.invoice_total, 0),
    new.approval_state,
    new.payment_status,
    new.picked_up_at,
    new.collected_by_type,
    new.collected_by_name,
    pg_catalog.jsonb_build_object(
      'work_order_id', new.id,
      'invoice_id', v_invoice.id,
      'closed_from', 'vehicle_pickup'
    ),
    new.shop_id
  );

  return new;
end;
$function$;

-- Receipt storage/table access now follows the same capability chain as the
-- other financial tables (payment_events/payment_receipts/payments), rather
-- than a hard-coded role list that would not see an explicit per-role deny.
create or replace function public.payment_receipt_object_in_shop(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_orders w
    where w.id = p_work_order_id
      and public.workspace_actor_has_capability(w.shop_id, 'work_order.invoice.view')
  );
$$;

-- Keep the original permissive shop-membership policy (a restrictive policy
-- narrows an existing permissive grant, it never grants access on its own -
-- replacing the only policy on this table with `as restrictive` would lock
-- every reader out entirely) and add the capability gate alongside it.
drop policy if exists payment_receipt_attachments_shop_capability_select
  on public.payment_receipt_attachments;
create policy payment_receipt_attachments_shop_capability_select
on public.payment_receipt_attachments
as restrictive
for select
to authenticated
using (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(shop_id, 'work_order.invoice.view')
);

commit;
