\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f5100000-0000-4000-8000-000000000001', 'equipment-fluid-owner-a@example.test', '{"full_name":"Fluid Owner A"}'::jsonb),
  ('f5100000-0000-4000-8000-000000000002', 'equipment-fluid-owner-b@example.test', '{"full_name":"Fluid Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('f5100000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001', 'owner', 'Fluid Owner A'),
  ('f5100000-0000-4000-8000-000000000002', 'f5100000-0000-4000-8000-000000000002', 'owner', 'Fluid Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001', 'Fluid Shop A', 'Fluid Shop A', 5),
  ('f5200000-0000-4000-8000-000000000002', 'f5100000-0000-4000-8000-000000000002', 'Fluid Shop B', 'Fluid Shop B', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = 'f5100000-0000-4000-8000-000000000001'::uuid
    then 'f5200000-0000-4000-8000-000000000001'::uuid
  else 'f5200000-0000-4000-8000-000000000002'::uuid
end
where id in ('f5100000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000002');

insert into public.vehicles (id, shop_id, user_id, unit_number, year, make, model, engine_hours)
values
  ('f5300000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001', 'EX-1', 2020, 'Caterpillar', '336', 6200),
  ('f5300000-0000-4000-8000-000000000002', 'f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001', 'EX-2', 2019, 'Komatsu', 'PC360', 8100),
  ('f5300000-0000-4000-8000-000000000003', 'f5200000-0000-4000-8000-000000000002', 'f5100000-0000-4000-8000-000000000002', 'B-1', 2018, 'Deere', '350G', 900);

do $equipment_fluid_rpc$
declare
  shop_a constant uuid := 'f5200000-0000-4000-8000-000000000001';
  shop_b constant uuid := 'f5200000-0000-4000-8000-000000000002';
  actor constant uuid := 'f5100000-0000-4000-8000-000000000001';
  actor_b constant uuid := 'f5100000-0000-4000-8000-000000000002';
  asset_1 constant uuid := 'f5300000-0000-4000-8000-000000000001';
  asset_2 constant uuid := 'f5300000-0000-4000-8000-000000000002';
  asset_b constant uuid := 'f5300000-0000-4000-8000-000000000003';
  results_json constant jsonb :=
    '[{"analyte":"iron","value":42,"unit":"ppm","lab_flag":"caution"},{"analyte":"silicon","value":9,"unit":"ppm"},{"analyte":"viscosity_100c","value":14.2,"unit":"cSt","lab_flag":"normal"}]';
  v_engine uuid;
  v_other_engine uuid;
  v_b_engine uuid;
  v_sample_json jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_sample uuid;
begin
  -- Components: one on asset 1, one on asset 2, one in shop B.
  perform public.equipment_component_seed(
    shop_a, actor, asset_1,
    '[{"key":"engine","parent_key":null,"component_type":"engine","position":null,"label":"Engine"}]'::jsonb,
    6200
  );
  select id into v_engine from public.equipment_components
  where installed_vehicle_id = asset_1 and component_type = 'engine';
  perform public.equipment_component_seed(
    shop_a, actor, asset_2,
    '[{"key":"engine","parent_key":null,"component_type":"engine","position":null,"label":"Engine"}]'::jsonb,
    8100
  );
  select id into v_other_engine from public.equipment_components
  where installed_vehicle_id = asset_2 and component_type = 'engine';
  perform public.equipment_component_seed(
    shop_b, actor_b, asset_b,
    '[{"key":"engine","parent_key":null,"component_type":"engine","position":null,"label":"Engine"}]'::jsonb,
    900
  );
  select id into v_b_engine from public.equipment_components
  where installed_vehicle_id = asset_b and component_type = 'engine';

  v_sample_json := jsonb_build_object(
    'component_id', v_engine, 'fluid_type', 'engine_oil', 'sampled_at', now(),
    'asset_hours', 6200, 'fluid_hours', 250, 'lab_name', 'Lab Co',
    'lab_report_number', 'R-1001', 'lab_status', 'caution', 'notes', 'Routine'
  );

  -- Sample and results are written together; a retry with the same key
  -- returns the original without duplicating anything.
  v_result := public.equipment_fluid_sample_record(
    shop_a, actor, asset_1, v_sample_json, results_json, 'f5500000-0000-4000-8000-000000000001'
  );
  v_replay := public.equipment_fluid_sample_record(
    shop_a, actor, asset_1, v_sample_json, results_json, 'f5500000-0000-4000-8000-000000000001'
  );
  v_sample := (v_result ->> 'id')::uuid;
  if v_replay <> v_result
     or (select count(*) from public.equipment_fluid_samples where vehicle_id = asset_1) <> 1
     or (select count(*) from public.equipment_fluid_sample_results where sample_id = v_sample) <> 3 then
    raise exception 'Retried sample record was not idempotent.';
  end if;
  if (select lab_status from public.equipment_fluid_samples where id = v_sample) <> 'caution'
     or (select lab_flag from public.equipment_fluid_sample_results where sample_id = v_sample and analyte = 'iron') <> 'caution'
     or (select lab_flag from public.equipment_fluid_sample_results where sample_id = v_sample and analyte = 'silicon') is not null
     or (select string_agg(analyte, ',' order by position) from public.equipment_fluid_sample_results where sample_id = v_sample)
        <> 'iron,silicon,viscosity_100c' then
    raise exception 'Sample status or result flags were not stored as reported.';
  end if;

  -- A reused key with a different payload is refused.
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, v_sample_json || '{"lab_report_number":"R-9"}', results_json,
      'f5500000-0000-4000-8000-000000000001'
    );
    raise exception 'A reused operation key with a different payload was accepted.';
  exception when sqlstate '22023' then
    null;
  end;

  -- The same lab report number cannot be entered twice on an asset (case and
  -- spacing ignored), but another asset may use it.
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, v_sample_json || '{"lab_report_number":" r-1001 "}', '[]'::jsonb,
      'f5500000-0000-4000-8000-000000000002'
    );
    raise exception 'A duplicate lab report number was accepted.';
  exception when unique_violation then
    null;
  end;
  if exists (
    select 1 from public.equipment_fluid_sample_operations
    where operation_key = 'f5500000-0000-4000-8000-000000000002'
  ) then
    raise exception 'A failed record left an operation receipt behind.';
  end if;
  perform public.equipment_fluid_sample_record(
    shop_a, actor, asset_2,
    jsonb_build_object('fluid_type', 'hydraulic', 'lab_report_number', 'R-1001'), '[]'::jsonb,
    'f5500000-0000-4000-8000-000000000003'
  );

  -- Atomic: a bad result rolls back the whole sample.
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1,
      jsonb_build_object('fluid_type', 'hydraulic', 'lab_report_number', 'R-2001'),
      '[{"analyte":"iron","value":3,"unit":"ppm"},{"analyte":"Bad Name","value":1}]'::jsonb,
      'f5500000-0000-4000-8000-000000000004'
    );
    raise exception 'A sample with an invalid result was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1,
      jsonb_build_object('fluid_type', 'hydraulic', 'lab_report_number', 'R-2002'),
      '[{"analyte":"iron","value":3},{"analyte":"iron","value":4}]'::jsonb,
      'f5500000-0000-4000-8000-000000000005'
    );
    raise exception 'A sample with a duplicate analyte was accepted.';
  exception when unique_violation then
    null;
  end;
  if exists (
    select 1 from public.equipment_fluid_samples
    where vehicle_id = asset_1 and lab_report_number in ('R-2001', 'R-2002')
  ) then
    raise exception 'A failed sample record was partially written.';
  end if;

  -- Shapes: fluid type, lab status, flags and distance unit are checked.
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, '{"fluid_type":"milk"}', '[]', 'f5500000-0000-4000-8000-000000000006'
    );
    raise exception 'An unknown fluid type was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, '{"fluid_type":"coolant","lab_status":"great"}', '[]',
      'f5500000-0000-4000-8000-000000000007'
    );
    raise exception 'An unknown lab status was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, '{"fluid_type":"coolant"}', '[{"analyte":"iron","value":1,"lab_flag":"bad"}]',
      'f5500000-0000-4000-8000-000000000008'
    );
    raise exception 'An unknown lab flag was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, '{"fluid_type":"coolant","fluid_distance":500}', '[]',
      'f5500000-0000-4000-8000-000000000009'
    );
    raise exception 'A fluid distance without a unit was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, jsonb_build_object('fluid_type', 'coolant', 'sampled_at', now() + interval '5 days'),
      '[]', 'f5500000-0000-4000-8000-000000000010'
    );
    raise exception 'A future-dated sample was accepted.';
  exception when sqlstate '22023' then
    null;
  end;

  -- Components: only one installed on this asset, in this shop.
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, jsonb_build_object('fluid_type', 'engine_oil', 'component_id', v_other_engine),
      '[]', 'f5500000-0000-4000-8000-000000000011'
    );
    raise exception 'A component from another asset was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_record(
      shop_a, actor, asset_1, jsonb_build_object('fluid_type', 'engine_oil', 'component_id', v_b_engine),
      '[]', 'f5500000-0000-4000-8000-000000000012'
    );
    raise exception 'A component from another shop was accepted.';
  exception when check_violation then
    null;
  end;

  -- Tenant scope: another shop cannot record on or void this shop's records.
  begin
    perform public.equipment_fluid_sample_record(
      shop_b, actor_b, asset_1, '{"fluid_type":"engine_oil"}', '[]', 'f5500000-0000-4000-8000-000000000013'
    );
    raise exception 'Another shop recorded a sample on this shop''s asset.';
  exception when sqlstate 'P0002' then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_void(
      shop_b, actor_b, v_sample, 'Wrong', 'f5500000-0000-4000-8000-000000000014'
    );
    raise exception 'Another shop voided this shop''s sample.';
  exception when sqlstate 'P0002' then
    null;
  end;

  -- Append-only: samples and results are never edited or extended later.
  begin
    update public.equipment_fluid_samples set lab_status = 'normal' where id = v_sample;
    raise exception 'A sample was edited in place.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    update public.equipment_fluid_sample_results set value = 1 where sample_id = v_sample;
    raise exception 'A sample result was edited in place.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    update public.equipment_fluid_samples set component_id = null where id = v_sample;
    raise exception 'A sample component link was cleared while the component exists.';
  exception when insufficient_privilege then
    null;
  end;

  -- A void happens once, with a reason, and is retry-safe.
  begin
    perform public.equipment_fluid_sample_void(shop_a, actor, v_sample, '  ', 'f5500000-0000-4000-8000-000000000020');
    raise exception 'A void without a reason was accepted.';
  exception when sqlstate '22023' then
    null;
  end;
  v_result := public.equipment_fluid_sample_void(shop_a, actor, v_sample, 'Wrong machine', 'f5500000-0000-4000-8000-000000000021');
  v_replay := public.equipment_fluid_sample_void(shop_a, actor, v_sample, 'Wrong machine', 'f5500000-0000-4000-8000-000000000021');
  if v_replay <> v_result
     or (select void_reason from public.equipment_fluid_samples where id = v_sample) <> 'Wrong machine'
     or (select count(*) from public.equipment_fluid_sample_results where sample_id = v_sample) <> 3 then
    raise exception 'Sample void was not recorded once with its results kept.';
  end if;
  begin
    perform public.equipment_fluid_sample_void(shop_a, actor, v_sample, 'Again', 'f5500000-0000-4000-8000-000000000022');
    raise exception 'A sample was voided twice.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    update public.equipment_fluid_samples set void_reason = 'Changed' where id = v_sample;
    raise exception 'A void reason was changed.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.equipment_fluid_sample_results (shop_id, sample_id, position, analyte, value)
    values (shop_a, v_sample, 9, 'copper', 1);
    raise exception 'A result was added to a voided sample.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.equipment_fluid_sample_results (shop_id, sample_id, position, analyte, value)
    values (shop_b, v_sample, 9, 'copper', 1);
    raise exception 'A result was added under another shop.';
  exception when check_violation then
    null;
  end;

  -- Voiding frees the lab report number for a corrected entry.
  perform public.equipment_fluid_sample_record(
    shop_a, actor, asset_1, v_sample_json, results_json, 'f5500000-0000-4000-8000-000000000023'
  );
