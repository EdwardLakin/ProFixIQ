\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('8a100000-0000-4000-8000-000000000001', 'dispatch-owner@example.com', '{"full_name":"Dispatch Owner"}'::jsonb),
  ('8a100000-0000-4000-8000-000000000002', 'dispatch-tech-one@example.com', '{"full_name":"Tech One"}'::jsonb),
  ('8a100000-0000-4000-8000-000000000003', 'dispatch-tech-two@example.com', '{"full_name":"Tech Two"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  ('8a100000-0000-4000-8000-000000000001', '8a100000-0000-4000-8000-000000000001', 'owner', 'Dispatch Owner', 'dispatch-owner@example.com', null),
  ('8a100000-0000-4000-8000-000000000002', '8a100000-0000-4000-8000-000000000002', 'mechanic', 'Tech One', 'dispatch-tech-one@example.com', null),
  ('8a100000-0000-4000-8000-000000000003', '8a100000-0000-4000-8000-000000000003', 'mechanic', 'Tech Two', 'dispatch-tech-two@example.com', null)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type, billing_entitlement_override
)
values (
  '8b100000-0000-4000-8000-000000000001',
  '8a100000-0000-4000-8000-000000000001',
  'Dispatch Runtime Shop', 'Dispatch Runtime Shop', 10,
  true, 0, 365, 'repair_facility', 'internal_demo'
)
on conflict (id) do update
set billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = '8b100000-0000-4000-8000-000000000001'
where id in (
  '8a100000-0000-4000-8000-000000000001',
  '8a100000-0000-4000-8000-000000000002',
  '8a100000-0000-4000-8000-000000000003'
);

-- Mobile-mode Dispatch requires both the Field Service product entitlement
-- and explicit operator assignment. Keep this runtime fixture aligned with
-- the production authorization boundary instead of bypassing it through the
-- service-role session used below.
insert into public.mobile_service_settings (
  shop_id, service_model, solo_mode, dispatch_enabled,
  service_vehicles_enabled, field_operator_count_target,
  onboarding_completed_at, configured_by
)
values (
  '8b100000-0000-4000-8000-000000000001', 'mobile', false, true,
  true, 3, now(), '8a100000-0000-4000-8000-000000000001'
)
on conflict (shop_id) do update
set service_model = 'mobile',
    solo_mode = false,
    dispatch_enabled = true,
    service_vehicles_enabled = true,
    field_operator_count_target = 3,
    onboarding_completed_at = now(),
    configured_by = '8a100000-0000-4000-8000-000000000001';

insert into public.mobile_field_operators (
  shop_id, profile_id, enabled, created_by
)
values
  (
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001', true,
    '8a100000-0000-4000-8000-000000000001'
  ),
  (
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000002', true,
    '8a100000-0000-4000-8000-000000000001'
  ),
  (
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000003', true,
    '8a100000-0000-4000-8000-000000000001'
  )
on conflict (shop_id, profile_id) do update set enabled = true;

insert into public.customers (id, shop_id, first_name, last_name, email, phone)
values (
  '8c100000-0000-4000-8000-000000000001',
  '8b100000-0000-4000-8000-000000000001',
  'Mobile', 'Customer', 'mobile-customer@example.com', '4035550101'
)
on conflict (id) do nothing;

insert into public.vehicles (id, shop_id, customer_id, year, make, model, vin)
values (
  '8c200000-0000-4000-8000-000000000001',
  '8b100000-0000-4000-8000-000000000001',
  '8c100000-0000-4000-8000-000000000001',
  2024, 'Test', 'Mobile Service Unit', '1FTFW1E50NFA00001'
)
on conflict (id) do update
set shop_id = excluded.shop_id,
    customer_id = excluded.customer_id;

