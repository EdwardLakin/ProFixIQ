\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '81510000-0000-4000-8000-000000000001',
  'phase15-fleet-shop-owner@example.test',
  '{"full_name":"Phase 15 Fleet Shop Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values (
  '81510000-0000-4000-8000-000000000001',
  '81510000-0000-4000-8000-000000000001',
  'owner',
  'Phase 15 Fleet Shop Owner'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values (
  '81520000-0000-4000-8000-000000000001',
  '81510000-0000-4000-8000-000000000001',
  'Phase 15 Connected Lifecycle Shop',
  'Phase 15 Connected Lifecycle Shop',
  5
)
on conflict (id) do nothing;

update public.profiles
set shop_id = '81520000-0000-4000-8000-000000000001'
where id = '81510000-0000-4000-8000-000000000001';

insert into public.customers (id, shop_id, user_id, name, business_name, is_fleet)
values
  (
    '81530000-0000-4000-8000-000000000001',
    '81520000-0000-4000-8000-000000000001',
    '81510000-0000-4000-8000-000000000001',
    'Phase 15 Fleet Billing Customer',
    'Phase 15 Fleet Billing Customer',
    true
  ),
  (
    '81530000-0000-4000-8000-000000000002',
    '81520000-0000-4000-8000-000000000001',
    null,
    'Phase 15 Unrelated Customer',
    null,
    false
  );

insert into public.vehicles (
  id, shop_id, user_id, customer_id, vin, license_plate, unit_number,
  year, make, model
)
values
  (
    '81540000-0000-4000-8000-000000000001',
    '81520000-0000-4000-8000-000000000001',
    '81510000-0000-4000-8000-000000000001',
    '81530000-0000-4000-8000-000000000001',
    '1FTBW1X80NKA15001',
    'P15-VALID',
    'P15-VALID',
    2022,
    'Ford',
    'Transit'
  ),
  (
    '81540000-0000-4000-8000-000000000002',
    '81520000-0000-4000-8000-000000000001',
    '81510000-0000-4000-8000-000000000001',
    '81530000-0000-4000-8000-000000000002',
    '1FTBW1X80NKA15002',
    'P15-LEGACY',
    'P15-LEGACY',
    2022,
    'Ford',
    'Transit'
  );

insert into public.fleets (
  id, shop_id, customer_id, name, active, created_by
)
values (
  '81550000-0000-4000-8000-000000000001',
  '81520000-0000-4000-8000-000000000001',
  '81530000-0000-4000-8000-000000000001',
  'Phase 15 Validation Fleet',
  true,
  '81510000-0000-4000-8000-000000000001'
);

