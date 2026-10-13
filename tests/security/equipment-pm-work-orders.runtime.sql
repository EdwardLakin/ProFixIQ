\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('7a100000-0000-4000-8000-000000000001', 'equipment-pmwo-owner-a@example.test', '{"full_name":"PM WO Owner A"}'::jsonb),
  ('7a100000-0000-4000-8000-000000000002', 'equipment-pmwo-owner-b@example.test', '{"full_name":"PM WO Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('7a100000-0000-4000-8000-000000000001', '7a100000-0000-4000-8000-000000000001', 'owner', 'PM WO Owner A'),
  ('7a100000-0000-4000-8000-000000000002', '7a100000-0000-4000-8000-000000000002', 'owner', 'PM WO Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('7a200000-0000-4000-8000-000000000001', '7a100000-0000-4000-8000-000000000001', 'PM WO Shop A', 'PM WO Shop A', 5),
  ('7a200000-0000-4000-8000-000000000002', '7a100000-0000-4000-8000-000000000002', 'PM WO Shop B', 'PM WO Shop B', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = '7a100000-0000-4000-8000-000000000001'::uuid
    then '7a200000-0000-4000-8000-000000000001'::uuid
  else '7a200000-0000-4000-8000-000000000002'::uuid
end
where id in ('7a100000-0000-4000-8000-000000000001', '7a100000-0000-4000-8000-000000000002');

insert into public.vehicles (id, shop_id, user_id, unit_number, year, make, model, engine_hours)
values
  ('7a300000-0000-4000-8000-000000000001', '7a200000-0000-4000-8000-000000000001', '7a100000-0000-4000-8000-000000000001', 'LDR-1', 2020, 'Caterpillar', '950M', 2400),
  ('7a300000-0000-4000-8000-000000000002', '7a200000-0000-4000-8000-000000000001', '7a100000-0000-4000-8000-000000000001', 'LDR-2', 2019, 'Komatsu', 'WA380', 5100),
  ('7a300000-0000-4000-8000-000000000003', '7a200000-0000-4000-8000-000000000002', '7a100000-0000-4000-8000-000000000002', 'B-1', 2018, 'Deere', '644K', 900);

-- WO 1: asset 1 (shop A); WO 2: asset 2 (shop A); WO 3: shop B's asset;
-- WO 4: an estimate for asset 1.
insert into public.work_orders (id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id)
values
  ('7a400000-0000-4000-8000-000000000001', '7a200000-0000-4000-8000-000000000001', 'PMWO-1', '7a300000-0000-4000-8000-000000000001', 'in_progress', 'work_order', '7a100000-0000-4000-8000-000000000001'),
  ('7a400000-0000-4000-8000-000000000002', '7a200000-0000-4000-8000-000000000001', 'PMWO-2', '7a300000-0000-4000-8000-000000000002', 'in_progress', 'work_order', '7a100000-0000-4000-8000-000000000001'),
  ('7a400000-0000-4000-8000-000000000003', '7a200000-0000-4000-8000-000000000002', 'PMWO-3', '7a300000-0000-4000-8000-000000000003', 'in_progress', 'work_order', '7a100000-0000-4000-8000-000000000002');
insert into public.work_orders (id, shop_id, vehicle_id, status, record_type, estimate_number, advisor_id)
values
  ('7a400000-0000-4000-8000-000000000004', '7a200000-0000-4000-8000-000000000001', '7a300000-0000-4000-8000-000000000001', 'new', 'estimate', 'EST-PMWO-4', '7a100000-0000-4000-8000-000000000001');

do $equipment_pm_wo_rpc$
declare
  shop_a constant uuid := '7a200000-0000-4000-8000-000000000001';
  shop_b constant uuid := '7a200000-0000-4000-8000-000000000002';
  actor constant uuid := '7a100000-0000-4000-8000-000000000001';
  actor_b constant uuid := '7a100000-0000-4000-8000-000000000002';
  asset_1 constant uuid := '7a300000-0000-4000-8000-000000000001';
  wo_1 constant uuid := '7a400000-0000-4000-8000-000000000001';
  wo_2 constant uuid := '7a400000-0000-4000-8000-000000000002';
  wo_3 constant uuid := '7a400000-0000-4000-8000-000000000003';
  wo_est constant uuid := '7a400000-0000-4000-8000-000000000004';
  plan_json constant jsonb := '{"name":"250-hour service","interval_hours":250,"start_date":"2026-09-01","start_hours":2300,"active":true}';
  v_plan uuid;
  v_result jsonb;
  v_replay jsonb;
  v_link uuid;
begin
  v_plan := (public.equipment_pm_plan_save(
    shop_a, actor, asset_1, null, null, plan_json, '7a500000-0000-4000-8000-000000000001'
  ) ->> 'id')::uuid;

  -- Link; a retried link with the same key returns the same link.
  v_result := public.equipment_pm_work_order_link(shop_a, actor, v_plan, wo_1, '7a500000-0000-4000-8000-000000000010');
  v_replay := public.equipment_pm_work_order_link(shop_a, actor, v_plan, wo_1, '7a500000-0000-4000-8000-000000000010');
  v_link := (v_result ->> 'id')::uuid;
  if v_replay <> v_result
     or (select count(*) from public.equipment_pm_work_orders where plan_id = v_plan) <> 1 then
    raise exception 'Retried link was not idempotent.';
  end if;
  -- Linking the same work order again with a new key returns the current link.
  v_replay := public.equipment_pm_work_order_link(shop_a, actor, v_plan, wo_1, '7a500000-0000-4000-8000-000000000011');
  if (v_replay ->> 'id')::uuid <> v_link
     or (select count(*) from public.equipment_pm_work_orders where plan_id = v_plan) <> 1 then
    raise exception 'Linking an already linked work order created a duplicate.';
  end if;
  -- A reused key with a different payload is refused.
  begin
    perform public.equipment_pm_work_order_link(shop_a, actor, v_plan, wo_2, '7a500000-0000-4000-8000-000000000010');
    raise exception 'A reused operation key with a different payload was accepted.';
  exception when sqlstate '22023' then
    null;
  end;

  -- Work order validation: another asset, another shop, an estimate.
  begin
    perform public.equipment_pm_work_order_link(shop_a, actor, v_plan, wo_2, '7a500000-0000-4000-8000-000000000012');
    raise exception 'Another asset''s work order was linked.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_pm_work_order_link(shop_a, actor, v_plan, wo_3, '7a500000-0000-4000-8000-000000000013');
    raise exception 'Another shop''s work order was linked.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_pm_work_order_link(shop_a, actor, v_plan, wo_est, '7a500000-0000-4000-8000-000000000014');
    raise exception 'An estimate was linked as a PM work order.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_pm_work_order_link(shop_a, actor, v_plan, gen_random_uuid(), '7a500000-0000-4000-8000-000000000015');
    raise exception 'A missing work order was linked.';
  exception when check_violation then
    null;
  end;

  -- Tenant scope: another shop cannot link to or unlink from this shop's plan.
  begin
    perform public.equipment_pm_work_order_link(shop_b, actor_b, v_plan, wo_3, '7a500000-0000-4000-8000-000000000016');
    raise exception 'Another shop linked a work order to this shop''s plan.';
  exception when sqlstate 'P0002' then
    null;
  end;
  begin
    perform public.equipment_pm_work_order_unlink(shop_b, actor_b, v_link, '7a500000-0000-4000-8000-000000000017');
    raise exception 'Another shop unlinked this shop''s work order.';
  exception when sqlstate 'P0002' then
    null;
  end;
  -- A failed request leaves no receipt behind.
  if exists (
    select 1 from public.equipment_pm_work_order_operations
    where operation_key in ('7a500000-0000-4000-8000-000000000012', '7a500000-0000-4000-8000-000000000016')
  ) then
    raise exception 'A refused link left an operation receipt.';
  end if;

  -- Direct inserts are checked too (defense in depth).
  begin
    insert into public.equipment_pm_work_orders (shop_id, plan_id, vehicle_id, work_order_id)
    values (shop_b, v_plan, asset_1, wo_1);
    raise exception 'A cross-shop link row was inserted.';
  exception when check_violation then
    null;
  end;

  -- Links are append-only; an unlink happens once.
  begin
    update public.equipment_pm_work_orders set work_order_id = wo_2 where id = v_link;
    raise exception 'A link was edited in place.';
  exception when insufficient_privilege then
    null;
  end;
  perform public.equipment_pm_work_order_unlink(shop_a, actor, v_link, '7a500000-0000-4000-8000-000000000020');
  v_result := public.equipment_pm_work_order_unlink(shop_a, actor, v_link, '7a500000-0000-4000-8000-000000000020');
  if (v_result ->> 'id')::uuid <> v_link
     or (select unlinked_by from public.equipment_pm_work_orders where id = v_link) <> actor then
    raise exception 'Unlink was not recorded idempotently.';
  end if;
  begin
    perform public.equipment_pm_work_order_unlink(shop_a, actor, v_link, '7a500000-0000-4000-8000-000000000021');
    raise exception 'A link was unlinked twice.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    update public.equipment_pm_work_orders set unlinked_at = null, unlinked_by = null where id = v_link;
    raise exception 'An unlink was reverted.';
  exception when insufficient_privilege then
    null;
  end;

  -- After an unlink the work order can be linked again (new link; history kept).
  v_result := public.equipment_pm_work_order_link(shop_a, actor, v_plan, wo_1, '7a500000-0000-4000-8000-000000000030');
  if (v_result ->> 'id')::uuid = v_link
     or (select count(*) from public.equipment_pm_work_orders where plan_id = v_plan) <> 2 then
    raise exception 'Relinking did not create a new link while keeping history.';
  end if;

  -- Archived plans take no new links.
  perform public.equipment_pm_plan_save(
    shop_a, actor, asset_1, v_plan, 1, plan_json || '{"active":false}', '7a500000-0000-4000-8000-000000000040'
  );
  begin
    perform public.equipment_pm_work_order_link(
      shop_a, actor, v_plan, wo_1, '7a500000-0000-4000-8000-000000000041'
    );
    raise exception 'An archived plan accepted a work order link.';
  exception when sqlstate '22023' then
    null;
  end;
end
$equipment_pm_wo_rpc$;

-- Clients have no direct access to the link tables or RPCs.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_pm_wo_client_denied$
begin
  begin
    perform 1 from public.equipment_pm_work_orders limit 1;
    raise exception 'Authenticated client read PM work order links directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.equipment_pm_work_order_operations limit 1;
    raise exception 'Authenticated client read PM work order receipts directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_pm_work_order_link(
      '7a200000-0000-4000-8000-000000000001', '7a100000-0000-4000-8000-000000000001',
      (select gen_random_uuid()), '7a400000-0000-4000-8000-000000000001',
      '7a500000-0000-4000-8000-000000000050'
    );
    raise exception 'Authenticated client executed the PM work order link RPC.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_pm_work_order_unlink(
      '7a200000-0000-4000-8000-000000000001', '7a100000-0000-4000-8000-000000000001',
      (select gen_random_uuid()), '7a500000-0000-4000-8000-000000000051'
    );
    raise exception 'Authenticated client executed the PM work order unlink RPC.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_pm_wo_client_denied$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $equipment_pm_wo_anon$
begin
  begin
    perform 1 from public.equipment_pm_work_orders limit 1;
    raise exception 'Anonymous actor read PM work order links.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_pm_wo_anon$;
reset role;

-- Deleting a linked work order removes its links; the plan stays.
delete from public.work_orders where id = '7a400000-0000-4000-8000-000000000001';
do $equipment_pm_wo_delete$
begin
  if exists (
    select 1 from public.equipment_pm_work_orders
    where work_order_id = '7a400000-0000-4000-8000-000000000001'
  ) or not exists (
    select 1 from public.equipment_pm_plans where vehicle_id = '7a300000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Deleting a work order did not just remove its PM links.';
  end if;
end
$equipment_pm_wo_delete$;

-- Deleting the asset takes its plans, links and receipts.
delete from public.vehicles where id = '7a300000-0000-4000-8000-000000000001';
do $equipment_pm_wo_cascade$
begin
  if exists (select 1 from public.equipment_pm_work_orders where vehicle_id = '7a300000-0000-4000-8000-000000000001')
     or exists (select 1 from public.equipment_pm_work_order_operations where vehicle_id = '7a300000-0000-4000-8000-000000000001') then
    raise exception 'Deleting an asset left its PM work order records behind.';
  end if;
end
$equipment_pm_wo_cascade$;

rollback;
