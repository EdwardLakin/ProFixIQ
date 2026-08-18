\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '9f100000-0000-4000-8000-000000000001',
  'field-truck-runtime-owner@example.com',
  '{"full_name":"Field Truck Runtime Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  '9f100000-0000-4000-8000-000000000001',
  '9f100000-0000-4000-8000-000000000001',
  'owner',
  'Field Truck Runtime Owner',
  'field-truck-runtime-owner@example.com',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id,
  owner_id,
  business_name,
  name,
  user_limit,
  accepts_online_booking,
  min_notice_minutes,
  max_lead_days,
  location_type,
  country,
  billing_entitlement_override,
  subscription_package
)
values (
  '9f200000-0000-4000-8000-000000000001',
  '9f100000-0000-4000-8000-000000000001',
  'Field Truck Runtime',
  'Field Truck Runtime',
  10,
  true,
  0,
  365,
  'repair_facility',
  'CA',
  'internal_demo',
  'complete_operations'
)
on conflict (id) do update
set country = 'CA',
    billing_entitlement_override = 'internal_demo',
    subscription_package = 'complete_operations';

update public.profiles
set shop_id = '9f200000-0000-4000-8000-000000000001'
where id = '9f100000-0000-4000-8000-000000000001';

insert into auth.users (id, email, raw_user_meta_data)
values (
  '9f100000-0000-4000-8000-000000000002',
  'field-truck-runtime-tech@example.com',
  '{"full_name":"Field Truck Runtime Technician"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  '9f100000-0000-4000-8000-000000000002',
  '9f100000-0000-4000-8000-000000000002',
  'mechanic',
  'Field Truck Runtime Technician',
  'field-truck-runtime-tech@example.com',
  '9f200000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    shop_id = excluded.shop_id;

insert into public.suppliers (id, shop_id, name, is_active)
values (
  '9f300000-0000-4000-8000-000000000001',
  '9f200000-0000-4000-8000-000000000001',
  'Field Truck Supplier',
  true
)
on conflict (id) do nothing;

insert into public.purchase_orders (id, shop_id, supplier_id, status, po_number)
values (
  '9f400000-0000-4000-8000-000000000001',
  '9f200000-0000-4000-8000-000000000001',
  '9f300000-0000-4000-8000-000000000001',
  'open',
  'FIELD-TRUCK-PO-1'
)
on conflict (id) do nothing;

insert into public.purchase_order_lines (
  id,
  po_id,
  part_id,
  sku,
  description,
  qty,
  unit_cost,
  received_qty,
  cancelled_qty
)
values (
  '9f500000-0000-4000-8000-000000000001',
  '9f400000-0000-4000-8000-000000000001',
  null,
  'FT-SEAL-100',
  'Field runtime wheel seal',
  2,
  42.50,
  0,
  0
)
on conflict (id) do nothing;

insert into public.stock_locations (id, shop_id, code, name)
values (
  '9f600000-0000-4000-8000-000000000001',
  '9f200000-0000-4000-8000-000000000001',
  'MAIN-RUNTIME',
  'Runtime Main Stock'
)
on conflict (id) do nothing;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9f100000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_shop_id constant uuid := '9f200000-0000-4000-8000-000000000001';
  v_actor_id constant uuid := '9f100000-0000-4000-8000-000000000001';
  v_technician_id constant uuid := '9f100000-0000-4000-8000-000000000002';
  v_source_location_id constant uuid := '9f600000-0000-4000-8000-000000000001';
  v_po_id constant uuid := '9f400000-0000-4000-8000-000000000001';
  v_po_line_id constant uuid := '9f500000-0000-4000-8000-000000000001';
  v_terminal_po_id constant uuid := '9f400000-0000-4000-8000-000000000002';
  v_terminal_line_id constant uuid := '9f500000-0000-4000-8000-000000000002';
  v_scoped_po_id constant uuid := '9f400000-0000-4000-8000-000000000003';
  v_scoped_line_one_id constant uuid := '9f500000-0000-4000-8000-000000000003';
  v_scoped_line_two_id constant uuid := '9f500000-0000-4000-8000-000000000004';
  v_truck_id uuid;
  v_truck_location_id uuid;
  v_receipt jsonb;
  v_receipt_replay jsonb;
  v_part_id uuid;
  v_intake jsonb;
  v_visit_id uuid;
  v_visit public.service_visits%rowtype;
  v_version integer;
  v_handoff jsonb;
  v_work_order_id uuid;
  v_line_id uuid;
  v_use jsonb;
  v_use_replay jsonb;
  v_return jsonb;
  v_return_replay jsonb;
  v_work_order_part_id uuid;
  v_transfer jsonb;
  v_transfer_replay jsonb;
  v_snapshot jsonb;
  v_activity jsonb;
  v_count integer;
  v_before numeric;
  v_after numeric;
  v_truck_before_transfer numeric;
begin
  perform public.mobile_configure_service_v1_atomic(
    v_shop_id,
    'mobile',
    true,
    false,
    true,
    true,
    60,
    1,
    true,
    'Runtime Service Truck',
    'RT-1',
    v_actor_id
  );

  select vehicle.id, vehicle.stock_location_id
    into v_truck_id, v_truck_location_id
  from public.service_vehicles vehicle
  where vehicle.shop_id = v_shop_id
    and vehicle.primary_user_id = v_actor_id
    and vehicle.active
  order by vehicle.created_at desc, vehicle.id
  limit 1;

  if v_truck_id is null or v_truck_location_id is null then
    raise exception 'Field truck runtime failed: setup did not create truck inventory';
  end if;

  -- Route guards are not the authority: a technician cannot call the public
  -- transfer RPC directly even when the truck is assigned to them.
  update public.service_vehicles
  set primary_user_id = v_technician_id
  where id = v_truck_id;
  perform set_config('request.jwt.claim.sub', v_technician_id::text, true);
  begin
    perform public.field_transfer_stock_to_truck_authorized_atomic(
      v_shop_id,
      v_truck_id,
      v_source_location_id,
      '9f700000-0000-4000-8000-000000000001'::uuid,
      1,
      v_technician_id,
      'field-runtime:technician-transfer-denied'
    );
    raise exception 'Field truck runtime failed: technician bypassed Parts permission';
  exception when others then
    if sqlstate <> '42501' or sqlerrm not like '%Parts management permission is required%' then
      raise;
    end if;
  end;
  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  -- A free-text PO line becomes a canonical part inside the receipt command.
  v_receipt := public.field_receive_po_part_to_truck_atomic(
    v_shop_id,
    v_truck_id,
    v_po_id,
    v_po_line_id,
    2,
    v_actor_id,
    'field-runtime:receive'
  );
  v_part_id := nullif(v_receipt ->> 'partId', '')::uuid;
  if v_part_id is null then
    raise exception 'Field truck runtime failed: receipt did not materialize canonical part';
  end if;
  if (select part_id from public.purchase_order_lines where id = v_po_line_id)
       is distinct from v_part_id then
    raise exception 'Field truck runtime failed: PO line lost canonical part identity';
  end if;
  if not exists (
    select 1
    from public.part_external_identities identity
    where identity.shop_id = v_shop_id
      and identity.part_id = v_part_id
      and identity.provider = 'purchase_order'
      and identity.external_id = v_po_line_id::text
  ) then
    raise exception 'Field truck runtime failed: purchase identity mapping missing';
  end if;
  if public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id) <> 2 then
    raise exception 'Field truck runtime failed: direct truck receipt did not post quantity 2';
  end if;

  v_receipt_replay := public.field_receive_po_part_to_truck_atomic(
    v_shop_id,
    v_truck_id,
    v_po_id,
    v_po_line_id,
    2,
    v_actor_id,
    'field-runtime:receive'
  );
  if coalesce((v_receipt_replay ->> 'replayed')::boolean, false) is not true
     or public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id) <> 2 then
    raise exception 'Field truck runtime failed: receipt replay changed truck quantity';
  end if;
  select count(*) into v_count
  from public.stock_moves move
  where move.shop_id = v_shop_id
    and move.part_id = v_part_id
    and move.location_id = v_truck_location_id
    and move.reason = 'receive'
    and move.reference_kind = 'purchase_order'
    and move.reference_id = v_po_id;
  if v_count <> 1 then
    raise exception 'Field truck runtime failed: receipt replay produced % stock moves', v_count;
  end if;

  insert into public.purchase_orders (id, shop_id, supplier_id, status, po_number)
  values (
    v_terminal_po_id, v_shop_id,
    '9f300000-0000-4000-8000-000000000001', 'cancelled', 'FIELD-TRUCK-PO-CANCELLED'
  );
  insert into public.purchase_order_lines (
    id, po_id, part_id, sku, description, qty, unit_cost, received_qty, cancelled_qty
  ) values (
    v_terminal_line_id, v_terminal_po_id, v_part_id, 'FT-SEAL-100',
    'Cancelled receipt target', 1, 42.50, 0, 0
  );
  begin
    perform public.field_receive_po_part_to_truck_atomic(
      v_shop_id, v_truck_id, v_terminal_po_id, v_terminal_line_id,
      1, v_actor_id, 'field-runtime:terminal-receipt'
    );
    raise exception 'Field truck runtime failed: terminal PO receipt was accepted';
  exception when others then
    if sqlerrm not like '%PARTS_PO_NOT_RECEIVABLE%' then
      raise;
    end if;
  end;

  insert into public.purchase_orders (id, shop_id, supplier_id, status, po_number)
  values (
    v_scoped_po_id, v_shop_id,
    '9f300000-0000-4000-8000-000000000001', 'open', 'FIELD-TRUCK-PO-SCOPED'
  );
  insert into public.purchase_order_lines (
    id, po_id, part_id, sku, description, qty, unit_cost, received_qty, cancelled_qty
  ) values
    (
      v_scoped_line_one_id, v_scoped_po_id, v_part_id, 'FT-SEAL-100',
      'First duplicate part line', 1, 42.50, 0, 0
    ),
    (
      v_scoped_line_two_id, v_scoped_po_id, v_part_id, 'FT-SEAL-100',
      'Selected duplicate part line', 1, 42.50, 0, 0
    );
  perform public.field_receive_po_part_to_truck_atomic(
    v_shop_id, v_truck_id, v_scoped_po_id, v_scoped_line_two_id,
    1, v_actor_id, 'field-runtime:scoped-receipt'
  );
  if (select received_qty from public.purchase_order_lines where id = v_scoped_line_one_id) <> 0
     or (select received_qty from public.purchase_order_lines where id = v_scoped_line_two_id) <> 1 then
    raise exception 'Field truck runtime failed: receipt was not scoped to the selected PO line';
  end if;

  -- Seed MAIN and prove a transfer is one paired, exact-once operation.
  v_truck_before_transfer := public.parts_on_hand(
    v_shop_id,
    v_part_id,
    v_truck_location_id
  );
  perform public.apply_stock_move(
    v_part_id,
    v_source_location_id,
    3,
    'receive'::text,
    'field_runtime_seed',
    v_po_line_id
  );
  v_transfer := public.field_transfer_stock_to_truck_authorized_atomic(
    v_shop_id,
    v_truck_id,
    v_source_location_id,
    v_part_id,
    1,
    v_actor_id,
    'field-runtime:transfer'
  );
  if public.parts_on_hand(v_shop_id, v_part_id, v_source_location_id) <> 2
     or public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id)
       <> v_truck_before_transfer + 1 then
    raise exception 'Field truck runtime failed: paired transfer quantities are wrong';
  end if;
  v_transfer_replay := public.field_transfer_stock_to_truck_authorized_atomic(
    v_shop_id,
    v_truck_id,
    v_source_location_id,
    v_part_id,
    1,
    v_actor_id,
    'field-runtime:transfer'
  );
  if coalesce((v_transfer_replay ->> 'idempotent')::boolean, false) is not true
     or public.parts_on_hand(v_shop_id, v_part_id, v_source_location_id) <> 2
     or public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id)
       <> v_truck_before_transfer + 1 then
    raise exception 'Field truck runtime failed: transfer replay changed inventory';
  end if;
  select count(*) into v_count
  from public.stock_moves move
  where move.shop_id = v_shop_id
    and move.id in (
      (v_transfer ->> 'transferOutMoveId')::uuid,
      (v_transfer ->> 'transferInMoveId')::uuid
    )
    and move.reference_kind = 'field_truck_transfer'
    and move.reason in ('transfer_out','transfer_in');
  if v_count <> 2 then
    raise exception 'Field truck runtime failed: transfer did not retain one paired identity';
  end if;

  -- Create the assigned field call and canonical repair.
  v_intake := public.mobile_create_service_call_atomic(
    v_shop_id,
    null,
    'Field Truck Runtime Customer',
    '780-555-9901',
    null,
    2022,
    'Ford',
    'F-550',
    'RT9901',
    '100 Runtime Way',
    'Calgary',
    'AB',
    'T1T 1T1',
    'Replace leaking wheel seal',
    '2099-10-01 15:00:00+00',
    60,
    null,
    'CAD',
    'mobile',
    v_actor_id,
    'field-runtime:intake'
  );
  v_visit_id := (v_intake ->> 'serviceVisitId')::uuid;

  select * into v_visit
  from public.service_visits visit
  where visit.id = v_visit_id;
  if v_visit.assigned_user_id is distinct from v_actor_id then
    raise exception 'Field truck runtime failed: field call not assigned to operator';
  end if;
  if v_visit.service_vehicle_id is null then
    perform public.dispatch_assign_service_visit_atomic(
      v_shop_id,
      v_visit_id,
      v_actor_id,
      v_truck_id,
      v_visit.version,
      v_actor_id,
      'field-runtime:assign-truck'
    );
  elsif v_visit.service_vehicle_id is distinct from v_truck_id then
    raise exception 'Field truck runtime failed: call assigned a different service truck';
  end if;

  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    v_shop_id, v_visit_id, 'scheduled', 'dispatched', v_version,
    v_actor_id, 'field-runtime:dispatch'
  );
  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    v_shop_id, v_visit_id, 'dispatched', 'en_route', v_version,
    v_actor_id, 'field-runtime:travel'
  );
  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    v_shop_id, v_visit_id, 'en_route', 'arrived', v_version,
    v_actor_id, 'field-runtime:arrive'
  );

  v_handoff := public.mobile_materialize_service_visit_work_order_atomic(
    v_shop_id,
    v_visit_id,
    v_actor_id,
    'field-runtime:handoff'
  );
  v_work_order_id := (v_handoff ->> 'workOrderId')::uuid;
  v_line_id := (v_handoff ->> 'initialWorkOrderLineId')::uuid;
  if v_work_order_id is null or v_line_id is null then
    raise exception 'Field truck runtime failed: repair handoff did not materialize';
  end if;

  update public.work_order_lines
  set approval_state = 'pending'
  where id = v_line_id
    and shop_id = v_shop_id;
  begin
    perform public.field_use_truck_part_atomic(
      v_shop_id, v_visit_id, v_line_id, v_part_id, 1,
      v_actor_id, 'field-runtime:unapproved-use'
    );
    raise exception 'Field truck runtime failed: unapproved repair line accepted part use';
  exception when others then
    if sqlerrm not like '%not approved and actionable%' then
      raise;
    end if;
  end;
  update public.work_order_lines
  set approval_state = 'approved'
  where id = v_line_id
    and shop_id = v_shop_id;

  v_before := public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id);
  v_use := public.field_use_truck_part_atomic(
    v_shop_id,
    v_visit_id,
    v_line_id,
    v_part_id,
    1,
    v_actor_id,
    'field-runtime:use'
  );
  v_work_order_part_id := (v_use ->> 'work_order_part_id')::uuid;
  v_after := public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id);
  if v_after <> v_before - 1 then
    raise exception 'Field truck runtime failed: truck use did not decrement inventory once';
  end if;
  if not exists (
    select 1
    from public.work_order_parts work_part
    where work_part.id = v_work_order_part_id
      and work_part.work_order_id = v_work_order_id
      and work_part.work_order_line_id = v_line_id
      and work_part.part_id = v_part_id
      and work_part.is_active
  ) then
    raise exception 'Field truck runtime failed: WO part identity differs from PO/stock identity';
  end if;

  v_use_replay := public.field_use_truck_part_atomic(
    v_shop_id,
    v_visit_id,
    v_line_id,
    v_part_id,
    1,
    v_actor_id,
    'field-runtime:use'
  );
  if coalesce((v_use_replay ->> 'idempotent')::boolean, false) is not true
     or public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id) <> v_after then
    raise exception 'Field truck runtime failed: repeated use decremented inventory twice';
  end if;

  v_return := public.field_return_truck_part_atomic(
    v_shop_id,
    v_visit_id,
    v_work_order_part_id,
    1,
    v_actor_id,
    'field-runtime:return'
  );
  if public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id) <> v_before then
    raise exception 'Field truck runtime failed: return did not restore truck quantity';
  end if;
  v_return_replay := public.field_return_truck_part_atomic(
    v_shop_id,
    v_visit_id,
    v_work_order_part_id,
    1,
    v_actor_id,
    'field-runtime:return'
  );
  if coalesce((v_return_replay ->> 'idempotent')::boolean, false) is not true
     or public.parts_on_hand(v_shop_id, v_part_id, v_truck_location_id) <> v_before then
    raise exception 'Field truck runtime failed: return replay changed inventory twice';
  end if;

  v_snapshot := public.field_truck_inventory_snapshot_with_activity(
    v_shop_id,
    v_actor_id,
    v_visit_id,
    v_truck_id,
    'FT-SEAL-100',
    50
  );
  if v_snapshot -> 'truck' ->> 'id' is distinct from v_truck_id::text
     or jsonb_array_length(coalesce(v_snapshot -> 'items', '[]'::jsonb)) < 1
     or jsonb_array_length(coalesce(v_snapshot -> 'catalog', '[]'::jsonb)) < 1 then
    raise exception 'Field truck runtime failed: assigned truck snapshot is incomplete';
  end if;

  v_activity := coalesce(v_snapshot -> 'movements', '[]'::jsonb);
  if jsonb_array_length(v_activity) < 4
     or not exists (
       select 1
       from jsonb_array_elements(v_activity) movement
       where movement ->> 'reason' = 'transfer_in'
     )
     or not exists (
       select 1
       from jsonb_array_elements(v_activity) movement
       where movement ->> 'reason' = 'consume'
     ) then
    raise exception 'Field truck runtime failed: canonical truck activity is incomplete';
  end if;
