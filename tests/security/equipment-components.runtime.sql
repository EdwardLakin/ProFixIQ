\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('69500000-0000-4000-8000-000000000001', 'equipment-components-owner-a@example.test', '{"full_name":"Components Owner A"}'::jsonb),
  ('69500000-0000-4000-8000-000000000002', 'equipment-components-owner-b@example.test', '{"full_name":"Components Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('69500000-0000-4000-8000-000000000001', '69500000-0000-4000-8000-000000000001', 'owner', 'Components Owner A'),
  ('69500000-0000-4000-8000-000000000002', '69500000-0000-4000-8000-000000000002', 'owner', 'Components Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('69600000-0000-4000-8000-000000000001', '69500000-0000-4000-8000-000000000001', 'Components Shop A', 'Components Shop A', 5),
  ('69600000-0000-4000-8000-000000000002', '69500000-0000-4000-8000-000000000002', 'Components Shop B', 'Components Shop B', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = '69500000-0000-4000-8000-000000000001'::uuid
    then '69600000-0000-4000-8000-000000000001'::uuid
  else '69600000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '69500000-0000-4000-8000-000000000001',
  '69500000-0000-4000-8000-000000000002'
);

insert into public.vehicles (id, shop_id, user_id, unit_number, year, make, model, engine_hours)
values
  ('69700000-0000-4000-8000-000000000001', '69600000-0000-4000-8000-000000000001', '69500000-0000-4000-8000-000000000001', 'EX-1', 2021, 'Caterpillar', '336', 1000),
  ('69700000-0000-4000-8000-000000000002', '69600000-0000-4000-8000-000000000001', '69500000-0000-4000-8000-000000000001', 'EX-2', 2019, 'Caterpillar', '336', 5000),
  ('69700000-0000-4000-8000-000000000003', '69600000-0000-4000-8000-000000000002', '69500000-0000-4000-8000-000000000002', 'EX-B', 2020, 'Komatsu', 'PC360', 900);

do $equipment_components_rpc$
declare
  shop_a constant uuid := '69600000-0000-4000-8000-000000000001';
  shop_b constant uuid := '69600000-0000-4000-8000-000000000002';
  actor constant uuid := '69500000-0000-4000-8000-000000000001';
  ex1 constant uuid := '69700000-0000-4000-8000-000000000001';
  ex2 constant uuid := '69700000-0000-4000-8000-000000000002';
  exb constant uuid := '69700000-0000-4000-8000-000000000003';
  items constant jsonb := '[
    {"key":"engine","parent_key":null,"component_type":"engine","position":null,"label":"Engine"},
    {"key":"engine.turbocharger","parent_key":"engine","component_type":"turbocharger","position":null,"label":"Turbocharger"},
    {"key":"final_drive.left","parent_key":null,"component_type":"final_drive","position":"left","label":"Final drive (left)"}
  ]'::jsonb;
  v_created integer;
  v_engine uuid;
  v_turbo uuid;
  v_drive uuid;
  v_spare uuid;
  v_row public.equipment_components%rowtype;
begin
  -- Seeding creates the hierarchy once; re-running is a no-op.
  v_created := public.equipment_component_seed(shop_a, actor, ex1, items, 1000);
  if v_created <> 3 then
    raise exception 'Seed created % components, expected 3.', v_created;
  end if;
  if public.equipment_component_seed(shop_a, actor, ex1, items, 1000) <> 0 then
    raise exception 'Re-seeding duplicated components.';
  end if;

  select id into v_engine from public.equipment_components
  where installed_vehicle_id = ex1 and component_type = 'engine';
  select id into v_turbo from public.equipment_components
  where installed_vehicle_id = ex1 and component_type = 'turbocharger';
  select id into v_drive from public.equipment_components
  where installed_vehicle_id = ex1 and component_type = 'final_drive';
  if (select parent_component_id from public.equipment_components where id = v_turbo) <> v_engine then
    raise exception 'Seed did not attach the turbocharger to the engine.';
  end if;

  -- Seeding another shop's asset is refused.
  begin
    perform public.equipment_component_seed(shop_a, actor, exb, items, 900);
    raise exception 'Seed accepted another shop''s asset.';
  exception when sqlstate 'P0002' then
    null;
  end;

  -- Moving the engine to EX-2 carries its turbocharger and the life the
  -- caller measured on EX-1's meter (600 h), restarting at EX-2's meter.
  perform public.equipment_component_move(
    shop_a, actor, v_engine, 'install', ex2, null, null, 5000, 600
  );
  select * into v_row from public.equipment_components where id = v_engine;
  if v_row.installed_vehicle_id <> ex2 or v_row.installed_asset_hours <> 5000
     or v_row.component_hours_at_install <> 600 then
    raise exception 'Engine move recorded the wrong asset or meters: % % %',
      v_row.installed_vehicle_id, v_row.installed_asset_hours, v_row.component_hours_at_install;
  end if;
  if (select installed_vehicle_id from public.equipment_components where id = v_turbo) <> ex2
     or (select parent_component_id from public.equipment_components where id = v_turbo) <> v_engine then
    raise exception 'Child component did not move with its parent.';
  end if;
  if (select count(*) from public.equipment_component_events
      where component_id in (v_engine, v_turbo) and event_type = 'removed' and vehicle_id = ex1) <> 2 then
    raise exception 'Moving off EX-1 did not record removal history for the subtree.';
  end if;
  if (select component_hours from public.equipment_component_events
      where component_id = v_engine and event_type = 'installed' and vehicle_id = ex2) <> 600 then
    raise exception 'Install event did not record component life.';
  end if;

  -- Cross-shop install and hierarchy cycles are rejected.
  begin
    perform public.equipment_component_move(shop_a, actor, v_drive, 'install', exb);
    raise exception 'Component was installed on another shop''s asset.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_component_move(shop_a, actor, v_engine, 'install', ex2, v_turbo);
    raise exception 'Component hierarchy accepted a cycle.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_component_move(shop_a, actor, v_drive, 'install', ex1, v_engine);
    raise exception 'Component was attached to a parent on another asset.';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    perform public.equipment_component_move(shop_b, actor, v_drive, 'repaired');
    raise exception 'Another shop acted on a component.';
  exception when sqlstate 'P0002' then
    null;
  end;

  -- Rebuild records life at rebuild, then restarts life at zero.
  perform public.equipment_component_move(shop_a, actor, v_drive, 'rebuilt', null, null, null, 1800);
  select * into v_row from public.equipment_components where id = v_drive;
  if v_row.component_hours_at_install <> 0 or v_row.installed_asset_hours <> 1800 then
    raise exception 'Rebuild did not restart component life.';
  end if;
  if (select component_hours from public.equipment_component_events
      where component_id = v_drive and event_type = 'rebuilt') <> 800 then
    raise exception 'Rebuild event did not record life at rebuild.';
  end if;

  -- Removing to repair keeps children attached to the removed parent.
  perform public.equipment_component_move(
    shop_a, actor, v_engine, 'remove', null, null, null, 5200, null, null, null, 'Out for overhaul', 'in_repair'
  );
  select * into v_row from public.equipment_components where id = v_engine;
  if v_row.status <> 'in_repair' or v_row.installed_vehicle_id is not null
     or v_row.component_hours_at_install <> 800 then
    raise exception 'Remove did not take the engine off with its life: % %', v_row.status, v_row.component_hours_at_install;
  end if;
  if (select status from public.equipment_components where id = v_turbo) <> 'in_stock'
     or (select parent_component_id from public.equipment_components where id = v_turbo) <> v_engine then
    raise exception 'Child did not leave the asset attached to its parent.';
  end if;

  -- Future-dated history is refused.
  begin
    perform public.equipment_component_move(
      shop_a, actor, v_drive, 'inspected', null, null, null, null, null, now() + interval '3 days'
    );
    raise exception 'Component event accepted a future date.';
  exception when sqlstate '22023' then
    null;
  end;

  -- Serial numbers are unique per type among active components.
  v_spare := public.equipment_component_save(
    shop_a, actor, null,
    '{"component_type":"final_drive","position":"left","label":"Spare final drive","serial_number":"FD-100"}'::jsonb
  );
  if (select status from public.equipment_components where id = v_spare) <> 'in_stock'
     or not exists (select 1 from public.equipment_component_events where component_id = v_spare and event_type = 'created') then
    raise exception 'Create did not record an in-stock component with history.';
  end if;
  begin
    perform public.equipment_component_save(
      shop_a, actor, null,
      '{"component_type":"final_drive","label":"Duplicate","serial_number":"fd-100"}'::jsonb
    );
    raise exception 'Duplicate active serial number was accepted.';
  exception when unique_violation then
    null;
  end;
  begin
    perform public.equipment_component_save(
      shop_b, '69500000-0000-4000-8000-000000000002', v_spare,
      '{"component_type":"final_drive","label":"Stolen"}'::jsonb
    );
    raise exception 'Another shop updated a component.';
  exception when sqlstate 'P0002' then
    null;
  end;

  -- Scrapping retires the component; it cannot change afterwards.
  perform public.equipment_component_move(shop_a, actor, v_spare, 'scrapped');
  begin
    perform public.equipment_component_move(shop_a, actor, v_spare, 'install', ex1);
    raise exception 'A scrapped component was reinstalled.';
  exception when sqlstate '23514' then
    null;
  end;

  -- History is append-only.
  begin
    update public.equipment_component_events set notes = 'rewritten' where component_id = v_drive;
    raise exception 'Component history was rewritten.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_components_rpc$;

-- Clients have no direct access to component tables or RPCs; the server
-- routes enforce role, asset visibility and entitlement first.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"69500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_components_client_denied$
begin
  begin
    perform 1 from public.equipment_components limit 1;
    raise exception 'Authenticated client read components directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.equipment_component_events limit 1;
    raise exception 'Authenticated client read component history directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_component_save(
      '69600000-0000-4000-8000-000000000001',
      '69500000-0000-4000-8000-000000000001',
      null,
      '{"component_type":"engine","label":"Client engine"}'::jsonb
    );
    raise exception 'Authenticated client executed the component save RPC.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_component_seed(
      '69600000-0000-4000-8000-000000000001',
      '69500000-0000-4000-8000-000000000001',
      '69700000-0000-4000-8000-000000000001',
      '[]'::jsonb
    );
    raise exception 'Authenticated client executed the component seed RPC.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_components_client_denied$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $equipment_components_anon$
begin
  begin
    perform 1 from public.equipment_components limit 1;
    raise exception 'Anonymous actor read components.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_components_anon$;
reset role;

rollback;
