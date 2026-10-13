\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('6c100000-0000-4000-8000-000000000001', 'equipment-pm-owner-a@example.test', '{"full_name":"PM Owner A"}'::jsonb),
  ('6c100000-0000-4000-8000-000000000002', 'equipment-pm-owner-b@example.test', '{"full_name":"PM Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('6c100000-0000-4000-8000-000000000001', '6c100000-0000-4000-8000-000000000001', 'owner', 'PM Owner A'),
  ('6c100000-0000-4000-8000-000000000002', '6c100000-0000-4000-8000-000000000002', 'owner', 'PM Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('6c200000-0000-4000-8000-000000000001', '6c100000-0000-4000-8000-000000000001', 'PM Shop A', 'PM Shop A', 5),
  ('6c200000-0000-4000-8000-000000000002', '6c100000-0000-4000-8000-000000000002', 'PM Shop B', 'PM Shop B', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = '6c100000-0000-4000-8000-000000000001'::uuid
    then '6c200000-0000-4000-8000-000000000001'::uuid
  else '6c200000-0000-4000-8000-000000000002'::uuid
end
where id in ('6c100000-0000-4000-8000-000000000001', '6c100000-0000-4000-8000-000000000002');

insert into public.vehicles (id, shop_id, user_id, unit_number, year, make, model, engine_hours)
values
  ('6c300000-0000-4000-8000-000000000001', '6c200000-0000-4000-8000-000000000001', '6c100000-0000-4000-8000-000000000001', 'LDR-1', 2020, 'Caterpillar', '950M', 2400),
  ('6c300000-0000-4000-8000-000000000002', '6c200000-0000-4000-8000-000000000001', '6c100000-0000-4000-8000-000000000001', 'LDR-2', 2019, 'Komatsu', 'WA380', 5100),
  ('6c300000-0000-4000-8000-000000000003', '6c200000-0000-4000-8000-000000000002', '6c100000-0000-4000-8000-000000000002', 'B-1', 2018, 'Deere', '644K', 900);

insert into public.work_orders (id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id)
values
  ('6c400000-0000-4000-8000-000000000001', '6c200000-0000-4000-8000-000000000001', 'PM-1', '6c300000-0000-4000-8000-000000000001', 'completed', 'work_order', '6c100000-0000-4000-8000-000000000001'),
  ('6c400000-0000-4000-8000-000000000002', '6c200000-0000-4000-8000-000000000001', 'PM-2', '6c300000-0000-4000-8000-000000000002', 'completed', 'work_order', '6c100000-0000-4000-8000-000000000001');

do $equipment_pm_rpc$
declare
  shop_a constant uuid := '6c200000-0000-4000-8000-000000000001';
  shop_b constant uuid := '6c200000-0000-4000-8000-000000000002';
  actor constant uuid := '6c100000-0000-4000-8000-000000000001';
  asset_1 constant uuid := '6c300000-0000-4000-8000-000000000001';
  asset_2 constant uuid := '6c300000-0000-4000-8000-000000000002';
  plan_json constant jsonb := '{"name":"250-hour service","interval_hours":250,"interval_days":90,"start_date":"2026-09-01","start_hours":2300,"active":true}';
  key_1 constant uuid := '6c500000-0000-4000-8000-000000000001';
  v_result jsonb;
  v_replay jsonb;
  v_plan uuid;
  v_completion uuid;
begin
  -- Create a plan; a retried create with the same key returns the same plan.
  v_result := public.equipment_pm_plan_save(shop_a, actor, asset_1, null, null, plan_json, key_1);
  v_replay := public.equipment_pm_plan_save(shop_a, actor, asset_1, null, null, plan_json, key_1);
  v_plan := (v_result ->> 'id')::uuid;
  if v_replay <> v_result or (v_result ->> 'version')::int <> 1
     or (select count(*) from public.equipment_pm_plans where vehicle_id = asset_1) <> 1 then
    raise exception 'Retried plan create was not idempotent.';
  end if;
  if (select count(*) from public.equipment_pm_plan_revisions where plan_id = v_plan) <> 1 then
    raise exception 'Plan create did not record its first revision.';
  end if;

  -- A reused key with a different payload is refused.
  begin
    perform public.equipment_pm_plan_save(shop_a, actor, asset_1, null, null, plan_json || '{"name":"Other"}', key_1);
    raise exception 'A reused operation key with a different payload was accepted.';
  exception when sqlstate '22023' then
    null;
  end;

  -- Updates require the current version; each saved version is kept.
  v_result := public.equipment_pm_plan_save(
    shop_a, actor, asset_1, v_plan, 1, plan_json || '{"interval_hours":500}',
    '6c500000-0000-4000-8000-000000000002'
  );
  if (v_result ->> 'version')::int <> 2
     or (select interval_hours from public.equipment_pm_plans where id = v_plan) <> 500
     or (select count(*) from public.equipment_pm_plan_revisions where plan_id = v_plan) <> 2 then
    raise exception 'Plan update did not bump the version and record a revision.';
  end if;
  begin
    perform public.equipment_pm_plan_save(
      shop_a, actor, asset_1, v_plan, 1, plan_json, '6c500000-0000-4000-8000-000000000003'
    );
    raise exception 'A stale plan update was accepted.';
  exception when sqlstate '40001' then
    null;
  end;

  -- Shape: at least one interval, distance needs a unit.
  begin
    perform public.equipment_pm_plan_save(
      shop_a, actor, asset_1, null, null, '{"name":"Empty","start_date":"2026-09-01"}',
      '6c500000-0000-4000-8000-000000000004'
    );
    raise exception 'A plan with no interval was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_pm_plan_save(
      shop_a, actor, asset_1, null, null, '{"name":"Dist","interval_distance":5000,"start_distance":100}',
      '6c500000-0000-4000-8000-000000000005'
    );
    raise exception 'A distance interval without a unit was accepted.';
  exception when check_violation then
    null;
  end;

  -- Tenant scope: another shop cannot save onto this shop's asset or plan.
  begin
    perform public.equipment_pm_plan_save(
      shop_b, '6c100000-0000-4000-8000-000000000002', asset_1, null, null, plan_json,
      '6c500000-0000-4000-8000-000000000006'
    );
    raise exception 'Another shop created a plan on this shop''s asset.';
  exception when sqlstate 'P0002' then
    null;
  end;
  begin
    perform public.equipment_pm_plan_save(
      shop_a, actor, asset_2, v_plan, 2, plan_json, '6c500000-0000-4000-8000-000000000007'
    );
    raise exception 'A plan was saved onto a different asset.';
  exception when sqlstate 'P0002' then
    null;
  end;

  -- Completion: idempotent by key, linked work order must be for the asset.
  v_result := public.equipment_pm_complete(
    shop_a, actor, v_plan,
    '{"completed_on":"2026-10-01","asset_hours":2510,"work_order_id":"6c400000-0000-4000-8000-000000000001","notes":"Done"}',
    '6c500000-0000-4000-8000-000000000010'
  );
  v_replay := public.equipment_pm_complete(
    shop_a, actor, v_plan,
    '{"completed_on":"2026-10-01","asset_hours":2510,"work_order_id":"6c400000-0000-4000-8000-000000000001","notes":"Done"}',
    '6c500000-0000-4000-8000-000000000010'
  );
  v_completion := (v_result ->> 'id')::uuid;
  if v_replay <> v_result
     or (select count(*) from public.equipment_pm_completions where plan_id = v_plan) <> 1 then
    raise exception 'Retried completion was not idempotent.';
  end if;
  begin
    perform public.equipment_pm_complete(
      shop_a, actor, v_plan,
      '{"completed_on":"2026-10-02","asset_hours":2520,"work_order_id":"6c400000-0000-4000-8000-000000000002"}',
      '6c500000-0000-4000-8000-000000000011'
    );
    raise exception 'A completion linked to another asset''s work order was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_pm_complete(
      shop_a, actor, v_plan, format('{"completed_on":"%s"}', current_date + 5)::jsonb,
      '6c500000-0000-4000-8000-000000000012'
    );
    raise exception 'A future-dated completion was accepted.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform public.equipment_pm_complete(
      shop_b, '6c100000-0000-4000-8000-000000000002', v_plan, '{"completed_on":"2026-10-01"}',
      '6c500000-0000-4000-8000-000000000013'
    );
    raise exception 'Another shop completed this shop''s plan.';
  exception when sqlstate 'P0002' then
    null;
  end;

  -- Completions are append-only; a void happens once, with a reason.
  begin
    update public.equipment_pm_completions set asset_hours = 1 where id = v_completion;
    raise exception 'A completion was edited in place.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_pm_completion_void(shop_a, actor, v_completion, '  ', '6c500000-0000-4000-8000-000000000020');
    raise exception 'A void without a reason was accepted.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform public.equipment_pm_completion_void(
      shop_b, '6c100000-0000-4000-8000-000000000002', v_completion, 'Wrong', '6c500000-0000-4000-8000-000000000021'
    );
    raise exception 'Another shop voided this shop''s completion.';
  exception when sqlstate 'P0002' then
    null;
  end;
  perform public.equipment_pm_completion_void(shop_a, actor, v_completion, 'Wrong machine', '6c500000-0000-4000-8000-000000000022');
  perform public.equipment_pm_completion_void(shop_a, actor, v_completion, 'Wrong machine', '6c500000-0000-4000-8000-000000000022');
  if (select void_reason from public.equipment_pm_completions where id = v_completion) <> 'Wrong machine' then
    raise exception 'Completion void was not recorded.';
  end if;
  begin
    perform public.equipment_pm_completion_void(shop_a, actor, v_completion, 'Again', '6c500000-0000-4000-8000-000000000023');
    raise exception 'A completion was voided twice.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    update public.equipment_pm_completions set void_reason = 'Changed' where id = v_completion;
    raise exception 'A void reason was changed.';
  exception when insufficient_privilege then
    null;
  end;

  -- Archived plans take no completions.
  perform public.equipment_pm_plan_save(
    shop_a, actor, asset_1, v_plan, 2, plan_json || '{"interval_hours":500,"active":false}',
    '6c500000-0000-4000-8000-000000000030'
  );
  begin
    perform public.equipment_pm_complete(
      shop_a, actor, v_plan, '{"completed_on":"2026-10-03","asset_hours":2600}',
      '6c500000-0000-4000-8000-000000000031'
    );
    raise exception 'An archived plan accepted a completion.';
  exception when sqlstate '22023' then
    null;
  end;
