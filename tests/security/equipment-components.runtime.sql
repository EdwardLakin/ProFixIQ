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
  ('69700000-0000-4000-8000-000000000003', '69600000-0000-4000-8000-000000000002', '69500000-0000-4000-8000-000000000002', 'EX-B', 2020, 'Komatsu', 'PC360', 900),
  ('69700000-0000-4000-8000-000000000004', '69600000-0000-4000-8000-000000000001', '69500000-0000-4000-8000-000000000001', 'EX-OLD', 2010, 'Caterpillar', '320', 300);

insert into public.work_orders (id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id)
values
  ('69800000-0000-4000-8000-000000000001', '69600000-0000-4000-8000-000000000001', 'CMP-EX1', '69700000-0000-4000-8000-000000000001', 'in_progress', 'work_order', '69500000-0000-4000-8000-000000000001'),
  ('69800000-0000-4000-8000-000000000002', '69600000-0000-4000-8000-000000000001', 'CMP-EX2', '69700000-0000-4000-8000-000000000002', 'in_progress', 'work_order', '69500000-0000-4000-8000-000000000001');

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
  v_created_id uuid;
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

  -- Moving the engine to EX-2 at EX-1 = 1600 h carries its turbocharger;
  -- each keeps its own life (600 h) and restarts at EX-2's meter.
  perform public.equipment_component_move(
    shop_a, actor, v_engine, 'install', ex2, null, null, 5000, 1600
  );
  select * into v_row from public.equipment_components where id = v_engine;
  if v_row.installed_vehicle_id <> ex2 or v_row.installed_asset_hours <> 5000
     or v_row.component_hours_at_install <> 600 then
    raise exception 'Engine move recorded the wrong asset or meters: % % %',
      v_row.installed_vehicle_id, v_row.installed_asset_hours, v_row.component_hours_at_install;
  end if;
  if (select component_hours_at_install from public.equipment_components where id = v_turbo) <> 600
     or (select installed_asset_hours from public.equipment_components where id = v_turbo) <> 5000 then
    raise exception 'Child component lost its life when moved with its parent.';
  end if;
  if (select component_hours from public.equipment_component_events
      where component_id = v_turbo and event_type = 'removed') <> 600 then
    raise exception 'Child removal event did not record its own life.';
  end if;
  if (select max(sequence) from public.equipment_component_events
      where component_id = v_engine and event_type = 'removed')
     >= (select min(sequence) from public.equipment_component_events
      where component_id = v_engine and event_type = 'installed' and vehicle_id = ex2) then
    raise exception 'Lifecycle events are not ordered removed-then-installed.';
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

  -- Work orders must be for the component's asset.
  begin
    perform public.equipment_component_move(
      shop_a, actor, v_drive, 'repaired', null, null, null, 1800, null, null,
      '69800000-0000-4000-8000-000000000002'
    );
    raise exception 'Component event accepted a work order for another asset.';
  exception when sqlstate '23514' then
    null;
  end;
  perform public.equipment_component_move(
    shop_a, actor, v_drive, 'repaired', null, null, null, 1800, null, null,
    '69800000-0000-4000-8000-000000000001', null, null,
    '69900000-0000-4000-8000-000000000001'
  );
  -- A retried action with the same key is a no-op; a reused key for a
  -- different action is refused.
  perform public.equipment_component_move(
    shop_a, actor, v_drive, 'repaired', null, null, null, 1800, null, null,
    '69800000-0000-4000-8000-000000000001', null, null,
    '69900000-0000-4000-8000-000000000001'
  );
  if (select count(*) from public.equipment_component_events
      where component_id = v_drive and event_type = 'repaired') <> 1 then
    raise exception 'Replayed component action duplicated history.';
  end if;
  begin
    perform public.equipment_component_move(
      shop_a, actor, v_drive, 'inspected', null, null, null, 1800, null, null, null, null, null,
      '69900000-0000-4000-8000-000000000001'
    );
    raise exception 'Operation key was reused for a different action.';
  exception when sqlstate '22023' then
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

  -- Identity edits are audited with previous and new values.
  perform public.equipment_component_save(
    shop_a, actor, v_spare,
    '{"component_type":"final_drive","position":"left","label":"Spare final drive","serial_number":"FD-101"}'::jsonb
  );
  if (select details -> 'serial_number' ->> 'from' from public.equipment_component_events
      where component_id = v_spare and event_type = 'updated') <> 'FD-100'
     or (select details -> 'serial_number' ->> 'to' from public.equipment_component_events
      where component_id = v_spare and event_type = 'updated') <> 'FD-101' then
    raise exception 'Identity edit was not audited.';
  end if;
  -- Saving unchanged values records nothing.
  perform public.equipment_component_save(
    shop_a, actor, v_spare,
    '{"component_type":"final_drive","position":"left","label":"Spare final drive","serial_number":"FD-101"}'::jsonb
  );
  if (select count(*) from public.equipment_component_events
      where component_id = v_spare and event_type = 'updated') <> 1 then
    raise exception 'An unchanged save recorded an identity edit.';
  end if;

  -- Create-and-install is one atomic, retry-safe operation.
  v_created_id := public.equipment_component_save(
    shop_a, actor, null,
    '{"component_type":"hydraulic_cylinder","label":"Boom cylinder"}'::jsonb,
    ex1, null, 1800, '69900000-0000-4000-8000-000000000002'
  );
  if public.equipment_component_save(
    shop_a, actor, null,
    '{"component_type":"hydraulic_cylinder","label":"Boom cylinder"}'::jsonb,
    ex1, null, 1800, '69900000-0000-4000-8000-000000000002'
  ) <> v_created_id then
    raise exception 'Replayed create did not return the original component.';
  end if;
  if (select count(*) from public.equipment_components where label = 'Boom cylinder') <> 1
     or (select status from public.equipment_components where id = v_created_id) <> 'installed' then
    raise exception 'Create-and-install duplicated or did not install the component.';
  end if;
  begin
    perform public.equipment_component_save(
      shop_a, actor, null,
      '{"component_type":"hydraulic_cylinder","label":"Orphan cylinder"}'::jsonb,
      ex1, v_engine, 1800
    );
    raise exception 'Create-and-install accepted a parent on another asset.';
  exception when sqlstate '23514' then
    null;
  end;
  if exists (select 1 from public.equipment_components where label = 'Orphan cylinder') then
    raise exception 'A rejected install left an orphaned component.';
  end if;

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

