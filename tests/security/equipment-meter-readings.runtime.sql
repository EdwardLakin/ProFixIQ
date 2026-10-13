\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('6d100000-0000-4000-8000-000000000001', 'equipment-meter-owner-a@example.test', '{"full_name":"Meter Owner A"}'::jsonb),
  ('6d100000-0000-4000-8000-000000000002', 'equipment-meter-owner-b@example.test', '{"full_name":"Meter Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('6d100000-0000-4000-8000-000000000001', '6d100000-0000-4000-8000-000000000001', 'owner', 'Meter Owner A'),
  ('6d100000-0000-4000-8000-000000000002', '6d100000-0000-4000-8000-000000000002', 'owner', 'Meter Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('6d200000-0000-4000-8000-000000000001', '6d100000-0000-4000-8000-000000000001', 'Meter Shop A', 'Meter Shop A', 5),
  ('6d200000-0000-4000-8000-000000000002', '6d100000-0000-4000-8000-000000000002', 'Meter Shop B', 'Meter Shop B', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = '6d100000-0000-4000-8000-000000000001'::uuid
    then '6d200000-0000-4000-8000-000000000001'::uuid
  else '6d200000-0000-4000-8000-000000000002'::uuid
end
where id in ('6d100000-0000-4000-8000-000000000001', '6d100000-0000-4000-8000-000000000002');

insert into public.vehicles (id, shop_id, user_id, unit_number, year, make, model, engine_hours, mileage, odometer_unit)
values
  ('6d300000-0000-4000-8000-000000000001', '6d200000-0000-4000-8000-000000000001', '6d100000-0000-4000-8000-000000000001', 'EX-1', 2021, 'Caterpillar', '320', 2400, '1200', 'km'),
  ('6d300000-0000-4000-8000-000000000002', '6d200000-0000-4000-8000-000000000002', '6d100000-0000-4000-8000-000000000002', 'B-1', 2018, 'Deere', '644K', 900, null, null);

do $equipment_meter_rpc$
declare
  shop_a constant uuid := '6d200000-0000-4000-8000-000000000001';
  shop_b constant uuid := '6d200000-0000-4000-8000-000000000002';
  actor_a constant uuid := '6d100000-0000-4000-8000-000000000001';
  actor_b constant uuid := '6d100000-0000-4000-8000-000000000002';
  asset_a constant uuid := '6d300000-0000-4000-8000-000000000001';
  asset_b constant uuid := '6d300000-0000-4000-8000-000000000002';
  reading_json constant jsonb := '{"read_at":"2026-10-01T08:00:00Z","engine_hours":2410.5,"odometer":1250,"odometer_unit":"km","source":"manual","notes":"Walkaround"}';
  key_1 constant uuid := '6d500000-0000-4000-8000-000000000001';
  v_result jsonb;
  v_replay jsonb;
  v_reading uuid;
  v_hours integer;
  v_mileage text;
begin
  select engine_hours, mileage into v_hours, v_mileage from public.vehicles where id = asset_a;

  -- Record; a retried record with the same key returns the same reading.
  v_result := public.equipment_meter_reading_record(shop_a, actor_a, asset_a, reading_json, key_1);
  v_replay := public.equipment_meter_reading_record(shop_a, actor_a, asset_a, reading_json, key_1);
  v_reading := (v_result ->> 'id')::uuid;
  if v_replay <> v_result
     or (select count(*) from public.equipment_meter_readings where vehicle_id = asset_a) <> 1 then
    raise exception 'Retried reading was not idempotent.';
  end if;
  if (select engine_hours from public.equipment_meter_readings where id = v_reading) <> 2410.5
     or (select recorded_by from public.equipment_meter_readings where id = v_reading) <> actor_a then
    raise exception 'Reading was not stored as recorded.';
  end if;

  -- A reading never changes the asset's current meters.
  if (select engine_hours from public.vehicles where id = asset_a) is distinct from v_hours
     or (select mileage from public.vehicles where id = asset_a) is distinct from v_mileage then
    raise exception 'Recording a reading changed the asset''s current meters.';
  end if;

  -- A reused key with a different payload is refused.
  begin
    perform public.equipment_meter_reading_record(shop_a, actor_a, asset_a, reading_json || '{"engine_hours":1}', key_1);
    raise exception 'A reused operation key with a different payload was accepted.';
  exception when sqlstate '22023' then
    null;
  end;

  -- At least one meter; non-negative; odometer needs a km/mi unit; known source.
  begin
    perform public.equipment_meter_reading_record(
      shop_a, actor_a, asset_a, '{"read_at":"2026-10-02T08:00:00Z","notes":"none"}',
      '6d500000-0000-4000-8000-000000000002'
    );
    raise exception 'A reading with no meter was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_meter_reading_record(
      shop_a, actor_a, asset_a, '{"engine_hours":-1}', '6d500000-0000-4000-8000-000000000003'
    );
    raise exception 'A negative reading was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_meter_reading_record(
      shop_a, actor_a, asset_a, '{"odometer":100}', '6d500000-0000-4000-8000-000000000004'
    );
    raise exception 'An odometer reading without a unit was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_meter_reading_record(
      shop_a, actor_a, asset_a, '{"odometer":100,"odometer_unit":"furlong"}', '6d500000-0000-4000-8000-000000000005'
    );
    raise exception 'An unknown odometer unit was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_meter_reading_record(
      shop_a, actor_a, asset_a, '{"cycles":5,"source":"guess"}', '6d500000-0000-4000-8000-000000000006'
    );
    raise exception 'An unknown source was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_meter_reading_record(
      shop_a, actor_a, asset_a, format('{"cycles":5,"read_at":"%s"}', now() + interval '5 days')::jsonb,
      '6d500000-0000-4000-8000-000000000007'
    );
    raise exception 'A future-dated reading was accepted.';
  exception when sqlstate '22023' then
    null;
  end;

  -- A lower reading than an earlier one is kept as recorded (a fact, not an error).
  perform public.equipment_meter_reading_record(
    shop_a, actor_a, asset_a, '{"read_at":"2026-10-05T08:00:00Z","engine_hours":2400}',
    '6d500000-0000-4000-8000-000000000008'
  );
  if (select count(*) from public.equipment_meter_readings where vehicle_id = asset_a) <> 2 then
    raise exception 'A backwards reading was not kept.';
  end if;

  -- Tenant scope: another shop cannot record onto or void this shop's records.
  begin
    perform public.equipment_meter_reading_record(
      shop_b, actor_b, asset_a, '{"engine_hours":1}', '6d500000-0000-4000-8000-000000000010'
    );
    raise exception 'Another shop recorded a reading on this shop''s asset.';
  exception when sqlstate 'P0002' then
    null;
  end;
  begin
    perform public.equipment_meter_reading_void(shop_b, actor_b, v_reading, 'Wrong', '6d500000-0000-4000-8000-000000000011');
    raise exception 'Another shop voided this shop''s reading.';
  exception when sqlstate 'P0002' then
    null;
  end;
  begin
    insert into public.equipment_meter_readings (shop_id, vehicle_id, read_at, engine_hours)
    values (shop_b, asset_a, now(), 1);
    raise exception 'A reading was stored under another shop''s asset.';
  exception when check_violation then
    null;
  end;
  -- Operation keys are per shop: shop B can reuse the same key value for its own asset.
  perform public.equipment_meter_reading_record(shop_b, actor_b, asset_b, '{"engine_hours":901}', key_1);

  -- Readings are append-only; a void happens once, with a reason.
  begin
    update public.equipment_meter_readings set engine_hours = 1 where id = v_reading;
    raise exception 'A reading was edited in place.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_meter_reading_void(shop_a, actor_a, v_reading, '  ', '6d500000-0000-4000-8000-000000000020');
    raise exception 'A void without a reason was accepted.';
  exception when sqlstate '22023' then
    null;
  end;
  v_result := public.equipment_meter_reading_void(shop_a, actor_a, v_reading, 'Misread gauge', '6d500000-0000-4000-8000-000000000021');
  v_replay := public.equipment_meter_reading_void(shop_a, actor_a, v_reading, 'Misread gauge', '6d500000-0000-4000-8000-000000000021');
  if v_replay <> v_result
     or (select void_reason from public.equipment_meter_readings where id = v_reading) <> 'Misread gauge'
     or (select voided_by from public.equipment_meter_readings where id = v_reading) <> actor_a then
    raise exception 'Reading void was not recorded idempotently.';
  end if;
  begin
    perform public.equipment_meter_reading_void(shop_a, actor_a, v_reading, 'Again', '6d500000-0000-4000-8000-000000000022');
    raise exception 'A reading was voided twice.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    update public.equipment_meter_readings set void_reason = 'Changed' where id = v_reading;
    raise exception 'A void reason was changed.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_meter_rpc$;