insert into public.fleet_vehicles (fleet_id, vehicle_id, shop_id, active)
values
  (
    '81550000-0000-4000-8000-000000000001',
    '81540000-0000-4000-8000-000000000001',
    '81520000-0000-4000-8000-000000000001',
    true
  ),
  (
    '81550000-0000-4000-8000-000000000001',
    '81540000-0000-4000-8000-000000000002',
    '81520000-0000-4000-8000-000000000001',
    true
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81510000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $create_legacy_mismatched_request$
declare
  v_request_id uuid;
begin
  v_request_id := public.create_fleet_service_request_atomic(
    '81550000-0000-4000-8000-000000000001',
    '81540000-0000-4000-8000-000000000002',
    'Phase 15 legacy mismatched request',
    'This request must fail at the scoped Shop handoff.',
    null,
    '[{"lineKind":"diagnostic","description":"Inspect legacy unit","quantity":1}]'::jsonb,
    'phase15-legacy-handoff'
  );

  if v_request_id is null then
    raise exception 'Legacy Fleet request did not return an id';
  end if;
end;
$create_legacy_mismatched_request$;

do $create_valid_request$
declare
  v_request_id uuid;
begin
  v_request_id := public.create_fleet_service_request_atomic(
    '81550000-0000-4000-8000-000000000001',
    '81540000-0000-4000-8000-000000000001',
    'Phase 15 valid request',
    'This request must convert exactly once.',
    null,
    '[{"lineKind":"diagnostic","description":"Inspect valid unit","quantity":1}]'::jsonb,
    'phase15-valid-handoff'
  );

  if v_request_id is null then
    raise exception 'Valid Fleet request did not return an id';
  end if;

  perform set_config('app.phase15_valid_request_id', v_request_id::text, true);
end;
$create_valid_request$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

-- A historical work order may retain its original billed customer after the
-- vehicle changes ownership. This migration must not install a global trigger
-- that rewrites or rejects that durable historical relationship.
select set_config(
  'request.jwt.claims',
  '{"sub":"81510000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.work_orders (
  id, shop_id, customer_id, customer_name, vehicle_id, status,
  approval_state, created_by, notes
)
values (
  '81580000-0000-4000-8000-000000000001',
  '81520000-0000-4000-8000-000000000001',
  '81530000-0000-4000-8000-000000000001',
  'Phase 15 Former Owner',
  '81540000-0000-4000-8000-000000000002',
  'completed',
  'approved',
  '81510000-0000-4000-8000-000000000001',
  'Historical ownership-at-service fixture.'
);

do $assert_historical_work_order_preserved$
declare
  historical_work_order_count integer;
begin
  select count(*) into historical_work_order_count
  from public.work_orders
  where id = '81580000-0000-4000-8000-000000000001'
    and customer_id = '81530000-0000-4000-8000-000000000001'
    and vehicle_id = '81540000-0000-4000-8000-000000000002';

  if historical_work_order_count <> 1 then
    raise exception 'Historical work-order customer relationship was not preserved';
  end if;
end;
$assert_historical_work_order_preserved$;

select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

-- The replay-only resolver must never choose an arbitrary Fleet when legacy
-- data contains multiple active enrollments.
insert into public.fleets (
  id, shop_id, customer_id, name, active, created_by
)
values (
  '81550000-0000-4000-8000-000000000002',
  '81520000-0000-4000-8000-000000000001',
  '81530000-0000-4000-8000-000000000001',
  'Phase 15 Ambiguous Fleet',
  true,
  '81510000-0000-4000-8000-000000000001'
);

insert into public.fleet_vehicles (fleet_id, vehicle_id, shop_id, active)
values (
  '81550000-0000-4000-8000-000000000002',
  '81540000-0000-4000-8000-000000000001',
  '81520000-0000-4000-8000-000000000001',
  true
);

do $reject_ambiguous_vehicle_resolution$
begin
  begin
    perform public.resolve_fleet_id_from_vehicle(
      '81540000-0000-4000-8000-000000000001'
    );
    raise exception 'Ambiguous enrollment unexpectedly resolved';
  exception
    when check_violation then
      if sqlerrm <> 'PFX_FLEET_UNIT_ENROLLMENT_UNAVAILABLE' then
        raise;
      end if;
  end;
end;
$reject_ambiguous_vehicle_resolution$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '81510000-0000-4000-8000-000000000002',
  'phase15-denied-technician@example.test',
  '{"full_name":"Phase 15 Denied Technician"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, shop_id, role, full_name)
values (
  '81510000-0000-4000-8000-000000000002',
  '81510000-0000-4000-8000-000000000002',
  '81520000-0000-4000-8000-000000000001',
  'mechanic',
  'Phase 15 Denied Technician'
)
on conflict (id) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81510000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $deny_without_request_disclosure$
declare
  v_known_request_id uuid;
begin
  v_known_request_id := current_setting(
    'app.phase15_valid_request_id',
    true
  )::uuid;

  begin
    perform 1
    from public.convert_owned_fleet_service_request_to_work_order_atomic(
      v_known_request_id
    );
    raise exception 'Denied role converted a known request';
  exception
    when no_data_found then
      if sqlerrm <> 'Fleet service request is unavailable.' then
        raise;
      end if;
  end;

  begin
    perform 1
    from public.convert_owned_fleet_service_request_to_work_order_atomic(
      '81560000-0000-4000-8000-000000000099'
    );
    raise exception 'Denied role distinguished a missing request';
  exception
    when no_data_found then
      if sqlerrm <> 'Fleet service request is unavailable.' then
        raise;
      end if;
  end;
end;
$deny_without_request_disclosure$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81510000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $convert_and_replay_valid_request$
declare
  v_request_id uuid;
  v_first_work_order_id uuid;
  v_second_work_order_id uuid;
  v_first_status text;
  v_second_status text;
  converted_work_order_count integer;
begin
  select id into v_request_id
  from public.fleet_service_requests
  where operation_key = 'phase15-valid-handoff';

  select result.work_order_id, result.conversion_status
  into v_first_work_order_id, v_first_status
  from public.convert_owned_fleet_service_request_to_work_order_atomic(v_request_id) result;

  select result.work_order_id, result.conversion_status
  into v_second_work_order_id, v_second_status
  from public.convert_owned_fleet_service_request_to_work_order_atomic(v_request_id) result;

  select count(*) into converted_work_order_count
  from public.work_orders
  where source_fleet_service_request_id = v_request_id;

  if converted_work_order_count <> 1
     or v_first_work_order_id is distinct from v_second_work_order_id
     or v_first_status is distinct from 'converted'
     or v_second_status is distinct from 'already_linked'
  then
    raise exception 'Valid Fleet request conversion was not idempotent';
  end if;

  if not exists (
    select 1
    from public.work_orders wo
    join public.vehicles v on v.id = wo.vehicle_id
    where wo.id = v_first_work_order_id
      and wo.customer_id = v.customer_id
      and wo.customer_id = '81530000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Converted work order lost canonical customer ownership';
  end if;

  if not exists (
    select 1
    from public.work_order_lines line
    where line.work_order_id = v_first_work_order_id
      and line.job_type = 'diagnosis'
  ) then
    raise exception 'Fleet diagnostic line was not translated to diagnosis';
  end if;
end;
$convert_and_replay_valid_request$;

do $reject_legacy_conversion_atomically$
declare
  v_request_id uuid;
  legacy_request_work_order_count integer;
begin
  select id into v_request_id
  from public.fleet_service_requests
  where operation_key = 'phase15-legacy-handoff';

  begin
    perform 1
    from public.convert_owned_fleet_service_request_to_work_order_atomic(
      v_request_id
    );
    raise exception 'Legacy mismatched request unexpectedly converted';
  exception
    when others then
      if sqlerrm <> 'PFX_FLEET_HANDOFF_UNAVAILABLE' then
        raise;
      end if;
  end;

  select count(*) into legacy_request_work_order_count
  from public.work_orders
  where source_fleet_service_request_id = v_request_id;

  if legacy_request_work_order_count <> 0 then
    raise exception 'Rejected legacy conversion left a partial work order';
  end if;

  if not exists (
    select 1
    from public.fleet_service_requests
    where id = v_request_id
      and work_order_id is null
      and status = 'open'
  ) then
    raise exception 'Rejected legacy conversion mutated the Fleet request';
  end if;
end;
$reject_legacy_conversion_atomically$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

rollback;
