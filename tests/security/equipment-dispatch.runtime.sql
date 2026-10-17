\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('7d100000-0000-4000-8000-000000000001', 'eqd-owner-a@example.test', '{"full_name":"EQD Owner A"}'::jsonb),
  ('7d100000-0000-4000-8000-000000000002', 'eqd-tech-a1@example.test', '{"full_name":"EQD Tech A1"}'::jsonb),
  ('7d100000-0000-4000-8000-000000000003', 'eqd-tech-a2@example.test', '{"full_name":"EQD Tech A2"}'::jsonb),
  ('7d100000-0000-4000-8000-000000000004', 'eqd-owner-b@example.test', '{"full_name":"EQD Owner B"}'::jsonb),
  ('7d100000-0000-4000-8000-000000000005', 'eqd-tech-b1@example.test', '{"full_name":"EQD Tech B1"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('7d100000-0000-4000-8000-000000000001', '7d100000-0000-4000-8000-000000000001', 'owner', 'EQD Owner A'),
  ('7d100000-0000-4000-8000-000000000002', '7d100000-0000-4000-8000-000000000002', 'mechanic', 'EQD Tech A1'),
  ('7d100000-0000-4000-8000-000000000003', '7d100000-0000-4000-8000-000000000003', 'mechanic', 'EQD Tech A2'),
  ('7d100000-0000-4000-8000-000000000004', '7d100000-0000-4000-8000-000000000004', 'owner', 'EQD Owner B'),
  ('7d100000-0000-4000-8000-000000000005', '7d100000-0000-4000-8000-000000000005', 'mechanic', 'EQD Tech B1')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('7d200000-0000-4000-8000-000000000001', '7d100000-0000-4000-8000-000000000001', 'EQD Shop A', 'EQD Shop A', 10),
  ('7d200000-0000-4000-8000-000000000002', '7d100000-0000-4000-8000-000000000004', 'EQD Shop B', 'EQD Shop B', 10)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id in ('7d100000-0000-4000-8000-000000000001','7d100000-0000-4000-8000-000000000002','7d100000-0000-4000-8000-000000000003')
    then '7d200000-0000-4000-8000-000000000001'::uuid
  else '7d200000-0000-4000-8000-000000000002'::uuid
end
where id::text like '7d100000-%';

-- Field setup the canonical mobile visit commands already require: active
-- product access, completed Field onboarding, and enabled field operators.
update public.shops
set billing_entitlement_override = 'active'
where id = '7d200000-0000-4000-8000-000000000001';

insert into public.mobile_service_settings (shop_id, service_model, onboarding_completed_at)
values ('7d200000-0000-4000-8000-000000000001', 'mobile', now())
on conflict (shop_id) do update set service_model = 'mobile', onboarding_completed_at = now();

insert into public.mobile_field_operators (shop_id, profile_id)
values
  ('7d200000-0000-4000-8000-000000000001', '7d100000-0000-4000-8000-000000000001'),
  ('7d200000-0000-4000-8000-000000000001', '7d100000-0000-4000-8000-000000000002'),
  ('7d200000-0000-4000-8000-000000000001', '7d100000-0000-4000-8000-000000000003')
on conflict (shop_id, profile_id) do update set enabled = true;

insert into public.customers (id, shop_id, name)
values ('7d300000-0000-4000-8000-000000000001', '7d200000-0000-4000-8000-000000000001', 'EQD Customer A');

insert into public.vehicles (id, shop_id, customer_id, user_id, unit_number, year, make, model)
values ('7d400000-0000-4000-8000-000000000001', '7d200000-0000-4000-8000-000000000001',
        '7d300000-0000-4000-8000-000000000001', '7d100000-0000-4000-8000-000000000001', 'EXC-1', 2021, 'Cat', '320');

insert into public.work_orders (id, shop_id, custom_id, vehicle_id, customer_id, status, record_type, advisor_id)
values
  ('7d500000-0000-4000-8000-000000000001', '7d200000-0000-4000-8000-000000000001', 'EQD-1',
   '7d400000-0000-4000-8000-000000000001', '7d300000-0000-4000-8000-000000000001', 'in_progress', 'work_order',
   '7d100000-0000-4000-8000-000000000001');

insert into public.work_orders (id, shop_id, custom_id, vehicle_id, customer_id, status, record_type, advisor_id)
values
  ('7d500000-0000-4000-8000-000000000002', '7d200000-0000-4000-8000-000000000001', 'EQD-2',
   '7d400000-0000-4000-8000-000000000001', '7d300000-0000-4000-8000-000000000001', 'in_progress', 'work_order',
   '7d100000-0000-4000-8000-000000000001');

insert into public.service_addresses (id, shop_id, customer_id, label, address_line1)
values ('7d600000-0000-4000-8000-000000000001', '7d200000-0000-4000-8000-000000000001',
        '7d300000-0000-4000-8000-000000000001', 'Quarry', '1 Pit Rd');

-- Act as shop A's owner through the same session mechanism the app uses.
select set_config('request.jwt.claims',
  '{"sub":"7d100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $equipment_dispatch$
declare
  shop_a constant uuid := '7d200000-0000-4000-8000-000000000001';
  owner_a constant uuid := '7d100000-0000-4000-8000-000000000001';
  tech_1 constant uuid := '7d100000-0000-4000-8000-000000000002';
  tech_2 constant uuid := '7d100000-0000-4000-8000-000000000003';
  tech_b constant uuid := '7d100000-0000-4000-8000-000000000005';
  wo_1 constant uuid := '7d500000-0000-4000-8000-000000000001';
  wo_2 constant uuid := '7d500000-0000-4000-8000-000000000002';
  addr constant uuid := '7d600000-0000-4000-8000-000000000001';
  v_first jsonb;
  v_replay jsonb;
  v_visit uuid;
  v_wo_count integer;
  v_call jsonb;
  v_call_replay jsonb;
  v_ack jsonb;
  v_ack_replay jsonb;
begin
  -- Dispatch an existing work order to a lead plus a supporting technician.
  v_first := public.equipment_dispatch_visit_atomic(
    shop_a, wo_1, 'shop', addr, null, null, tech_1, array[tech_2, tech_2, tech_1],
    null, 'Bring the grease gun', false, owner_a, 'eqd-key-dispatch-0001');
  v_visit := (v_first #>> '{visit,id}')::uuid;
  if (select count(*) from public.service_visit_participants where service_visit_id = v_visit and removed_at is null) <> 2 then
    raise exception 'Expected exactly a lead and one supporting technician.';
  end if;
  if (select assigned_user_id from public.service_visits where id = v_visit) <> tech_1 then
    raise exception 'The lead must be the visit execution owner.';
  end if;

  -- A retried request returns the same result and creates nothing.
  v_replay := public.equipment_dispatch_visit_atomic(
    shop_a, wo_1, 'shop', addr, null, null, tech_1, array[tech_2, tech_2, tech_1],
    null, 'Bring the grease gun', false, owner_a, 'eqd-key-dispatch-0001');
  if (v_replay ->> 'idempotent')::boolean is not true
     or (v_replay #>> '{visit,id}')::uuid <> v_visit
     or (select count(*) from public.service_visits where work_order_id = wo_1) <> 1 then
    raise exception 'A retried dispatch was not idempotent.';
  end if;

  -- The same key with a different payload is refused.
  begin
    perform public.equipment_dispatch_visit_atomic(
      shop_a, wo_1, 'shop', addr, null, null, tech_2, '{}', null, null, false, owner_a, 'eqd-key-dispatch-0001');
    raise exception 'A reused key with a different payload was accepted.';
  exception when sqlstate '22023' then null;
  end;

  -- A second dispatcher tap with a NEW key cannot create a parallel visit.
  begin
    perform public.equipment_dispatch_visit_atomic(
      shop_a, wo_1, 'shop', addr, null, null, tech_1, '{}', null, null, false, owner_a, 'eqd-key-dispatch-0002');
    raise exception 'A second active visit was created for the same work order.';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ACTIVE_SERVICE_VISIT_EXISTS' then raise; end if;
  end;

  -- Another shop's technician cannot be added.
  begin
    perform public.equipment_dispatch_visit_atomic(
      shop_a, wo_1, 'shop', addr, null, null, tech_1, array[tech_b], null, null, false, owner_a, 'eqd-key-dispatch-0003');
    raise exception 'A cross-shop technician was dispatched.';
  exception when sqlstate 'P0001' then null;
  end;

  -- A scheduled visit cannot carry supporting technicians until capacity
  -- projection exists (no silent double-booking).
  begin
    perform public.equipment_dispatch_visit_atomic(
      shop_a, wo_2, 'shop', addr, now() + interval '1 day', now() + interval '1 day 2 hours',
      tech_1, array[tech_2], null, null, false, owner_a, 'eqd-key-sched-0001');
    raise exception 'A scheduled visit with supporting technicians was accepted.';
  exception when sqlstate 'P0001' then null;
  end;

  -- A receipt stored by another dispatch path under a colliding key (here for
  -- a visit on a DIFFERENT work order) must not be adopted: no participants are
  -- attached to a visit this call did not create, and wo_2 gets no visit.
  perform public.dispatch_create_service_visit_atomic(
    shop_a, null, wo_1, 'shop', addr, null, null, tech_1, null, null, null, null, owner_a,
    'equipment-dispatch:eqd-key-collide-0001:visit');
  begin
    perform public.equipment_dispatch_visit_atomic(
      shop_a, wo_2, 'shop', addr, null, null, tech_1, array[tech_2], null, null, false, owner_a,
      'eqd-key-collide-0001');
    raise exception 'A colliding inner receipt was adopted.';
  exception when sqlstate '22023' then null;
  end;
  if exists (select 1 from public.service_visits where work_order_id = wo_2) then
    raise exception 'A visit was created on the work order despite the key collision.';
  end if;
  if (select count(*) from public.service_visit_participants where shop_id = shop_a) <> 2 then
    raise exception 'Participants were attached to a visit this call did not create.';
  end if;

  -- Acknowledgement: the lead acknowledges; nothing else changes.
  perform set_config('request.jwt.claims',
    '{"sub":"7d100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  v_ack := public.equipment_acknowledge_visit_atomic(shop_a, v_visit, tech_1);
  v_ack_replay := public.equipment_acknowledge_visit_atomic(shop_a, v_visit, tech_1);
  if (v_ack ->> 'idempotent')::boolean is not false
     or (v_ack_replay ->> 'idempotent')::boolean is not true
     or v_ack ->> 'acknowledgedAt' <> v_ack_replay ->> 'acknowledgedAt' then
    raise exception 'Acknowledgement was not idempotent.';
  end if;
  if (select status from public.service_visits where id = v_visit) <> 'scheduled' then
    raise exception 'Acknowledgement changed the visit status.';
  end if;
  if exists (select 1 from public.work_order_line_labor_segments where technician_id = tech_1) then
    raise exception 'Acknowledgement created labor.';
  end if;

  -- A non-participant cannot acknowledge.
  perform set_config('request.jwt.claims',
    '{"sub":"7d100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  begin
    perform public.equipment_acknowledge_visit_atomic(shop_a, v_visit, owner_a);
    raise exception 'A non-participant acknowledged a visit.';
  exception when sqlstate '42501' then null;
  end;

  -- A technician cannot originate a customer call.
  perform set_config('request.jwt.claims',
    '{"sub":"7d100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  begin
    perform public.equipment_create_field_call_atomic(
      shop_a, '7d300000-0000-4000-8000-000000000001', '7d400000-0000-4000-8000-000000000001',
      'Hydraulic leak', 3, addr, null, null, null, '{}', null, null, false, tech_1, 'eqd-key-call-denied-1');
    raise exception 'A technician originated a field call.';
  exception when sqlstate '42501' then null;
  end;

  -- Office field call: work order + visit once, however many times it is sent.
  perform set_config('request.jwt.claims',
    '{"sub":"7d100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  select count(*) into v_wo_count from public.work_orders where shop_id = shop_a;
  v_call := public.equipment_create_field_call_atomic(
    shop_a, '7d300000-0000-4000-8000-000000000001', '7d400000-0000-4000-8000-000000000001',
    'Hydraulic leak on boom', 3, addr, null, null, tech_2, '{}', null, null, true, owner_a,
    'eqd-key-call-0001');
  v_call_replay := public.equipment_create_field_call_atomic(
    shop_a, '7d300000-0000-4000-8000-000000000001', '7d400000-0000-4000-8000-000000000001',
    'Hydraulic leak on boom', 3, addr, null, null, tech_2, '{}', null, null, true, owner_a,
    'eqd-key-call-0001');
  if (select count(*) from public.work_orders where shop_id = shop_a) <> v_wo_count + 1 then
    raise exception 'A retried field call created a duplicate work order.';
  end if;
  if (v_call_replay ->> 'idempotent')::boolean is not true
     or v_call_replay #>> '{workOrder,id}' <> v_call #>> '{workOrder,id}' then
    raise exception 'A retried field call did not return the original result.';
  end if;
  if (v_call #>> '{visit,status}') <> 'dispatched' then
    raise exception 'Dispatch Now did not dispatch the visit.';
  end if;

  -- Field visits require Field access for every technician on them.
  update public.mobile_field_operators set enabled = false
  where shop_id = shop_a and profile_id = tech_2;
  select count(*) into v_wo_count from public.work_orders where shop_id = shop_a;
  begin
    perform public.equipment_create_field_call_atomic(
      shop_a, '7d300000-0000-4000-8000-000000000001', '7d400000-0000-4000-8000-000000000001',
      'Needs field setup', 3, addr, null, null, tech_1, array[tech_2], null, null, true, owner_a,
      'eqd-key-call-0003');
    raise exception 'A supporting technician without Field access was dispatched.';
  exception when sqlstate '42501' then null;
  end;
  if (select count(*) from public.work_orders where shop_id = shop_a) <> v_wo_count then
    raise exception 'A rejected field call left an orphan work order.';
  end if;
  update public.mobile_field_operators set enabled = true
  where shop_id = shop_a and profile_id = tech_2;

  -- A field call that cannot be dispatched leaves no orphan work order.
  select count(*) into v_wo_count from public.work_orders where shop_id = shop_a;
  begin
    perform public.equipment_create_field_call_atomic(
      shop_a, '7d300000-0000-4000-8000-000000000001', '7d400000-0000-4000-8000-000000000001',
      'No technician', 3, null, null, null, null, '{}', null, null, true, owner_a, 'eqd-key-call-0002');
    raise exception 'Dispatch Now without a technician or location was accepted.';
  exception when sqlstate 'P0001' then null;
  end;
  if (select count(*) from public.work_orders where shop_id = shop_a) <> v_wo_count then
    raise exception 'A failed field call left an orphan work order.';
  end if;
end
$equipment_dispatch$;

rollback;
