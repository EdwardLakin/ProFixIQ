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

do $reject_new_mismatched_request$
begin
  begin
    perform public.create_fleet_service_request_atomic(
      '81550000-0000-4000-8000-000000000001',
      '81540000-0000-4000-8000-000000000002',
      'Phase 15 mismatched request',
      'This request must fail before Shop intake.',
      null,
      '[{"lineKind":"diagnostic","description":"Inspect legacy unit","quantity":1}]'::jsonb,
      'phase15-ownership-mismatch'
    );
    raise exception 'Mismatched Fleet unit unexpectedly created a request';
  exception
    when others then
      if sqlerrm <> 'PFX_FLEET_UNIT_OWNERSHIP_MISMATCH' then
        raise;
      end if;
  end;

  if exists (
    select 1
    from public.fleet_service_requests
    where operation_key = 'phase15-ownership-mismatch'
  ) then
    raise exception 'Rejected Fleet request left a partial row';
  end if;
end;
$reject_new_mismatched_request$;

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
end;
$create_valid_request$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

-- Reproduce a legacy enrollment that predates the ownership guard. The
-- conversion must still fail atomically at the work-order boundary.
alter table public.fleet_service_requests
  disable trigger trg_enforce_fleet_service_request_vehicle_ownership;

insert into public.fleet_service_requests (
  id, shop_id, fleet_id, vehicle_id, title, summary, severity, status,
  created_by_profile_id, operation_key, request_fingerprint
)
values (
  '81560000-0000-4000-8000-000000000002',
  '81520000-0000-4000-8000-000000000001',
  '81550000-0000-4000-8000-000000000001',
  '81540000-0000-4000-8000-000000000002',
  'Phase 15 legacy mismatched request',
  'Legacy fixture for atomic conversion rejection.',
  'recommend',
  'open',
  '81510000-0000-4000-8000-000000000001',
  'phase15-legacy-handoff',
  md5('phase15-legacy-handoff')
);

alter table public.fleet_service_requests
  enable trigger trg_enforce_fleet_service_request_vehicle_ownership;

insert into public.fleet_service_request_lines (
  id, shop_id, fleet_id, service_request_id, vehicle_id, line_kind,
  description, quantity, price_status, source_snapshot, created_by
)
values (
  '81570000-0000-4000-8000-000000000002',
  '81520000-0000-4000-8000-000000000001',
  '81550000-0000-4000-8000-000000000001',
  '81560000-0000-4000-8000-000000000002',
  '81540000-0000-4000-8000-000000000002',
  'diagnostic',
  'Inspect legacy unit',
  1,
  'advisor_pending',
  '{}'::jsonb,
  '81510000-0000-4000-8000-000000000001'
);

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
  from public.convert_fleet_service_request_to_work_order_atomic(v_request_id) result;

  select result.work_order_id, result.conversion_status
  into v_second_work_order_id, v_second_status
  from public.convert_fleet_service_request_to_work_order_atomic(v_request_id) result;

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
end;
$convert_and_replay_valid_request$;

do $reject_legacy_conversion_atomically$
declare
  legacy_request_work_order_count integer;
begin
  begin
    perform 1
    from public.convert_fleet_service_request_to_work_order_atomic(
      '81560000-0000-4000-8000-000000000002'
    );
    raise exception 'Legacy mismatched request unexpectedly converted';
  exception
    when others then
      if sqlerrm <> 'PFX_WORK_ORDER_CUSTOMER_VEHICLE_MISMATCH' then
        raise;
      end if;
  end;

  select count(*) into legacy_request_work_order_count
  from public.work_orders
  where source_fleet_service_request_id =
    '81560000-0000-4000-8000-000000000002';

  if legacy_request_work_order_count <> 0 then
    raise exception 'Rejected legacy conversion left a partial work order';
  end if;

  if not exists (
    select 1
    from public.fleet_service_requests
    where id = '81560000-0000-4000-8000-000000000002'
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