end
$equipment_fluid_rpc$;

-- Clients have no direct access to fluid sample tables or RPCs.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f5100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_fluid_client_denied$
begin
  begin
    perform 1 from public.equipment_fluid_samples limit 1;
    raise exception 'Authenticated client read fluid samples directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.equipment_fluid_sample_results limit 1;
    raise exception 'Authenticated client read fluid sample results directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_record(
      'f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001',
      'f5300000-0000-4000-8000-000000000001', '{"fluid_type":"engine_oil"}', '[]',
      'f5500000-0000-4000-8000-000000000040'
    );
    raise exception 'Authenticated client executed the fluid sample record RPC.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_fluid_sample_void(
      'f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001',
      (select gen_random_uuid()), 'x', 'f5500000-0000-4000-8000-000000000041'
    );
    raise exception 'Authenticated client executed the fluid sample void RPC.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_fluid_client_denied$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $equipment_fluid_anon$
begin
  begin
    perform 1 from public.equipment_fluid_samples limit 1;
    raise exception 'Anonymous actor read fluid samples.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_fluid_anon$;
reset role;

-- Deleting a component keeps its samples and clears the link.
delete from public.equipment_components
where installed_vehicle_id = 'f5300000-0000-4000-8000-000000000001' and component_type = 'engine';
do $equipment_fluid_component_delete$
begin
  if exists (
    select 1 from public.equipment_fluid_samples
    where vehicle_id = 'f5300000-0000-4000-8000-000000000001' and component_id is not null
  ) or (
    select count(*) from public.equipment_fluid_samples where vehicle_id = 'f5300000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'Deleting a component did not just clear the sample link.';
  end if;
end
$equipment_fluid_component_delete$;

-- Deleting the asset takes its samples and results.
delete from public.vehicles where id = 'f5300000-0000-4000-8000-000000000001';
do $equipment_fluid_cascade$
begin
  if exists (select 1 from public.equipment_fluid_samples where vehicle_id = 'f5300000-0000-4000-8000-000000000001')
     or exists (
       select 1 from public.equipment_fluid_sample_results r
       where r.shop_id = 'f5200000-0000-4000-8000-000000000001'
         and not exists (select 1 from public.equipment_fluid_samples s where s.id = r.sample_id)
     ) then
    raise exception 'Deleting an asset left its fluid samples behind.';
  end if;
end
$equipment_fluid_cascade$;

rollback;
