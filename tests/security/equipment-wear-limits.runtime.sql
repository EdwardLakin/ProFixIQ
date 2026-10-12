\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('6b100000-0000-4000-8000-000000000001', 'equipment-wear-owner-a@example.test', '{"full_name":"Wear Owner A"}'::jsonb),
  ('6b100000-0000-4000-8000-000000000002', 'equipment-wear-owner-b@example.test', '{"full_name":"Wear Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('6b100000-0000-4000-8000-000000000001', '6b100000-0000-4000-8000-000000000001', 'owner', 'Wear Owner A'),
  ('6b100000-0000-4000-8000-000000000002', '6b100000-0000-4000-8000-000000000002', 'owner', 'Wear Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('6b200000-0000-4000-8000-000000000001', '6b100000-0000-4000-8000-000000000001', 'Wear Shop A', 'Wear Shop A', 5),
  ('6b200000-0000-4000-8000-000000000002', '6b100000-0000-4000-8000-000000000002', 'Wear Shop B', 'Wear Shop B', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = '6b100000-0000-4000-8000-000000000001'::uuid
    then '6b200000-0000-4000-8000-000000000001'::uuid
  else '6b200000-0000-4000-8000-000000000002'::uuid
end
where id in ('6b100000-0000-4000-8000-000000000001', '6b100000-0000-4000-8000-000000000002');

insert into public.vehicles (id, shop_id, user_id, unit_number, year, make, model, engine_hours)
values
  ('6b300000-0000-4000-8000-000000000001', '6b200000-0000-4000-8000-000000000001', '6b100000-0000-4000-8000-000000000001', 'EX-W', 2021, 'Caterpillar', '336', 3000);

do $equipment_wear_limits_rpc$
declare
  shop_a constant uuid := '6b200000-0000-4000-8000-000000000001';
  shop_b constant uuid := '6b200000-0000-4000-8000-000000000002';
  actor constant uuid := '6b100000-0000-4000-8000-000000000001';
  v_chain uuid;
  v_first uuid;
  v_second uuid;
begin
  perform public.equipment_component_seed(
    shop_a, actor, '6b300000-0000-4000-8000-000000000001',
    '[{"key":"uc.left","parent_key":null,"component_type":"undercarriage","position":"left","label":"Undercarriage — Left"},
      {"key":"uc.left.chain","parent_key":"uc.left","component_type":"track_chain","position":"left","label":"Track chain — Left"}]'::jsonb,
    3000
  );
  select id into v_chain from public.equipment_components where component_type = 'track_chain' and shop_id = shop_a;

  -- Setting a limit creates a version; saving the same figures again is a no-op.
  v_first := public.equipment_wear_limit_set(shop_a, actor, v_chain, 'track_link_height', 104, 92, 'mm', 'OEM manual p.12');
  if public.equipment_wear_limit_set(shop_a, actor, v_chain, 'track_link_height', 104, 92, 'mm', ' OEM manual p.12 ') <> v_first then
    raise exception 'Re-saving identical wear limits created a new version.';
  end if;
  if (select count(*) from public.equipment_wear_limits where component_id = v_chain) <> 1 then
    raise exception 'Identical wear limit save was not a no-op.';
  end if;

  -- A change is a new version; the old one stays for traceability.
  v_second := public.equipment_wear_limit_set(shop_a, actor, v_chain, 'track_link_height', 104, 93, 'mm', 'Shop standard');
  if v_second = v_first
     or (select count(*) from public.equipment_wear_limits where component_id = v_chain) <> 2
     or (select limit_value from public.equipment_wear_limits
         where component_id = v_chain order by sequence desc limit 1) <> 93 then
    raise exception 'Changed wear limit was not recorded as a new current version.';
  end if;

  -- Tenant scope and shape.
  begin
    perform public.equipment_wear_limit_set(shop_b, '6b100000-0000-4000-8000-000000000002', v_chain, 'track_link_height', 104, 90, 'mm');
    raise exception 'Another shop set a wear limit on this shop''s component.';
  exception when sqlstate 'P0002' then
    null;
  end;
  begin
    perform public.equipment_wear_limit_set(shop_a, actor, v_chain, 'track_link_height', 100, 100, 'mm');
    raise exception 'A wear limit with equal new and worn values was accepted.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.equipment_wear_limit_set(shop_a, actor, v_chain, 'track_link_height', 'NaN', 92, 'mm');
    raise exception 'A non-finite wear limit was accepted.';
  exception when check_violation then
    null;
  end;

  -- History is append-only.
  begin
    update public.equipment_wear_limits set limit_value = 80 where id = v_first;
    raise exception 'A wear limit was edited in place.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_wear_limits_rpc$;

-- Clients have no direct access to wear limits or the RPC.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6b100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $equipment_wear_limits_client_denied$
begin
  begin
    perform 1 from public.equipment_wear_limits limit 1;
    raise exception 'Authenticated client read wear limits directly.';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.equipment_wear_limit_set(
      '6b200000-0000-4000-8000-000000000001', '6b100000-0000-4000-8000-000000000001',
      (select gen_random_uuid()), 'track_link_height', 104, 92, 'mm'
    );
    raise exception 'Authenticated client executed the wear limit RPC.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_wear_limits_client_denied$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $equipment_wear_limits_anon$
begin
  begin
    perform 1 from public.equipment_wear_limits limit 1;
    raise exception 'Anonymous actor read wear limits.';
  exception when insufficient_privilege then
    null;
  end;
end
$equipment_wear_limits_anon$;
reset role;

-- Deleting the asset's components (e.g. shop cleanup) takes their limits.
delete from public.equipment_component_events where shop_id = '6b200000-0000-4000-8000-000000000001';
delete from public.equipment_components where shop_id = '6b200000-0000-4000-8000-000000000001';
do $equipment_wear_limits_cascade$
begin
  if exists (select 1 from public.equipment_wear_limits where shop_id = '6b200000-0000-4000-8000-000000000001') then
    raise exception 'Deleting a component left its wear limits behind.';
  end if;
end
$equipment_wear_limits_cascade$;

rollback;
