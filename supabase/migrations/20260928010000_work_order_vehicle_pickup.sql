-- Vehicle pickup / handover is a third, independent event alongside "repairs
-- completed" and "invoice paid": a shop may release a vehicle before the
-- invoice is finalized or paid (terms, fleet accounts), and paying in full
-- never implies the customer has actually collected the vehicle. Nothing in
-- the schema represents this today - work_orders.status stays in the
-- 'invoiced' lane (set by finalize_invoice_version) regardless of whether the
-- car is still on the lot, and payment_status/paid_at (phase1 financial
-- rollups) are payment-only. This migration adds pickup as its own set of
-- columns, guarded the same way archive_work_order_atomic guards
-- archived_at: a security-definer RPC is the only writer, enforced by a
-- write-boundary trigger, so no direct client UPDATE can forge a handover.

begin;

alter table public.work_orders
  add column if not exists picked_up_at timestamptz,
  add column if not exists picked_up_by_user_id uuid,
  add column if not exists collected_by_type text,
  add column if not exists collected_by_name text,
  add column if not exists pickup_notes text,
  add column if not exists pickup_released_unpaid boolean not null default false,
  add column if not exists pickup_release_reason text,
  add column if not exists pickup_release_authorized_by_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'work_orders_collected_by_type_check'
      and conrelid = 'public.work_orders'::regclass
  ) then
    alter table public.work_orders
      add constraint work_orders_collected_by_type_check
      check (
        collected_by_type is null
        or collected_by_type in ('customer', 'authorized_representative', 'fleet_driver')
      );
  end if;
end $$;

create index if not exists work_orders_shop_picked_up_at_idx
  on public.work_orders (shop_id, picked_up_at desc)
  where picked_up_at is not null;

-- Pickup state changes only through mark_work_order_picked_up_atomic /
-- reverse_work_order_pickup_atomic, same rationale as the archive boundary:
-- work_orders keeps a broad authenticated UPDATE policy, so without this
-- guard any such client could set picked_up_at directly and skip the
-- eligibility, unpaid-override, and audit-logging checks below.
create or replace function public.enforce_work_order_pickup_write_boundary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.picked_up_at is distinct from old.picked_up_at
     or new.picked_up_by_user_id is distinct from old.picked_up_by_user_id
     or new.collected_by_type is distinct from old.collected_by_type
     or new.collected_by_name is distinct from old.collected_by_name
     or new.pickup_notes is distinct from old.pickup_notes
     or new.pickup_released_unpaid is distinct from old.pickup_released_unpaid
     or new.pickup_release_reason is distinct from old.pickup_release_reason
     or new.pickup_release_authorized_by_user_id is distinct from old.pickup_release_authorized_by_user_id
  then
    if coalesce(current_setting('app.work_order_pickup_writing', true), '0') <> '1' then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_PICKUP_DIRECT_WRITE: pickup state changes only through mark_work_order_picked_up_atomic.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists work_orders_enforce_pickup_write_boundary on public.work_orders;
create trigger work_orders_enforce_pickup_write_boundary
  before update on public.work_orders
  for each row
  execute function public.enforce_work_order_pickup_write_boundary();

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

  if coalesce(v_work_order.payment_status, 'unpaid') <> 'paid' then
    if not coalesce(p_override_unpaid, false) then
      raise exception using errcode = 'P0001', message = 'PICKUP_UNPAID_BALANCE_REQUIRES_OVERRIDE: an authorized override with a reason is required to release an unpaid vehicle.';
    end if;
    if coalesce(trim(p_release_reason), '') = '' then
      raise exception using errcode = 'P0001', message = 'PICKUP_RELEASE_REASON_REQUIRED: a reason is required to release an unpaid vehicle.';
    end if;
  end if;

  perform set_config('app.work_order_pickup_writing', '1', true);

  update public.work_orders
  set picked_up_at = v_now,
      picked_up_by_user_id = v_actor_auth_user_id,
      collected_by_type = v_collected_by_type,
      collected_by_name = nullif(trim(coalesce(p_collected_by_name, '')), ''),
      pickup_notes = nullif(trim(coalesce(p_notes, '')), ''),
      pickup_released_unpaid = coalesce(p_override_unpaid, false) and coalesce(v_work_order.payment_status, 'unpaid') <> 'paid',
      pickup_release_reason = case
        when coalesce(p_override_unpaid, false) and coalesce(v_work_order.payment_status, 'unpaid') <> 'paid'
          then nullif(trim(p_release_reason), '')
        else null
      end,
      pickup_release_authorized_by_user_id = case
        when coalesce(p_override_unpaid, false) and coalesce(v_work_order.payment_status, 'unpaid') <> 'paid'
          then v_actor_auth_user_id
        else null
      end,
      updated_at = v_now
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
      'collected_by_name', p_collected_by_name,
      'released_unpaid', coalesce(p_override_unpaid, false) and coalesce(v_work_order.payment_status, 'unpaid') <> 'paid'
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

revoke all on function public.mark_work_order_picked_up_atomic(uuid, uuid, uuid, text, text, text, boolean, text, timestamptz) from public;
revoke all on function public.mark_work_order_picked_up_atomic(uuid, uuid, uuid, text, text, text, boolean, text, timestamptz) from anon;
grant execute on function public.mark_work_order_picked_up_atomic(uuid, uuid, uuid, text, text, text, boolean, text, timestamptz) to authenticated;
grant execute on function public.mark_work_order_picked_up_atomic(uuid, uuid, uuid, text, text, text, boolean, text, timestamptz) to service_role;

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
      'previous_collected_by_name', v_work_order.collected_by_name
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

revoke all on function public.reverse_work_order_pickup_atomic(uuid, uuid, uuid, text) from public;
revoke all on function public.reverse_work_order_pickup_atomic(uuid, uuid, uuid, text) from anon;
grant execute on function public.reverse_work_order_pickup_atomic(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.reverse_work_order_pickup_atomic(uuid, uuid, uuid, text) to service_role;

commit;
