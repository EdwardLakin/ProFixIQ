\set ON_ERROR_STOP on

begin;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.consume_vehicle_recall_fetch_quota(uuid,uuid,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.consume_vehicle_recall_fetch_quota(uuid,uuid,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.consume_vehicle_recall_fetch_quota(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'P0-004 runtime assertion failed: recall quota ACL is unsafe';
  end if;

  if has_table_privilege(
    'anon',
    'public.vehicle_recall_fetch_limits',
    'SELECT'
  )
  or has_table_privilege(
    'authenticated',
    'public.vehicle_recall_fetch_limits',
    'SELECT'
  ) then
    raise exception 'P0-004 runtime assertion failed: recall quota table is exposed';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '44000000-0000-4000-8000-000000000001',
    'p0-004-owner-a@example.com',
    '{"full_name":"P0-004 Owner A"}'::jsonb
  ),
  (
    '45000000-0000-4000-8000-000000000002',
    'p0-004-owner-b@example.com',
    '{"full_name":"P0-004 Owner B"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '44000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    'owner',
    'P0-004 Owner A'
  ),
  (
    '45000000-0000-4000-8000-000000000002',
    '45000000-0000-4000-8000-000000000002',
    'owner',
    'P0-004 Owner B'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  (
    'a4100000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    'P0-004 Shop A',
    'P0-004 Shop A',
    3
  ),
  (
    'b4200000-0000-4000-8000-000000000002',
    '45000000-0000-4000-8000-000000000002',
    'P0-004 Shop B',
    'P0-004 Shop B',
    3
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '44000000-0000-4000-8000-000000000001'::uuid
    then 'a4100000-0000-4000-8000-000000000001'::uuid
  else 'b4200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '44000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000002'
);

insert into public.vehicles (id, shop_id, user_id, vin, year, make, model)
values
  (
    'a4300000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    '1HGCM82633A004352',
    2003,
    'Honda',
    'Accord'
  ),
  (
    'b4400000-0000-4000-8000-000000000002',
    'b4200000-0000-4000-8000-000000000002',
    '45000000-0000-4000-8000-000000000002',
    '1HGCM82633A004352',
    2003,
    'Honda',
    'Accord'
  );

-- The same VIN/campaign may exist in separate tenant vehicle records.
insert into public.vehicle_recalls (
  shop_id,
  vehicle_id,
  user_id,
  vin,
  campaign_number
)
values
  (
    'a4100000-0000-4000-8000-000000000001',
    'a4300000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    '1HGCM82633A004352',
    '24V001000'
  ),
  (
    'b4200000-0000-4000-8000-000000000002',
    'b4400000-0000-4000-8000-000000000002',
    '45000000-0000-4000-8000-000000000002',
    '1HGCM82633A004352',
    '24V001000'
  );

do $$
begin
  begin
    insert into public.vehicle_recalls (
      shop_id,
      vehicle_id,
      user_id,
      vin,
      campaign_number
    ) values (
      'b4200000-0000-4000-8000-000000000002',
      'a4300000-0000-4000-8000-000000000001',
      '45000000-0000-4000-8000-000000000002',
      '1HGCM82633A004352',
      '24V002000'
    );
    raise exception 'P0-004 runtime assertion failed: mismatched vehicle/shop was accepted';
  exception
    when foreign_key_violation then null;
  end;
end
$$;

set local role service_role;

do $$
declare
  v_attempt integer;
  v_allowed_count integer;
  v_allowed boolean;
  v_retry integer;
begin
  v_allowed_count := 0;
  for v_attempt in 1..12 loop
    select allowed
    into v_allowed
    from public.consume_vehicle_recall_fetch_quota(
      'a4100000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000001',
      'a4300000-0000-4000-8000-000000000001'
    );
    if v_allowed then
      v_allowed_count := v_allowed_count + 1;
    end if;
  end loop;

  if v_allowed_count <> 12 then
    raise exception 'P0-004 runtime assertion failed: valid quota calls were denied';
  end if;

  select allowed, retry_after_seconds
  into v_allowed, v_retry
  from public.consume_vehicle_recall_fetch_quota(
    'a4100000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    'a4300000-0000-4000-8000-000000000001'
  );

  if v_allowed or v_retry < 1 then
    raise exception 'P0-004 runtime assertion failed: vehicle quota was not enforced';
  end if;
end
$$;

reset role;
rollback;
