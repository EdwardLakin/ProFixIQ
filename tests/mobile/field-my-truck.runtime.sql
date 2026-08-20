\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('8f100000-0000-4000-8000-000000000001', 'field-my-truck-one@example.com', '{}'::jsonb),
  ('8f100000-0000-4000-8000-000000000002', 'field-my-truck-two@example.com', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  '8f100000-0000-4000-8000-000000000001',
  '8f100000-0000-4000-8000-000000000001',
  'owner',
  'Field Truck One',
  'field-my-truck-one@example.com',
  null
)
on conflict (id) do update set user_id = excluded.user_id, shop_id = null;

insert into public.shops (
  id, owner_id, business_name, name, user_limit, accepts_online_booking,
  min_notice_minutes, max_lead_days, location_type, country,
  billing_entitlement_override, subscription_package
)
values (
  '8f200000-0000-4000-8000-000000000001',
  '8f100000-0000-4000-8000-000000000001',
  'Field My Truck Runtime',
  'Field My Truck Runtime',
  10,
  true,
  0,
  365,
  'repair_facility',
  'CA',
  'internal_demo',
  'complete_operations'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = '8f200000-0000-4000-8000-000000000001'
where id = '8f100000-0000-4000-8000-000000000001';

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  '8f100000-0000-4000-8000-000000000002',
  '8f100000-0000-4000-8000-000000000002',
  'mechanic',
  'Field Truck Two',
  'field-my-truck-two@example.com',
  '8f200000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set user_id = excluded.user_id, shop_id = excluded.shop_id;

insert into public.mobile_service_settings (
  shop_id, service_model, service_vehicles_enabled,
  onboarding_completed_at, configured_by
)
values (
  '8f200000-0000-4000-8000-000000000001',
  'mobile',
  true,
  now(),
  '8f100000-0000-4000-8000-000000000001'
)
on conflict (shop_id) do update
set service_model = 'mobile',
    service_vehicles_enabled = true,
    onboarding_completed_at = now();

insert into public.mobile_field_operators (shop_id, profile_id, enabled)
values
  ('8f200000-0000-4000-8000-000000000001', '8f100000-0000-4000-8000-000000000001', true),
  ('8f200000-0000-4000-8000-000000000001', '8f100000-0000-4000-8000-000000000002', true)
on conflict (shop_id, profile_id) do update set enabled = true;

insert into public.service_vehicles (
  id, shop_id, name, unit_number, primary_user_id, active, capabilities
)
values
  (
    '8f300000-0000-4000-8000-000000000001',
    '8f200000-0000-4000-8000-000000000001',
    'Field Truck One',
    'FT-1',
    '8f100000-0000-4000-8000-000000000001',
    true,
    '{"mobile_v1":true}'::jsonb
  ),
  (
    '8f300000-0000-4000-8000-000000000002',
    '8f200000-0000-4000-8000-000000000001',
    'Field Truck Two',
    'FT-2',
    '8f100000-0000-4000-8000-000000000002',
    true,
    '{"mobile_v1":true}'::jsonb
  )
on conflict (id) do nothing;

insert into public.field_service_vehicle_assignments (
  shop_id, service_vehicle_id, profile_id, assigned_by_profile_id
)
values
  (
    '8f200000-0000-4000-8000-000000000001',
    '8f300000-0000-4000-8000-000000000001',
    '8f100000-0000-4000-8000-000000000001',
    '8f100000-0000-4000-8000-000000000001'
  ),
  (
    '8f200000-0000-4000-8000-000000000001',
    '8f300000-0000-4000-8000-000000000002',
    '8f100000-0000-4000-8000-000000000002',
    '8f100000-0000-4000-8000-000000000001'
  )
on conflict do nothing;

insert into public.field_truck_records (
  id, shop_id, service_vehicle_id, operation_key, record_type, title,
  due_on, status, created_by_profile_id
)
values (
  '8f400000-0000-4000-8000-000000000002',
  '8f200000-0000-4000-8000-000000000001',
  '8f300000-0000-4000-8000-000000000002',
  'runtime-truck-two-reminder',
  'reminder',
  'Truck two reminder',
  current_date + 5,
  'open',
  '8f100000-0000-4000-8000-000000000002'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8f100000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible
  from public.field_truck_records
  where service_vehicle_id = '8f300000-0000-4000-8000-000000000002';
  if v_visible <> 0 then
    raise exception 'My Truck runtime failed: operator one can read operator two records';
  end if;

  begin
    insert into public.field_truck_records (
      shop_id, service_vehicle_id, operation_key, record_type, title,
      occurred_on, odometer, odometer_unit, status, created_by_profile_id
    ) values (
      '8f200000-0000-4000-8000-000000000001',
      '8f300000-0000-4000-8000-000000000002',
      'runtime-forged-reading',
      'odometer',
      'Forged truck reading',
      current_date,
      123,
      'km',
      'completed',
      '8f100000-0000-4000-8000-000000000001'
    );
    raise exception 'My Truck runtime failed: cross-truck insert was accepted';
  exception when insufficient_privilege then
    null;
  end;

  insert into public.field_truck_records (
    id, shop_id, service_vehicle_id, operation_key, record_type, title,
    due_on, status, created_by_profile_id
  ) values (
    '8f400000-0000-4000-8000-000000000001',
    '8f200000-0000-4000-8000-000000000001',
    '8f300000-0000-4000-8000-000000000001',
    'runtime-truck-one-reminder',
    'reminder',
    'Truck one reminder',
    current_date + 5,
    'open',
    '8f100000-0000-4000-8000-000000000001'
  );

  begin
    insert into public.field_truck_records (
      id, shop_id, service_vehicle_id, operation_key, record_type, title,
      status, file_bucket, file_path, original_filename, content_type,
      file_size_bytes, created_by_profile_id
    ) values (
      '8f400000-0000-4000-8000-000000000003',
      '8f200000-0000-4000-8000-000000000001',
      '8f300000-0000-4000-8000-000000000001',
      'runtime-forged-file-path',
      'document',
      'Forged document path',
      'completed',
      'field-truck-files',
      '8f200000-0000-4000-8000-000000000001/8f300000-0000-4000-8000-000000000002/documents/8f400000-0000-4000-8000-000000000003/secret.pdf',
      'secret.pdf',
      'application/pdf',
      100,
      '8f100000-0000-4000-8000-000000000001'
    );
    raise exception 'My Truck runtime failed: forged file path was accepted';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.field_truck_records (
      shop_id, service_vehicle_id, operation_key, record_type, title,
      occurred_on, amount, currency, status, created_by_profile_id
    ) values (
      '8f200000-0000-4000-8000-000000000001',
      '8f300000-0000-4000-8000-000000000001',
      'runtime-invalid-currency',
      'expense',
      'Invalid currency',
      current_date,
      1,
      'X',
      'completed',
      '8f100000-0000-4000-8000-000000000001'
    );
    raise exception 'My Truck runtime failed: invalid currency was accepted';
  exception when check_violation then
    null;
  end;

  begin
    update public.field_truck_records
    set status = 'completed'
    where id = '8f400000-0000-4000-8000-000000000001';
    raise exception 'My Truck runtime failed: direct status update was accepted';
  exception when insufficient_privilege then
    null;
  end;

  perform public.field_transition_truck_record(
    '8f400000-0000-4000-8000-000000000001',
    'complete',
    null
  );
  if not exists (
    select 1 from public.field_truck_records
    where id = '8f400000-0000-4000-8000-000000000001'
      and status = 'completed'
  ) then
    raise exception 'My Truck runtime failed: assigned reminder was not completed';
  end if;

  -- Lost HTTP responses must be safe to retry.
  perform public.field_transition_truck_record(
    '8f400000-0000-4000-8000-000000000001',
    'complete',
    null
  );
  perform public.field_transition_truck_record(
    '8f400000-0000-4000-8000-000000000001',
    'reopen',
    null
  );
  perform public.field_transition_truck_record(
    '8f400000-0000-4000-8000-000000000001',
    'reopen',
    null
  );

  begin
    perform public.field_transition_truck_record(
      '8f400000-0000-4000-8000-000000000001',
      'end_downtime',
      now()
    );
    raise exception 'My Truck runtime failed: invalid record transition was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    update public.field_truck_records
    set title = 'Rewritten audit history'
    where id = '8f400000-0000-4000-8000-000000000001';
    raise exception 'My Truck runtime failed: immutable history field was updated';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

-- Legacy scheduler writes to primary_user_id must not grant My Truck access.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8f100000-0000-4000-8000-000000000002', true);
set local role authenticated;

update public.service_vehicles
set primary_user_id = '8f100000-0000-4000-8000-000000000002'
where id = '8f300000-0000-4000-8000-000000000001';

do $$
begin
  if exists (
    select 1
    from public.field_truck_records
    where service_vehicle_id = '8f300000-0000-4000-8000-000000000001'
  ) then
    raise exception 'My Truck runtime failed: mutable scheduler assignment granted ledger access';
  end if;

  begin
    insert into public.field_service_vehicle_assignments (
      shop_id, service_vehicle_id, profile_id
    ) values (
      '8f200000-0000-4000-8000-000000000001',
      '8f300000-0000-4000-8000-000000000001',
      '8f100000-0000-4000-8000-000000000002'
    );
    raise exception 'My Truck runtime failed: operator self-assignment was accepted';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
rollback;