insert into public.service_vehicles (id, shop_id, name, unit_number, active)
values
  ('8d100000-0000-4000-8000-000000000001', '8b100000-0000-4000-8000-000000000001', 'Service Truck 1', 'ST-1', true),
  ('8d100000-0000-4000-8000-000000000002', '8b100000-0000-4000-8000-000000000001', 'Service Truck 2', 'ST-2', true)
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_booking_a jsonb;
  v_booking_b jsonb;
  v_booking_c jsonb;
  v_booking_d jsonb;
  v_booking_a_id uuid;
  v_booking_b_id uuid;
  v_booking_c_id uuid;
  v_booking_d_id uuid;
  v_visit_a_id uuid;
  v_visit_b_id uuid;
  v_visit_c_id uuid;
  v_visit_d_id uuid;
  v_create_result jsonb;
  v_handoff jsonb;
  v_work_order_id uuid;
  v_truck_a uuid;
  v_truck_b uuid;
  v_board jsonb;
  v_mobile jsonb;
  v_conflict boolean := false;
  v_transitioned_count integer;
  v_primary_status text;
  v_tech_status text;
  v_b_start timestamptz;
  v_b_end timestamptz;
begin
  -- Mobile bookings are the normal intake path. They must materialize exactly
  -- one unassigned Service Visit after the scheduler event is established.
  v_booking_a := public.scheduler_apply_booking_command_atomic(
    'create', null, '8b100000-0000-4000-8000-000000000001',
    '8c100000-0000-4000-8000-000000000001',
    '8c200000-0000-4000-8000-000000000001',
    '2099-03-01 09:00:00+00', '2099-03-01 10:00:00+00', 'Mobile visit A',
    '8a100000-0000-4000-8000-000000000001', 'staff',
    'dispatch-runtime:booking:a', null, '2099-01-01 00:00:00+00', 'mobile', null
  );
  v_booking_b := public.scheduler_apply_booking_command_atomic(
    'create', null, '8b100000-0000-4000-8000-000000000001',
    '8c100000-0000-4000-8000-000000000001', null,
    '2099-03-01 09:00:00+00', '2099-03-01 10:00:00+00', 'Mobile visit B',
    '8a100000-0000-4000-8000-000000000001', 'staff',
    'dispatch-runtime:booking:b', null, '2099-01-01 00:00:00+00', 'mobile', null
  );
  v_booking_c := public.scheduler_apply_booking_command_atomic(
    'create', null, '8b100000-0000-4000-8000-000000000001',
    '8c100000-0000-4000-8000-000000000001', null,
    '2099-03-01 13:00:00+00', '2099-03-01 14:00:00+00', 'Mobile visit C',
    '8a100000-0000-4000-8000-000000000001', 'staff',
    'dispatch-runtime:booking:c', null, '2099-01-01 00:00:00+00', 'mobile', null
  );

  v_booking_a_id := (v_booking_a -> 'booking' ->> 'id')::uuid;
  v_booking_b_id := (v_booking_b -> 'booking' ->> 'id')::uuid;
  v_booking_c_id := (v_booking_c -> 'booking' ->> 'id')::uuid;

  select id into v_visit_a_id from public.service_visits where booking_id = v_booking_a_id;
  select id into v_visit_b_id from public.service_visits where booking_id = v_booking_b_id;
  select id into v_visit_c_id from public.service_visits where booking_id = v_booking_c_id;
  if v_visit_a_id is null or v_visit_b_id is null or v_visit_c_id is null then
    raise exception 'Dispatch assertion failed: mobile bookings did not materialize service visits';
  end if;
  if (select count(*) from public.service_visits where booking_id in (v_booking_a_id, v_booking_b_id, v_booking_c_id)) <> 3 then
    raise exception 'Dispatch assertion failed: mobile booking projection was not one-to-one';
  end if;

  -- Explicit create remains available for non-mobile-booking consumers.
  v_booking_d := public.scheduler_apply_booking_command_atomic(
    'create', null, '8b100000-0000-4000-8000-000000000001',
    '8c100000-0000-4000-8000-000000000001', null,
    '2099-03-05 09:00:00+00', '2099-03-05 10:00:00+00', 'Shop visit D',
    '8a100000-0000-4000-8000-000000000001', 'staff',
    'dispatch-runtime:booking:d', null, '2099-01-01 00:00:00+00', 'shop', null
  );
  v_booking_d_id := (v_booking_d -> 'booking' ->> 'id')::uuid;
  v_create_result := public.dispatch_create_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_booking_d_id, null, 'shop',
    null, null, null, null, null, 'Shop visit', null, null,
    '8a100000-0000-4000-8000-000000000001', 'dispatch-runtime:visit:d'
  );
  v_visit_d_id := (v_create_result -> 'visit' ->> 'id')::uuid;
  if v_visit_d_id is null then
    raise exception 'Dispatch assertion failed: canonical create RPC did not create a service visit';
  end if;

  v_board := public.dispatch_board_snapshot(
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001',
    '2099-03-01 00:00:00+00', '2099-03-02 00:00:00+00'
  );
  if jsonb_array_length(v_board -> 'visits') <> 3 then
    raise exception 'Dispatch assertion failed: board did not return three active mobile visits';
  end if;
  if (
    select count(*) from jsonb_array_elements(v_board -> 'visits') x
    where x -> 'assignedTechnician' is null
  ) <> 3 then
    raise exception 'Dispatch assertion failed: new mobile visits were not unassigned';
  end if;

  select sr.service_vehicle_id into v_truck_a
  from public.scheduling_events e
  join public.scheduling_reservations r on r.event_id = e.id and r.reservation_role = 'primary'
  join public.scheduling_resources sr on sr.id = r.resource_id
  where e.service_visit_id = v_visit_a_id;

  select sr.service_vehicle_id into v_truck_b
  from public.scheduling_events e
  join public.scheduling_reservations r on r.event_id = e.id and r.reservation_role = 'primary'
  join public.scheduling_resources sr on sr.id = r.resource_id
  where e.service_visit_id = v_visit_b_id;

  if v_truck_a is null or v_truck_b is null or v_truck_a = v_truck_b then
    raise exception 'Dispatch assertion failed: simultaneous mobile visits did not reserve distinct trucks';
  end if;

  perform public.dispatch_assign_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_a_id,
    '8a100000-0000-4000-8000-000000000002', v_truck_a, null,
    '8a100000-0000-4000-8000-000000000001', 'dispatch-runtime:assign:a'
  );

  begin
    perform public.dispatch_assign_service_visit_atomic(
      '8b100000-0000-4000-8000-000000000001', v_visit_b_id,
      '8a100000-0000-4000-8000-000000000002', v_truck_b, null,
      '8a100000-0000-4000-8000-000000000001', 'dispatch-runtime:assign:b-conflict'
    );
  exception when exclusion_violation then
    v_conflict := true;
  end;
  if not v_conflict then
    raise exception 'Dispatch assertion failed: overlapping visits accepted the same technician';
  end if;

  perform public.dispatch_assign_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_b_id,
    '8a100000-0000-4000-8000-000000000003', v_truck_b, null,
    '8a100000-0000-4000-8000-000000000001', 'dispatch-runtime:assign:b'
  );
  perform public.dispatch_assign_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_c_id,
    '8a100000-0000-4000-8000-000000000002', null, null,
    '8a100000-0000-4000-8000-000000000001', 'dispatch-runtime:assign:c'
  );

  perform public.dispatch_transition_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_a_id, 'dispatched', null, null, null,
    '8a100000-0000-4000-8000-000000000001', 'dispatch-runtime:a:dispatched'
  );
  perform public.dispatch_transition_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_a_id, 'en_route', null, null, null,
    '8a100000-0000-4000-8000-000000000002', 'dispatch-runtime:a:en-route'
  );
  perform public.dispatch_transition_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_a_id, 'arrived', null, 12.8, null,
    '8a100000-0000-4000-8000-000000000002', 'dispatch-runtime:a:arrived'
  );

  -- Arrival may precede repair creation, but physical work must always be
  -- anchored to the canonical work order before the visit enters `working`.
  v_handoff := public.mobile_materialize_service_visit_work_order_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_a_id,
    '8a100000-0000-4000-8000-000000000002',
    'dispatch-runtime:a:work-order'
  );
  v_work_order_id := (v_handoff ->> 'workOrderId')::uuid;
  if v_work_order_id is null or not exists (
    select 1 from public.service_visits visit
    where visit.id = v_visit_a_id
      and visit.shop_id = '8b100000-0000-4000-8000-000000000001'
      and visit.work_order_id = v_work_order_id
  ) then
    raise exception 'Dispatch assertion failed: arrived visit did not materialize its canonical work order';
  end if;

  perform public.dispatch_transition_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_a_id, 'working', null, null, null,
    '8a100000-0000-4000-8000-000000000002', 'dispatch-runtime:a:working'
  );
  perform public.dispatch_transition_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_a_id, 'completed', null, null, null,
    '8a100000-0000-4000-8000-000000000002', 'dispatch-runtime:a:completed'
  );

  if not exists (
    select 1 from public.service_visits sv
    where sv.id = v_visit_a_id and sv.status = 'completed'
      and sv.dispatched_at is not null and sv.travel_started_at is not null
      and sv.arrived_at is not null and sv.work_started_at is not null
      and sv.completed_at is not null and sv.actual_travel_minutes is not null
      and sv.actual_distance_km = 12.8
  ) then
    raise exception 'Dispatch assertion failed: lifecycle timestamps/travel metrics were not stamped';
  end if;

  select count(*) into v_transitioned_count
  from public.service_visit_events e
  where e.service_visit_id = v_visit_a_id and e.event_type = 'transitioned';
  if v_transitioned_count <> 5 then
    raise exception 'Dispatch assertion failed: expected five lifecycle audit events, got %', v_transitioned_count;
  end if;

  select r.status into v_primary_status
  from public.scheduling_events e
  join public.scheduling_reservations r on r.event_id = e.id and r.reservation_role = 'primary'
  where e.service_visit_id = v_visit_a_id;
  select r.status into v_tech_status
  from public.scheduling_events e
  join public.scheduling_reservations r on r.event_id = e.id and r.reservation_role = 'technician'
  where e.service_visit_id = v_visit_a_id;
  if v_primary_status <> 'completed' or v_tech_status <> 'completed' then
    raise exception 'Dispatch assertion failed: completed visit did not complete scheduler reservations';
  end if;

  v_mobile := public.dispatch_mobile_active_snapshot(
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000002'
  );
  if v_mobile -> 'activeJob' <> 'null'::jsonb then
    raise exception 'Dispatch assertion failed: completed job remained active for technician';
  end if;
  if (v_mobile -> 'nextJob' ->> 'id')::uuid <> v_visit_c_id then
    raise exception 'Dispatch assertion failed: next-job contract did not return visit C';
  end if;

  perform public.dispatch_reschedule_service_visit_atomic(
    '8b100000-0000-4000-8000-000000000001', v_visit_b_id,
    '2099-03-01 11:00:00+00', '2099-03-01 12:00:00+00', null,
    '8a100000-0000-4000-8000-000000000001', 'dispatch-runtime:reschedule:b'
  );

  select r.starts_at, r.ends_at into v_b_start, v_b_end
  from public.scheduling_events e
  join public.scheduling_reservations r on r.event_id = e.id and r.reservation_role = 'technician'
  where e.service_visit_id = v_visit_b_id;
  if v_b_start <> '2099-03-01 11:00:00+00'::timestamptz
     or v_b_end <> '2099-03-01 12:00:00+00'::timestamptz then
    raise exception 'Dispatch assertion failed: technician reservation did not follow reschedule';
  end if;

  if not exists (
    select 1 from public.service_visit_events e
    where e.service_visit_id = v_visit_b_id and e.event_type = 'rescheduled'
  ) then
    raise exception 'Dispatch assertion failed: reschedule was not audited';
  end if;
end
$$;

reset role;
rollback;
