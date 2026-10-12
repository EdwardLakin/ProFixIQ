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

-- Trusted (service-role) saves go through the atomic RPC.
select public.save_equipment_asset_profile(
  '69200000-0000-4000-8000-000000000001',
  '69300000-0000-4000-8000-000000000001',
  '69100000-0000-4000-8000-000000000001',
  '{"equipment_class":"crawler_excavator","equipment_family":"excavation","serial_number":"CAT0336XA","primary_meter":"hours"}'::jsonb,
  true, 4300, 4210
);
select public.save_equipment_asset_profile(
  '69200000-0000-4000-8000-000000000002',
  '69300000-0000-4000-8000-000000000003',
  '69100000-0000-4000-8000-000000000002',
  '{"equipment_class":"crawler_excavator","equipment_family":"excavation"}'::jsonb
);
select public.save_equipment_asset_profile(
  '69200000-0000-4000-8000-000000000001',
  '69300000-0000-4000-8000-000000000002',
  '69100000-0000-4000-8000-000000000001',
  '{"equipment_class":"attachment","equipment_family":"attachments","primary_meter":"none","mounted_on_vehicle_id":"69300000-0000-4000-8000-000000000001","attributes":{"width_mm":1500,"quick_coupler":true}}'::jsonb
);

do $equipment_profile_rpc$
begin
  if (select engine_hours from public.vehicles where id = '69300000-0000-4000-8000-000000000001') <> 4300 then
    raise exception 'RPC did not write the edited canonical engine hours.';
  end if;
  if (select meters_updated_at from public.equipment_asset_profiles where vehicle_id = '69300000-0000-4000-8000-000000000001') is null then
    raise exception 'RPC did not stamp meters_updated_at after a meter change.';
  end if;
  if (select attributes -> 'width_mm' from public.equipment_asset_profiles where vehicle_id = '69300000-0000-4000-8000-000000000002') <> '1500'::jsonb then
    raise exception 'RPC did not preserve typed attributes.';
  end if;

  -- A stale meter baseline is rejected and nothing is written.
  begin
    perform public.save_equipment_asset_profile(
      '69200000-0000-4000-8000-000000000001',
      '69300000-0000-4000-8000-000000000001',
      '69100000-0000-4000-8000-000000000001',
      '{"equipment_class":"crawler_excavator","equipment_family":"excavation","serial_number":"STALE"}'::jsonb,
      true, 4250, 4210
    );
    raise exception 'RPC accepted a stale engine-hours baseline.';
  exception when serialization_failure then
    null;
  end;
  if (select serial_number from public.equipment_asset_profiles where vehicle_id = '69300000-0000-4000-8000-000000000001') <> 'CAT0336XA' then
    raise exception 'Rejected stale save partially wrote the profile.';
  end if;

  -- An asset from another shop is not found.
  begin
    perform public.save_equipment_asset_profile(
      '69200000-0000-4000-8000-000000000001',
      '69300000-0000-4000-8000-000000000003',
      '69100000-0000-4000-8000-000000000001',
      '{"equipment_class":"crawler_excavator","equipment_family":"excavation"}'::jsonb
    );
    raise exception 'RPC wrote a profile for another shop''s asset.';
  exception when no_data_found then
    null;
  end;

  -- Reciprocal mounting and cross-shop hosts are rejected.
  begin
    perform public.save_equipment_asset_profile(
      '69200000-0000-4000-8000-000000000001',
      '69300000-0000-4000-8000-000000000001',
      '69100000-0000-4000-8000-000000000001',
      '{"equipment_class":"crawler_excavator","equipment_family":"excavation","mounted_on_vehicle_id":"69300000-0000-4000-8000-000000000002"}'::jsonb
    );
    raise exception 'RPC allowed two assets to be mounted on each other.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.save_equipment_asset_profile(
      '69200000-0000-4000-8000-000000000001',
      '69300000-0000-4000-8000-000000000002',
      '69100000-0000-4000-8000-000000000001',
      '{"equipment_class":"attachment","equipment_family":"attachments","mounted_on_vehicle_id":"69300000-0000-4000-8000-000000000003"}'::jsonb
    );
    raise exception 'RPC accepted a cross-shop host asset.';
  exception when check_violation then
    null;
  end;

  -- The table constraints still bound direct trusted writes.
  begin
    update public.equipment_asset_profiles
    set operating_status = 'flying'
    where vehicle_id = '69300000-0000-4000-8000-000000000001';
    raise exception 'Equipment profile accepted an unknown operating status.';
  exception when check_violation then
    null;
  end;
end
$equipment_profile_rpc$;

-- Authenticated clients have no direct access to the table or the RPC; the
-- server route enforces role, assignment and entitlement before using it.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"69100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_profile_client_denied$
begin
  begin
    perform 1 from public.equipment_asset_profiles limit 1;
    raise exception 'Authenticated client read Equipment profiles directly.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.equipment_asset_profiles
    set serial_number = 'TAMPERED'
    where vehicle_id = '69300000-0000-4000-8000-000000000001';
    raise exception 'Authenticated client updated an Equipment profile directly.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.save_equipment_asset_profile(
      '69200000-0000-4000-8000-000000000001',
      '69300000-0000-4000-8000-000000000001',
      '69100000-0000-4000-8000-000000000001',
      '{"equipment_class":"crawler_excavator","equipment_family":"excavation"}'::jsonb
    );
    raise exception 'Authenticated client executed the Equipment profile RPC.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_profile_client_denied$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $equipment_profile_anon$
begin
  begin
    perform 1 from public.equipment_asset_profiles limit 1;
    raise exception 'Anonymous actor read Equipment profiles.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_profile_anon$;
reset role;

rollback;
