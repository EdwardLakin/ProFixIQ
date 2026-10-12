\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('6a100000-0000-4000-8000-000000000001', 'equipment-measure-owner-a@example.test', '{"full_name":"Measure Owner A"}'::jsonb),
  ('6a100000-0000-4000-8000-000000000002', 'equipment-measure-owner-b@example.test', '{"full_name":"Measure Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('6a100000-0000-4000-8000-000000000001', '6a100000-0000-4000-8000-000000000001', 'owner', 'Measure Owner A'),
  ('6a100000-0000-4000-8000-000000000002', '6a100000-0000-4000-8000-000000000002', 'owner', 'Measure Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('6a200000-0000-4000-8000-000000000001', '6a100000-0000-4000-8000-000000000001', 'Measure Shop A', 'Measure Shop A', 5),
  ('6a200000-0000-4000-8000-000000000002', '6a100000-0000-4000-8000-000000000002', 'Measure Shop B', 'Measure Shop B', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = '6a100000-0000-4000-8000-000000000001'::uuid
    then '6a200000-0000-4000-8000-000000000001'::uuid
  else '6a200000-0000-4000-8000-000000000002'::uuid
end
where id in ('6a100000-0000-4000-8000-000000000001', '6a100000-0000-4000-8000-000000000002');

insert into public.vehicles (id, shop_id, user_id, unit_number, year, make, model, engine_hours)
values
  ('6a300000-0000-4000-8000-000000000001', '6a200000-0000-4000-8000-000000000001', '6a100000-0000-4000-8000-000000000001', 'DZ-1', 2020, 'Caterpillar', 'D6', 4000),
  ('6a300000-0000-4000-8000-000000000002', '6a200000-0000-4000-8000-000000000001', '6a100000-0000-4000-8000-000000000001', 'DZ-2', 2021, 'Caterpillar', 'D6', 2000),
  ('6a300000-0000-4000-8000-000000000003', '6a200000-0000-4000-8000-000000000002', '6a100000-0000-4000-8000-000000000002', 'DZ-B', 2019, 'Komatsu', 'D61', 900);

insert into public.work_orders (id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id)
values
  ('6a400000-0000-4000-8000-000000000001', '6a200000-0000-4000-8000-000000000001', 'MSR-DZ1', '6a300000-0000-4000-8000-000000000001', 'in_progress', 'work_order', '6a100000-0000-4000-8000-000000000001'),
  ('6a400000-0000-4000-8000-000000000002', '6a200000-0000-4000-8000-000000000001', 'MSR-DZ2', '6a300000-0000-4000-8000-000000000002', 'in_progress', 'work_order', '6a100000-0000-4000-8000-000000000001');

insert into public.inspections (id, shop_id, vehicle_id)
values
  ('6a500000-0000-4000-8000-000000000001', '6a200000-0000-4000-8000-000000000001', '6a300000-0000-4000-8000-000000000001'),
  ('6a500000-0000-4000-8000-000000000002', '6a200000-0000-4000-8000-000000000001', '6a300000-0000-4000-8000-000000000002');

do $equipment_measurements_rpc$
declare
  shop_a constant uuid := '6a200000-0000-4000-8000-000000000001';
  shop_b constant uuid := '6a200000-0000-4000-8000-000000000002';
  actor constant uuid := '6a100000-0000-4000-8000-000000000001';
  dz1 constant uuid := '6a300000-0000-4000-8000-000000000001';
  dz2 constant uuid := '6a300000-0000-4000-8000-000000000002';
  dzb constant uuid := '6a300000-0000-4000-8000-000000000003';
  v_uc_left uuid;
  v_off_machine uuid;
  v_ids jsonb;
  v_first uuid;
  v_fix uuid;
  v_fix2 uuid;
  v_void uuid;
begin
  -- Components to measure against.
  perform public.equipment_component_seed(
    shop_a, actor, dz1,
    '[{"key":"uc.left","parent_key":null,"component_type":"undercarriage","position":"left","label":"Undercarriage — Left"}]'::jsonb,
    4000
  );
  select id into v_uc_left from public.equipment_components
  where installed_vehicle_id = dz1 and component_type = 'undercarriage';
  v_off_machine := public.equipment_component_save(
    shop_a, actor, null, '{"component_type":"final_drive","label":"Spare final drive"}'::jsonb
  );

  -- A batch is atomic, typed, linked and retry-safe.
  v_ids := public.equipment_measurement_record(
    shop_a, actor, dz1,
    ('[{"measurement_type":"track_shoe_height","position":"left","component_id":"' || v_uc_left || '","value":38.1,"unit":"mm","entered_value":1.5,"entered_unit":"in"},
       {"measurement_type":"tire_pressure","value":689.4757,"unit":"kPa","entered_value":100,"entered_unit":"psi","notes":"Cold"}]')::jsonb,
    4000, null, '6a400000-0000-4000-8000-000000000001', '6a500000-0000-4000-8000-000000000001',
    '6a900000-0000-4000-8000-000000000001'
  );
  if jsonb_array_length(v_ids) <> 2 then
    raise exception 'Batch did not record both readings.';
  end if;
  if public.equipment_measurement_record(
    shop_a, actor, dz1,
    '[{"measurement_type":"tire_pressure","value":1,"unit":"kPa","entered_value":1,"entered_unit":"kPa"}]'::jsonb,
    4000, null, null, null, '6a900000-0000-4000-8000-000000000001'
  ) <> v_ids then
    raise exception 'Replayed batch did not return the original readings.';
  end if;
  if (select count(*) from public.equipment_measurements where vehicle_id = dz1) <> 2 then
    raise exception 'Replayed batch duplicated readings.';
  end if;
  v_first := (v_ids ->> 0)::uuid;
  if (select entered_unit from public.equipment_measurements where id = v_first) <> 'in'
     or (select value from public.equipment_measurements where id = v_first) <> 38.1 then
    raise exception 'Reading did not keep the canonical and entered values.';
  end if;

  -- Tenant, component, work-order and inspection integrity.
  begin
    perform public.equipment_measurement_record(
      shop_a, actor, dzb,
      '[{"measurement_type":"tire_pressure","value":1,"unit":"kPa","entered_value":1,"entered_unit":"kPa"}]'::jsonb,
      null, null, null, null, '6a900000-0000-4000-8000-000000000002'
    );
    raise exception 'Recorded a reading on another shop''s asset.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_measurement_record(
      shop_a, actor, dz2,
      ('[{"measurement_type":"track_shoe_height","component_id":"' || v_uc_left || '","value":1,"unit":"mm","entered_value":1,"entered_unit":"mm"}]')::jsonb,
      null, null, null, null, '6a900000-0000-4000-8000-000000000003'
    );
    raise exception 'Recorded a reading for a component installed on another asset.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_measurement_record(
      shop_a, actor, dz1,
      ('[{"measurement_type":"cylinder_drift","component_id":"' || v_off_machine || '","value":1,"unit":"mm","entered_value":1,"entered_unit":"mm"}]')::jsonb,
      null, null, null, null, '6a900000-0000-4000-8000-000000000004'
    );
    raise exception 'Recorded a reading for a component not on the asset.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_measurement_record(
      shop_a, actor, dz1,
      '[{"measurement_type":"tire_pressure","value":1,"unit":"kPa","entered_value":1,"entered_unit":"kPa"}]'::jsonb,
      null, null, '6a400000-0000-4000-8000-000000000002', null, '6a900000-0000-4000-8000-000000000005'
    );
    raise exception 'Recorded a reading against another asset''s work order.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_measurement_record(
      shop_a, actor, dz1,
      '[{"measurement_type":"tire_pressure","value":1,"unit":"kPa","entered_value":1,"entered_unit":"kPa"}]'::jsonb,
      null, null, null, '6a500000-0000-4000-8000-000000000002', '6a900000-0000-4000-8000-000000000006'
    );
    raise exception 'Recorded a reading against another asset''s inspection.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_measurement_record(
      shop_a, actor, dz1,
      '[{"measurement_type":"tire_pressure","value":1,"unit":"kPa","entered_value":1,"entered_unit":"kPa"}]'::jsonb,
      null, now() + interval '3 days', null, null, '6a900000-0000-4000-8000-000000000007'
    );
    raise exception 'Recorded a future-dated reading.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform public.equipment_measurement_record(
      shop_a, actor, dz1,
      '[{"measurement_type":"tire_pressure","value":"NaN","unit":"kPa","entered_value":"NaN","entered_unit":"kPa"}]'::jsonb,
      null, null, null, null, '6a900000-0000-4000-8000-000000000008'
    );
    raise exception 'Recorded a non-finite reading.';
  exception when check_violation then
    null;
  end;

  -- Corrections supersede, keep history, and are retry-safe.
  v_fix := public.equipment_measurement_correct(
    shop_a, actor, v_first, 36.0, 'mm', 36.0, 'mm', false, 'Read the wrong shoe', '6a900000-0000-4000-8000-000000000010'
  );
  if public.equipment_measurement_correct(
    shop_a, actor, v_first, 36.0, 'mm', 36.0, 'mm', false, 'Read the wrong shoe', '6a900000-0000-4000-8000-000000000010'
  ) <> v_fix then
    raise exception 'Replayed correction did not return the original correction.';
  end if;
  if (select component_id from public.equipment_measurements where id = v_fix) <> v_uc_left
     or (select measured_at from public.equipment_measurements where id = v_fix)
        <> (select measured_at from public.equipment_measurements where id = v_first) then
    raise exception 'Correction did not keep the original reading context.';
  end if;
  begin
    perform public.equipment_measurement_correct(
      shop_a, actor, v_first, 35.0, 'mm', 35.0, 'mm', false, 'Again', '6a900000-0000-4000-8000-000000000011'
    );
    raise exception 'A superseded reading was corrected twice.';
  exception when unique_violation then
    null;
  end;
  v_fix2 := public.equipment_measurement_correct(
    shop_a, actor, v_fix, 37.0, 'mm', 37.0, 'mm', false, 'Re-measured', '6a900000-0000-4000-8000-000000000012'
  );
  v_void := public.equipment_measurement_correct(
    shop_a, actor, (v_ids ->> 1)::uuid, null, null, null, null, true, 'Wrong machine', '6a900000-0000-4000-8000-000000000013'
  );
  if not (select voided from public.equipment_measurements where id = v_void) then
    raise exception 'Void correction was not recorded as voided.';
  end if;
  begin
    perform public.equipment_measurement_correct(
      shop_a, actor, v_void, 1, 'kPa', 1, 'kPa', false, 'Undo', '6a900000-0000-4000-8000-000000000014'
    );
    raise exception 'A voided reading was corrected.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_measurement_correct(
      shop_b, '6a100000-0000-4000-8000-000000000002', v_fix2, 1, 'mm', 1, 'mm', false, 'Steal', '6a900000-0000-4000-8000-000000000015'
    );
    raise exception 'Another shop corrected a reading.';
  exception when sqlstate 'P0002' then
    null;
  end;
  begin
    perform public.equipment_measurement_correct(
      shop_a, actor, v_fix2, 1, 'mm', 1, 'mm', false, 'Reuse key', '6a900000-0000-4000-8000-000000000001'
    );
    raise exception 'A record operation key was reused for a correction.';
  exception when sqlstate '22023' then
    null;
  end;
  if (select count(*) from public.equipment_measurements where vehicle_id = dz1) <> 5 then
    raise exception 'Correction history is incomplete.';
  end if;

  -- History is append-only.
  begin
    update public.equipment_measurements set value = 99 where id = v_first;
    raise exception 'A reading was edited in place.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_measurements_rpc$;