end;
$$;

reset role;

-- Reservation ledger entries have zero physical quantity change. Seed both
-- directions as the database owner, then verify the authenticated Field RPC
-- projects lifecycle_quantity without exposing a separate read window.
insert into public.stock_moves (
  shop_id,
  part_id,
  location_id,
  qty_change,
  reason,
  reference_kind,
  reference_id,
  created_by,
  idempotency_key,
  lifecycle_quantity,
  metadata
)
select
  '9f200000-0000-4000-8000-000000000001'::uuid,
  line.part_id,
  vehicle.stock_location_id,
  0,
  movement.reason::public.stock_move_reason,
  'field_runtime_reservation',
  line.part_id,
  '9f100000-0000-4000-8000-000000000001'::uuid,
  'field-runtime:reservation:' || movement.reason,
  movement.quantity,
  jsonb_build_object('operation', 'field_runtime_reservation')
from public.purchase_order_lines line
cross join lateral (
  select truck.stock_location_id
  from public.service_vehicles truck
  where truck.shop_id = '9f200000-0000-4000-8000-000000000001'::uuid
    and truck.active
  order by truck.created_at desc, truck.id
  limit 1
) vehicle
cross join (
  values
    ('wo_allocate'::text, 3::numeric),
    ('wo_release'::text, 2::numeric)
) movement(reason, quantity)
where line.id = '9f500000-0000-4000-8000-000000000001'::uuid;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9f100000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_snapshot jsonb;
  v_truck_id uuid;
  v_activity jsonb;
begin
  select vehicle.id into v_truck_id
  from public.service_vehicles vehicle
  where vehicle.shop_id = '9f200000-0000-4000-8000-000000000001'::uuid
    and vehicle.active
  order by vehicle.created_at desc, vehicle.id
  limit 1;

  v_snapshot := public.field_truck_inventory_snapshot_with_activity(
    '9f200000-0000-4000-8000-000000000001'::uuid,
    '9f100000-0000-4000-8000-000000000001'::uuid,
    null,
    v_truck_id,
    null,
    50
  );
  v_activity := coalesce(v_snapshot -> 'movements', '[]'::jsonb);

  if not exists (
    select 1
    from jsonb_array_elements(v_activity) movement
    where movement ->> 'reason' = 'wo_allocate'
      and (movement ->> 'quantity')::numeric = 3
      and movement ->> 'direction' = 'out'
  ) or not exists (
    select 1
    from jsonb_array_elements(v_activity) movement
    where movement ->> 'reason' = 'wo_release'
      and (movement ->> 'quantity')::numeric = 2
      and movement ->> 'direction' = 'in'
  ) then
    raise exception 'Field truck runtime failed: reservation movement quantity or direction is wrong';
  end if;
end;
$$;

reset role;
rollback;
