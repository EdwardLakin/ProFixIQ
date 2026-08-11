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
  location_type, country, billing_entitlement_override
)
values (
  '9b100000-0000-4000-8000-000000000001',
  '9a100000-0000-4000-8000-000000000001',
  'Mobile V1 Runtime', 'Mobile V1 Runtime', 10,
  true, 0, 365, 'mobile_service_branch', 'US', 'internal_demo'
)
on conflict (id) do update
set country = 'US',
    billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = '9b100000-0000-4000-8000-000000000001'
where id = '9a100000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '9a100000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

do $$
declare
  v_config jsonb;
  v_intake jsonb;
  v_replay jsonb;
  v_handoff jsonb;
  v_followup jsonb;
  v_visit_id uuid;
  v_booking_id uuid;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_work_order_id uuid;
  v_followup_id uuid;
  v_version integer;
  v_stale_working_version integer;
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
  ) then
    raise exception 'Mobile V1 assertion failed: service truck did not reuse canonical stock location';
  end if;

  select count(*) into v_before_customers
  from public.customers
  where shop_id = '9b100000-0000-4000-8000-000000000001';

  -- Pass a deliberately wrong client currency. Canonical locale must come from
  -- the US shop, not the request.
  v_intake := public.mobile_create_service_call_atomic(
    '9b100000-0000-4000-8000-000000000001',
    null, 'Roadside Customer', '303-555-0199',
    null, 2017, 'Ford', 'Expedition', 'MOB0199',
    '123 Test Avenue', 'Denver', 'CO', '80202',
    'Rear tire leaking after road debris',
    '2099-08-10 17:30:00+00', 60, 189.50, 'CAD', 'mobile',
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
  if v_intake ->> 'currency' <> 'USD' or v_intake ->> 'countryCode' <> 'US' then
    raise exception 'Mobile V1 assertion failed: rapid intake did not derive US locale from shop';
  end if;
  if (select count(*) from public.customers where shop_id = '9b100000-0000-4000-8000-000000000001') <> v_before_customers + 1 then
    raise exception 'Mobile V1 assertion failed: rapid intake did not create exactly one customer';
  end if;
  if not exists (
    select 1 from public.bookings b
    where b.id = v_booking_id
      and b.lifecycle_metadata ->> 'quoted_currency' = 'USD'
      and b.lifecycle_metadata ->> 'source' = 'rapid_mobile_intake'
  ) then
    raise exception 'Mobile V1 assertion failed: booking locale metadata was not canonical';
  end if;
  if not exists (
    select 1 from public.service_visits sv
    join public.service_addresses sa on sa.id = sv.service_address_id
    where sv.id = v_visit_id
      and sv.booking_id = v_booking_id
      and sv.work_order_id is null
      and sv.status = 'scheduled'
      and sv.assigned_user_id = '9a100000-0000-4000-8000-000000000001'
      and sa.country_code = 'US'
  ) then
    raise exception 'Mobile V1 assertion failed: booking did not materialize assigned US field visit';
  end if;

  v_replay := public.mobile_create_service_call_atomic(
    '9b100000-0000-4000-8000-000000000001',
    null, 'Roadside Customer', '303-555-0199',
    null, 2017, 'Ford', 'Expedition', 'MOB0199',
    '123 Test Avenue', 'Denver', 'CO', '80202',
    'Rear tire leaking after road debris',
    '2099-08-10 17:30:00+00', 60, 189.50, 'CAD', 'mobile',
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:intake:1'
  );
  if (v_replay ->> 'serviceVisitId')::uuid <> v_visit_id
     or coalesce((v_replay ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Mobile V1 assertion failed: rapid intake retry was not idempotent';
  end if;

  -- Explicitly materialize the repair WO from the booking-backed visit.
  v_handoff := public.mobile_materialize_service_visit_work_order_atomic(
    '9b100000-0000-4000-8000-000000000001',
    v_visit_id,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:work-order'
  );
  v_work_order_id := (v_handoff ->> 'workOrderId')::uuid;
  if v_work_order_id is null then
    raise exception 'Mobile V1 assertion failed: call-to-WO handoff returned no work order';
  end if;
  if not exists (
    select 1
    from public.bookings b
    join public.service_visits sv on sv.booking_id = b.id
    where b.id = v_booking_id
      and b.work_order_id = v_work_order_id
      and sv.id = v_visit_id
      and sv.work_order_id = v_work_order_id
  ) then
    raise exception 'Mobile V1 assertion failed: booking and visit did not converge on the work order';
  end if;

  -- Future-work recommendation can leave the open queue canonically.
  v_followup := public.mobile_create_service_followup_atomic(
    '9b100000-0000-4000-8000-000000000001',
    v_work_order_id, v_visit_id,
    'Replace remaining tires before winter', 'quote_later', 1200, null, null,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:followup'
  );
  v_followup_id := (v_followup ->> 'followupId')::uuid;
  perform public.mobile_update_service_followup_status_atomic(
    '9b100000-0000-4000-8000-000000000001',
    v_followup_id, 'quoted', null,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:followup:quoted'
  );
  if not exists (
    select 1 from public.mobile_service_followups f
    where f.id = v_followup_id and f.status = 'quoted' and f.quoted_at is not null
  ) then
    raise exception 'Mobile V1 assertion failed: follow-up did not leave open queue';
  end if;

  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'scheduled', 'dispatched', v_version,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:dispatched'
  );

  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'dispatched', 'en_route', v_version,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:en-route'
  );

  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'en_route', 'arrived', v_version,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:arrived'
  );

  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'arrived', 'working', v_version,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:working'
  );
  select version into v_stale_working_version from public.service_visits where id = v_visit_id;

  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'working', 'paused', v_version,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:paused'
  );
  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'paused', 'working', v_version,
    '9a100000-0000-4000-8000-000000000001',
    'mobile-v1:fake-day:resumed'
  );

  -- The status is working again, but the original working version is stale.
  begin
    perform public.mobile_replay_service_visit_transition_atomic(
      '9b100000-0000-4000-8000-000000000001', v_visit_id,
      'working', 'paused', v_stale_working_version,
      '9a100000-0000-4000-8000-000000000001',
      'mobile-v1:fake-day:aba-stale'
    );
  exception when sqlstate '40001' then
    v_conflict := true;
  end;
  if not v_conflict then
    raise exception 'Mobile V1 assertion failed: ABA stale transition was not rejected';
  end if;

  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b100000-0000-4000-8000-000000000001', v_visit_id,
    'working', 'completed', v_version,
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

  -- Once no active visits remain, disabling truck tracking must make the
  -- Mobile-managed truck unavailable and detach its stock-location relationship.
  perform public.mobile_configure_service_v1_atomic(
    '9b100000-0000-4000-8000-000000000001',
    'mobile', true, false, false, true, 60, 1, true,
    null, null,
    '9a100000-0000-4000-8000-000000000001'
  );
  if exists (
    select 1 from public.service_vehicles sv
    where sv.shop_id = '9b100000-0000-4000-8000-000000000001'
      and coalesce(sv.capabilities, '{}'::jsonb) @> '{"mobile_v1":true}'::jsonb
      and (sv.active or sv.stock_location_id is not null)
  ) then
    raise exception 'Mobile V1 assertion failed: disabled truck remained live in Dispatch/inventory';
  end if;
  if exists (
    select 1 from public.mobile_service_settings s
    where s.shop_id = '9b100000-0000-4000-8000-000000000001'
      and s.truck_inventory_enabled
  ) then
    raise exception 'Mobile V1 assertion failed: subordinate truck inventory stayed enabled';
  end if;
end;
$$;

reset role;
rollback;

select 'mobile_v1_fake_day_ok' as result;