end
$equipment_pm_rpc$;

-- Clients have no direct access to PM tables or RPCs.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6c100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_pm_client_denied$
begin
  begin
    perform 1 from public.equipment_pm_plans limit 1;
    raise exception 'Authenticated client read PM plans directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.equipment_pm_completions limit 1;
    raise exception 'Authenticated client read PM completions directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_pm_plan_save(
      '6c200000-0000-4000-8000-000000000001', '6c100000-0000-4000-8000-000000000001',
      '6c300000-0000-4000-8000-000000000001', null, null,
      '{"name":"X","interval_days":30}', '6c500000-0000-4000-8000-000000000040'
    );
    raise exception 'Authenticated client executed the PM plan RPC.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_pm_complete(
      '6c200000-0000-4000-8000-000000000001', '6c100000-0000-4000-8000-000000000001',
      (select gen_random_uuid()), '{}', '6c500000-0000-4000-8000-000000000041'
    );
    raise exception 'Authenticated client executed the PM completion RPC.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_pm_client_denied$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $equipment_pm_anon$
begin
  begin
    perform 1 from public.equipment_pm_plans limit 1;
    raise exception 'Anonymous actor read PM plans.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_pm_anon$;
reset role;

-- Deleting a linked work order keeps the completion and clears the link.
delete from public.work_orders where id = '6c400000-0000-4000-8000-000000000001';
do $equipment_pm_work_order_delete$
begin
  if exists (
    select 1 from public.equipment_pm_completions
    where vehicle_id = '6c300000-0000-4000-8000-000000000001' and work_order_id is not null
  ) or not exists (
    select 1 from public.equipment_pm_completions where vehicle_id = '6c300000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Deleting a work order did not just clear the completion link.';
  end if;
end
$equipment_pm_work_order_delete$;

-- Deleting the asset takes its plans, revisions and completions.
delete from public.vehicles where id = '6c300000-0000-4000-8000-000000000001';
do $equipment_pm_cascade$
begin
  if exists (select 1 from public.equipment_pm_plans where vehicle_id = '6c300000-0000-4000-8000-000000000001')
     or exists (select 1 from public.equipment_pm_completions where vehicle_id = '6c300000-0000-4000-8000-000000000001') then
    raise exception 'Deleting an asset left its PM records behind.';
  end if;
end
$equipment_pm_cascade$;

rollback;