-- Deleting an asset or work order with component history still works: the
-- installed components return to stock and history keeps its rows.
do $equipment_components_delete_paths$
declare
  v_old_engine uuid;
begin
  perform public.equipment_component_seed(
    '69600000-0000-4000-8000-000000000001', '69500000-0000-4000-8000-000000000001',
    '69700000-0000-4000-8000-000000000004',
    '[{"key":"engine","parent_key":null,"component_type":"engine","position":null,"label":"Engine"},
      {"key":"engine.turbocharger","parent_key":"engine","component_type":"turbocharger","position":null,"label":"Turbocharger"}]'::jsonb,
    300
  );
  select id into v_old_engine from public.equipment_components
  where installed_vehicle_id = '69700000-0000-4000-8000-000000000004' and component_type = 'engine';

  delete from public.vehicles where id = '69700000-0000-4000-8000-000000000004';

  if (select status from public.equipment_components where id = v_old_engine) <> 'in_stock'
     or (select installed_vehicle_id from public.equipment_components where id = v_old_engine) is not null then
    raise exception 'Deleting an asset did not return its components to stock.';
  end if;
  if exists (select 1 from public.equipment_components
             where parent_component_id = v_old_engine and status <> 'in_stock') then
    raise exception 'Deleting an asset left a child component installed.';
  end if;
  if not exists (select 1 from public.equipment_component_events
                 where component_id = v_old_engine and event_type = 'installed' and vehicle_id is null) then
    raise exception 'Deleting an asset removed or blocked component history.';
  end if;

  delete from public.work_orders where id = '69800000-0000-4000-8000-000000000001';
  if not exists (select 1 from public.equipment_component_events
                 where event_type = 'repaired' and work_order_id is null
                   and shop_id = '69600000-0000-4000-8000-000000000001') then
    raise exception 'Deleting a work order removed or blocked component history.';
  end if;
end
$equipment_components_delete_paths$;

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
