\set ON_ERROR_STOP on

-- Regression for 20260929010000_allow_vehicle_pickup_after_financial_lock.sql.
--
-- mark_work_order_picked_up_atomic/reverse_work_order_pickup_atomic
-- (20260928010000_work_order_vehicle_pickup.sql) write picked_up_at and
-- related columns on work_orders from inside a set_config(
-- 'app.work_order_pickup_writing', ...) boundary. guard_financially_locked_
-- work_order never exempted those columns, so once a work order had a
-- non-draft invoice version (the normal, common case for a shop that
-- invoices before releasing the vehicle), the RPC's own update was rejected
-- with WORK_ORDER_FINANCIALLY_LOCKED before the RPC could ever return
-- successfully. This proves: the RPC succeeds and reverses cleanly against a
-- financially-locked work order, and that an equivalent raw update against
-- the same locked work order -- for a pickup column with the write-boundary
-- flag unset, and for an ordinary operational field regardless of the flag
-- -- is still rejected exactly as before.
--
-- work_orders_status_check (schema baseline) only permits status in ('new',
-- 'awaiting', 'awaiting_approval', 'queued', 'in_progress', 'on_hold',
-- 'planned', 'completed') -- 'ready_to_invoice'/'invoiced' are not valid
-- work_orders.status values anywhere in this migration history, even though
-- mark_work_order_picked_up_atomic's own readiness check also accepts them;
-- those two branches of that check are unreachable given the current schema.
-- 'completed' is the one status both that check and the CHECK constraint
-- agree on, so it -- combined with a non-draft invoice_version, which is
-- what actually drives work_order_is_financially_locked, independent of
-- work_orders.status -- is what reproduces the real, reachable regression.

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '9f100000-0000-4000-8000-000000000001',
  'pickup-lock-owner@example.com',
  '{}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values (
  '9f100000-0000-4000-8000-000000000001',
  '9f100000-0000-4000-8000-000000000001',
  'owner',
  'Pickup Lock Owner'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values (
  '9f200000-0000-4000-8000-000000000002',
  '9f100000-0000-4000-8000-000000000001',
  'Pickup Lock Shop',
  'Pickup Lock Shop'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = '9f200000-0000-4000-8000-000000000002'
where id = '9f100000-0000-4000-8000-000000000001';

-- work_orders.payment_status is not set here: invoice_versions_sync_financial_rollup
-- (20260714013300) recomputes and overwrites it from the invoice version's
-- lifecycle_status/paid_total on every insert/update below, so any value
-- assigned on this row would just be clobbered.
insert into public.work_orders (id, shop_id, status)
values (
  '9f300000-0000-4000-8000-000000000003',
  '9f200000-0000-4000-8000-000000000002',
  'completed'
);

insert into public.invoices (id, shop_id, work_order_id, invoice_number, status)
values (
  '9f400000-0000-4000-8000-000000000004',
  '9f200000-0000-4000-8000-000000000002',
  '9f300000-0000-4000-8000-000000000003',
  'INV-PICKUP-LOCK',
  'issued'
);

-- A non-draft invoice version is what work_order_financial_lock_state reads to
-- derive 'locked' (lifecycle_status <> 'draft' -- independent of work_orders.
-- status). lifecycle_status = 'paid' with paid_total = total is used, rather
-- than 'issued', so invoice_versions_sync_financial_rollup's after-insert
-- rollup lands work_orders.payment_status on 'paid': that keeps this test on
-- the plain happy path instead of the RPC's separate unpaid-release override
-- flow (PICKUP_UNPAID_BALANCE_REQUIRES_OVERRIDE), which is a distinct,
-- already-covered concern, not what this regression is about. outstanding_
-- total is a generated column (greatest(total - paid_total + refunded_total,
-- 0)), so it is left out of this insert and computes to 0 here.
insert into public.invoice_versions (
  id, shop_id, work_order_id, invoice_id, version_number,
  lifecycle_status, currency, subtotal, total, paid_total, snapshot, snapshot_hash, issued_at
)
values (
  '9f500000-0000-4000-8000-000000000005',
  '9f200000-0000-4000-8000-000000000002',
  '9f300000-0000-4000-8000-000000000003',
  '9f400000-0000-4000-8000-000000000004',
  1,
  'paid',
  'CAD',
  100.00,
  100.00,
  100.00,
  '{}'::jsonb,
  'pickup-lock-version',
  now()
);

do $precondition$
begin
  if not public.work_order_is_financially_locked(
    '9f200000-0000-4000-8000-000000000002'::uuid,
    '9f300000-0000-4000-8000-000000000003'::uuid
  ) then
    raise exception 'Setup assumption failed: work order must be financially locked before this test proceeds.';
  end if;
end
$precondition$;

-- --- The pickup RPC must succeed against a financially-locked work order ---
do $confirm_pickup$
declare
  v_result jsonb;
begin
  select public.mark_work_order_picked_up_atomic(
    p_shop_id := '9f200000-0000-4000-8000-000000000002'::uuid,
    p_work_order_id := '9f300000-0000-4000-8000-000000000003'::uuid,
    p_actor_user_id := '9f100000-0000-4000-8000-000000000001'::uuid,
    p_collected_by_type := 'customer'
  ) into v_result;

  if coalesce((v_result ->> 'ok')::boolean, false) is not true
    or coalesce((v_result ->> 'picked_up')::boolean, false) is not true
  then
    raise exception 'mark_work_order_picked_up_atomic must succeed against a financially-locked, invoiced work order, got: %', v_result;
  end if;
end
$confirm_pickup$;

do $assert_picked_up$
begin
  if not exists (
    select 1 from public.work_orders
    where id = '9f300000-0000-4000-8000-000000000003'
      and picked_up_at is not null
      and collected_by_type = 'customer'
  ) then
    raise exception 'work_orders.picked_up_at/collected_by_type were not persisted by the pickup RPC.';
  end if;
end
$assert_picked_up$;

-- --- A raw pickup-column write outside the RPC boundary must still fail ----
do $reject_direct_pickup_write$
begin
  update public.work_orders
  set picked_up_at = now()
  where id = '9f300000-0000-4000-8000-000000000003';

  raise exception 'Regression: a direct write to picked_up_at outside mark_work_order_picked_up_atomic must be rejected on a financially-locked work order.';
exception
  when sqlstate 'P0001' or sqlstate '42501' then
    null; -- expected: WORK_ORDER_PICKUP_DIRECT_WRITE or WORK_ORDER_FINANCIALLY_LOCKED
end
$reject_direct_pickup_write$;

-- --- An ordinary operational field must still be rejected too: the guard's
-- pre-existing protection for non-pickup columns is untouched by the new
-- write-boundary exemption. ---------------------------------------------
do $reject_direct_operational_write$
begin
  update public.work_orders
  set notes = 'attempted post-lock edit'
  where id = '9f300000-0000-4000-8000-000000000003';

  raise exception 'Regression: an ordinary operational field must still be rejected on a financially-locked work order.';
exception
  when sqlstate 'P0001' then
    null; -- expected: WORK_ORDER_FINANCIALLY_LOCKED
end
$reject_direct_operational_write$;

-- --- Reversal must also succeed against the still-locked work order -------
do $confirm_reversal$
declare
  v_result jsonb;
begin
  select public.reverse_work_order_pickup_atomic(
    p_shop_id := '9f200000-0000-4000-8000-000000000002'::uuid,
    p_work_order_id := '9f300000-0000-4000-8000-000000000003'::uuid,
    p_actor_user_id := '9f100000-0000-4000-8000-000000000001'::uuid,
    p_reason := 'runtime test reversal'
  ) into v_result;

  if coalesce((v_result ->> 'ok')::boolean, false) is not true
    or coalesce((v_result ->> 'reversed')::boolean, false) is not true
  then
    raise exception 'reverse_work_order_pickup_atomic must succeed against a financially-locked work order, got: %', v_result;
  end if;
end
$confirm_reversal$;

do $assert_reversed$
begin
  if exists (
    select 1 from public.work_orders
    where id = '9f300000-0000-4000-8000-000000000003'
      and picked_up_at is not null
  ) then
    raise exception 'work_orders.picked_up_at was not cleared by the reversal RPC.';
  end if;
end
$assert_reversed$;

rollback;