-- Clients have no direct access to meter tables or RPCs.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6d100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_meter_client_denied$
begin
  begin
    perform 1 from public.equipment_meter_readings limit 1;
    raise exception 'Authenticated client read meter readings directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.equipment_meter_readings (shop_id, vehicle_id, read_at, engine_hours)
    values ('6d200000-0000-4000-8000-000000000001', '6d300000-0000-4000-8000-000000000001', now(), 1);
    raise exception 'Authenticated client inserted a meter reading directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.equipment_meter_operations limit 1;
    raise exception 'Authenticated client read meter operations directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_meter_reading_record(
      '6d200000-0000-4000-8000-000000000001', '6d100000-0000-4000-8000-000000000001',
      '6d300000-0000-4000-8000-000000000001', '{"engine_hours":1}', '6d500000-0000-4000-8000-000000000040'
    );
    raise exception 'Authenticated client executed the meter record RPC.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_meter_reading_void(
      '6d200000-0000-4000-8000-000000000001', '6d100000-0000-4000-8000-000000000001',
      (select gen_random_uuid()), 'x', '6d500000-0000-4000-8000-000000000041'
    );
    raise exception 'Authenticated client executed the meter void RPC.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_meter_client_denied$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $equipment_meter_anon$
begin
  begin
    perform 1 from public.equipment_meter_readings limit 1;
    raise exception 'Anonymous actor read meter readings.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_meter_anon$;
reset role;

-- Deleting the asset takes its readings and receipts.
delete from public.vehicles where id = '6d300000-0000-4000-8000-000000000001';
do $equipment_meter_cascade$
begin
  if exists (select 1 from public.equipment_meter_readings where vehicle_id = '6d300000-0000-4000-8000-000000000001')
     or exists (select 1 from public.equipment_meter_operations where vehicle_id = '6d300000-0000-4000-8000-000000000001') then
    raise exception 'Deleting an asset left its meter records behind.';
  end if;
end
$equipment_meter_cascade$;

rollback;