-- Existing deletes keep working: a deleted work order, inspection or
-- component reference is cleared; a deleted asset takes its readings.
do $equipment_measurements_delete_paths$
begin
  delete from public.work_orders where id = '6a400000-0000-4000-8000-000000000001';
  delete from public.inspections where id = '6a500000-0000-4000-8000-000000000001';
  delete from public.equipment_component_events
  where component_id in (select id from public.equipment_components where installed_vehicle_id = '6a300000-0000-4000-8000-000000000001');
  delete from public.equipment_components where installed_vehicle_id = '6a300000-0000-4000-8000-000000000001';

  if exists (
    select 1 from public.equipment_measurements
    where vehicle_id = '6a300000-0000-4000-8000-000000000001'
      and (work_order_id is not null or inspection_id is not null or component_id is not null)
  ) then
    raise exception 'Deleted references were not cleared from readings.';
  end if;

  delete from public.vehicles where id = '6a300000-0000-4000-8000-000000000001';
  if exists (select 1 from public.equipment_measurements where vehicle_id = '6a300000-0000-4000-8000-000000000001') then
    raise exception 'Deleting an asset left its readings behind.';
  end if;
end
$equipment_measurements_delete_paths$;

-- Clients have no direct access to readings or the RPCs.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6a100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_measurements_client_denied$
begin
  begin
    perform 1 from public.equipment_measurements limit 1;
    raise exception 'Authenticated client read readings directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_measurement_record(
      '6a200000-0000-4000-8000-000000000001', '6a100000-0000-4000-8000-000000000001',
      '6a300000-0000-4000-8000-000000000002',
      '[{"measurement_type":"tire_pressure","value":1,"unit":"kPa","entered_value":1,"entered_unit":"kPa"}]'::jsonb,
      null, null, null, null, '6a900000-0000-4000-8000-000000000020'
    );
    raise exception 'Authenticated client executed the record RPC.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_measurements_client_denied$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $equipment_measurements_anon$
begin
  begin
    perform 1 from public.equipment_measurements limit 1;
    raise exception 'Anonymous actor read readings.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_measurements_anon$;
reset role;

rollback;
