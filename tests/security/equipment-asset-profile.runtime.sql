\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('69100000-0000-4000-8000-000000000001', 'equipment-profile-owner-a@example.test', '{"full_name":"Equipment Owner A"}'::jsonb),
  ('69100000-0000-4000-8000-000000000002', 'equipment-profile-owner-b@example.test', '{"full_name":"Equipment Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('69100000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000001', 'owner', 'Equipment Owner A'),
  ('69100000-0000-4000-8000-000000000002', '69100000-0000-4000-8000-000000000002', 'owner', 'Equipment Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('69200000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000001', 'Equipment Shop A', 'Equipment Shop A', 5),
  ('69200000-0000-4000-8000-000000000002', '69100000-0000-4000-8000-000000000002', 'Equipment Shop B', 'Equipment Shop B', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = '69100000-0000-4000-8000-000000000001'::uuid
    then '69200000-0000-4000-8000-000000000001'::uuid
  else '69200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '69100000-0000-4000-8000-000000000001',
  '69100000-0000-4000-8000-000000000002'
);

insert into public.vehicles (id, shop_id, user_id, unit_number, year, make, model, engine_hours)
values
  ('69300000-0000-4000-8000-000000000001', '69200000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000001', 'EX-1', 2021, 'Caterpillar', '336', 4210),
  ('69300000-0000-4000-8000-000000000002', '69200000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000001', 'BKT-1', 2021, 'Caterpillar', 'Bucket', null),
  ('69300000-0000-4000-8000-000000000003', '69200000-0000-4000-8000-000000000002', '69100000-0000-4000-8000-000000000002', 'EX-B', 2020, 'Komatsu', 'PC360', 900);

-- Trusted (service-role equivalent) writes: valid same-shop profiles succeed.
insert into public.equipment_asset_profiles (
  vehicle_id, shop_id, equipment_class, equipment_family, serial_number, primary_meter
)
values
  ('69300000-0000-4000-8000-000000000001', '69200000-0000-4000-8000-000000000001', 'crawler_excavator', 'excavation', 'CAT0336XA', 'hours'),
  ('69300000-0000-4000-8000-000000000003', '69200000-0000-4000-8000-000000000002', 'crawler_excavator', 'excavation', 'KMT0360XB', 'hours');

insert into public.equipment_asset_profiles (
  vehicle_id, shop_id, equipment_class, equipment_family, primary_meter, mounted_on_vehicle_id
)
values (
  '69300000-0000-4000-8000-000000000002',
  '69200000-0000-4000-8000-000000000001',
  'attachment',
  'attachments',
  'none',
  '69300000-0000-4000-8000-000000000001'
);

-- The trigger rejects a profile whose shop differs from its asset's shop.
do $equipment_profile_scope$
begin
  begin
    update public.equipment_asset_profiles
    set shop_id = '69200000-0000-4000-8000-000000000002'
    where vehicle_id = '69300000-0000-4000-8000-000000000001';
    raise exception 'Equipment profile accepted a shop that differs from its asset.';
  exception when check_violation then
    null;
  end;

  -- ...and a host asset from another shop.
  begin
    update public.equipment_asset_profiles
    set mounted_on_vehicle_id = '69300000-0000-4000-8000-000000000003'
    where vehicle_id = '69300000-0000-4000-8000-000000000002';
    raise exception 'Equipment profile accepted a cross-shop host asset.';
  exception when check_violation then
    null;
  end;

  -- ...and an unrecognised operating status / meter.
  begin
    update public.equipment_asset_profiles
    set operating_status = 'flying'
    where vehicle_id = '69300000-0000-4000-8000-000000000001';
    raise exception 'Equipment profile accepted an unknown operating status.';
  exception when check_violation then
    null;
  end;
end
$equipment_profile_scope$;

-- Shop A owner reads only Shop A profiles and cannot write directly.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"69100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_profile_rls$
begin
  if (
    select count(*) from public.equipment_asset_profiles
    where shop_id = '69200000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'Equipment profile owner could not read same-shop profiles.';
  end if;

  if exists (
    select 1 from public.equipment_asset_profiles
    where vehicle_id = '69300000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Equipment profile tenant boundary exposed Shop B.';
  end if;

  begin
    update public.equipment_asset_profiles
    set serial_number = 'TAMPERED'
    where vehicle_id = '69300000-0000-4000-8000-000000000001';
    raise exception 'Authenticated client updated an Equipment profile directly.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.equipment_asset_profiles (
      vehicle_id, shop_id, equipment_class, equipment_family
    ) values (
      '69300000-0000-4000-8000-000000000002',
      '69200000-0000-4000-8000-000000000001',
      'attachment',
      'attachments'
    );
    raise exception 'Authenticated client inserted an Equipment profile directly.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_profile_rls$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Anonymous actors see nothing.
set local role anon;
do $equipment_profile_anon$
begin
  begin
    if exists (select 1 from public.equipment_asset_profiles) then
      raise exception 'Anonymous actor read Equipment profiles.';
    end if;
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_profile_anon$;
reset role;

rollback;
