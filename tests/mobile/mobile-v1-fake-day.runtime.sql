\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '9a100000-0000-4000-8000-000000000001',
  'mobile-v1-owner@example.com',
  '{"full_name":"Mobile V1 Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  '9a100000-0000-4000-8000-000000000001',
  '9a100000-0000-4000-8000-000000000001',
  'owner',
  'Mobile V1 Owner',
  'mobile-v1-owner@example.com',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type
)
values (
  '9b100000-0000-4000-8000-000000000001',
  '9a100000-0000-4000-8000-000000000001',
  'Mobile V1 Runtime', 'Mobile V1 Runtime', 10,
  true, 0, 365, 'mobile_service_branch'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = '9b100000-0000-4000-8000-000000000001'
where id = '9a100000-0000-4000-8000-000000000001';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_config jsonb;
  v_intake jsonb;
  v_replay jsonb;
  v_visit_id uuid;
  v_booking_id uuid;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_conflict boolean := false;
  v_before_customers integer;
begin
  v_config := public.mobile_configure_service_v1_atomic(
    '9b100000-0000-4000-8000-000000000001',
    'mobile', true, true, true, true, 60, 1, true,
    'Solo Service Truck', 'M-01',
    '9a100000-0000-4000-8000-000000000001'
  );

  if coalesce((v_config ->> 'fieldOperator')::boolean, false) is not true then
    raise exception 'Mobile V1 assertion failed: owner was not enabled as explicit field operator';
  end if;
  if not exists (
    select 1 from public.mobile_service_settings s
    where s.shop_id = '9b100000-0000-4000-8000-000000000001'
      and s.service_model = 'mobile' and s.solo_mode
      and s.truck_inventory_enabled and s.default_visit_minutes = 60
  ) then
    raise exception 'Mobile V1 assertion failed: Mobile settings were not persisted';
  end if;
  if not exists (
    select 1 from public.mobile_field_operators f
    where f.shop_id = '9b100000-0000-4000-8000-000000000001'
      and f.profile_id = '9a100000-0000-4000-8000-000000000001'
      and f.enabled
  ) then
    raise exception 'Mobile V1 assertion failed: field capability missing';
  end if;
  if not exists (
    select 1 from public.scheduling_resources r
    where r.shop_id = '9b100000-0000-4000-8000-000000000001'
      and r.profile_id = '9a100000-0000-4000-8000-000000000001'
      and r.resource_type = 'technician' and r.active
  ) then
    raise exception 'Mobile V1 assertion failed: field operator did not become schedulable capacity';
  end if;
  if not exists (
    select 1
    from public.service_vehicles sv
    join public.stock_locations sl on sl.id = sv.stock_location_id
    where sv.shop_id = '9b100000-0000-4000-8000-000000000001'
      and sv.primary_user_id = '9a100000-0000-4000-8000-000000000001'
      and sv.active
      and sl.shop_id = sv.shop_id
      and sl.name like '%Inventory'
  ) then
    raise exception 'Mobile V1 assertion failed: service truck did not reuse canonical stock location';
  end if;

  select count(*) into v_before_customers
  from public.customers
  where shop_id = '9b100000-0000-4000-8000-000000000001';

  v_intake := public.mobile_create_service_call_atomic(
    '9b100000-0000-4000-8000-000000000001',
    null, 'Roadside Customer', '403-555-0199',
    null, 2017, 'Ford', 'Expedition', 'MOB0199',
    '123 Test Avenue', 'Calgary', 'AB', 'T2P 1J9',
    'Rear tire leaking after road debris',
    '2099-08-10 17:30:00+00', 60, 189.50, 'CAD',
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:intake:1'
  );

  v_visit_id := (v_intake ->> 'serviceVisitId')::uuid;
  v_booking_id := (v_intake ->> 'bookingId')::uuid;
  v_customer_id := (v_intake ->> 'customerId')::uuid;
  v_vehicle_id := (v_intake ->> 'vehicleId')::uuid;
  if v_visit_id is null or v_booking_id is null or v_customer_id is null or v_vehicle_id is null then
    raise exception 'Mobile V1 assertion failed: rapid intake did not return canonical identities';
  end if;
  if (select count(*) from public.customers where shop_id = '9b100000-0000-4000-8000-000000000001') <> v_before_customers + 1 then
    raise exception 'Mobile V1 assertion failed: rapid intake did not create exactly one customer';
  end if;
  if not exists (
    select 1 from public.bookings b
    where b.id = v_booking_id and b.shop_id = '9b100000-0000-4000-8000-000000000001'
      and b.status = 'confirmed'
      and b.lifecycle_metadata ->> 'service_mode' = 'mobile'
      and (b.lifecycle_metadata ->> 'quoted_price')::numeric = 189.50
      and b.lifecycle_metadata ->> 'source' = 'rapid_mobile_intake'
  ) then
    raise exception 'Mobile V1 assertion failed: rapid intake did not create canonical mobile booking metadata';
  end if;
  if not exists (
    select 1 from public.service_visits sv
    join public.service_addresses sa on sa.id = sv.service_address_id
    where sv.id = v_visit_id
      and sv.booking_id = v_booking_id
      and sv.work_order_id is null
      and sv.mode = 'mobile'
      and sv.status = 'scheduled'
      and sv.assigned_user_id = '9a100000-0000-4000-8000-000000000001'
      and sv.dispatch_notes = 'Rear tire leaking after road debris'
      and sa.address_line1 = '123 Test Avenue'
  ) then
    raise exception 'Mobile V1 assertion failed: booking did not materialize assigned field visit';
  end if;
  if not exists (
    select 1 from public.scheduling_reservations sr
    join public.scheduling_resources r on r.id = sr.resource_id
    join public.scheduling_events e on e.id = sr.event_id
    where e.service_visit_id = v_visit_id
      and sr.reservation_role = 'technician'
      and sr.status = 'active'
      and r.profile_id = '9a100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Mobile V1 assertion failed: solo operator was not reserved on the call';
  end if;

  v_replay := public.mobile_create_service_call_atomic(
    '9b100000-0000-4000-8000-000000000001',
    null, 'Roadside Customer', '403-555-0199',
    null, 2017, 'Ford', 'Expedition', 'MOB0199',
    '123 Test Avenue', 'Calgary', 'AB', 'T2P 1J9',
    'Rear tire leaking after road debris',
    '2099-08-10 17:30:00+00', 60, 189.50, 'CAD',
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:intake:1'
  );
  if (v_replay ->> 'serviceVisitId')::uuid <> v_visit_id
     or coalesce((v_replay ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Mobile V1 assertion failed: rapid intake retry was not idempotent';
  end if;

  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'scheduled', 'dispatched',
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:dispatched'
  );
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'dispatched', 'en_route',
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:en-route'
  );

  begin
    perform public.mobile_replay_service_visit_transition_atomic(
      '9b100000-0000-4000-8000-000000000001', v_visit_id,
      'scheduled', 'arrived',
      '9a100000-0000-4000-8000-000000000001',
      'mobile-v1:fake-day:stale-device'
    );
  exception when sqlstate '40001' then
    v_conflict := true;
  end;
  if not v_conflict then
    raise exception 'Mobile V1 assertion failed: stale offline transition was not rejected';
  end if;

  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'en_route', 'arrived',
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:arrived'
  );
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'arrived', 'working',
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:working'
  );
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'working', 'completed',
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:completed'
  );

  if not exists (
    select 1 from public.service_visits sv
    where sv.id = v_visit_id and sv.status = 'completed'
      and sv.dispatched_at is not null
      and sv.travel_started_at is not null
      and sv.arrived_at is not null
      and sv.work_started_at is not null
      and sv.completed_at is not null
  ) then
    raise exception 'Mobile V1 assertion failed: fake-day lifecycle did not complete';
  end if;
end;
$$;

rollback;

select 'mobile_v1_fake_day_ok' as result;
