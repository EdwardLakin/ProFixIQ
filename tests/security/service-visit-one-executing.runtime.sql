\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('7e100000-0000-4000-8000-000000000001', 'sv1x-owner@example.test', '{"full_name":"SV1X Owner"}'::jsonb),
  ('7e100000-0000-4000-8000-000000000002', 'sv1x-tech@example.test', '{"full_name":"SV1X Tech"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('7e100000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000001', 'owner', 'SV1X Owner'),
  ('7e100000-0000-4000-8000-000000000002', '7e100000-0000-4000-8000-000000000002', 'mechanic', 'SV1X Tech')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit, billing_entitlement_override)
values ('7e200000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000001', 'SV1X Shop', 'SV1X Shop', 10, 'active')
on conflict (id) do nothing;

update public.profiles set shop_id = '7e200000-0000-4000-8000-000000000001'
where id::text like '7e100000-%';

insert into public.customers (id, shop_id, name)
values ('7e300000-0000-4000-8000-000000000001', '7e200000-0000-4000-8000-000000000001', 'SV1X Customer');

insert into public.vehicles (id, shop_id, customer_id, user_id, unit_number, year, make, model)
values ('7e400000-0000-4000-8000-000000000001', '7e200000-0000-4000-8000-000000000001',
        '7e300000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000001', 'SV1X-1', 2021, 'Cat', '320');

insert into public.work_orders (id, shop_id, custom_id, vehicle_id, customer_id, status, record_type, advisor_id)
values
  ('7e500000-0000-4000-8000-000000000001', '7e200000-0000-4000-8000-000000000001', 'SV1X-1',
   '7e400000-0000-4000-8000-000000000001', '7e300000-0000-4000-8000-000000000001', 'in_progress', 'work_order',
   '7e100000-0000-4000-8000-000000000001'),
  ('7e500000-0000-4000-8000-000000000002', '7e200000-0000-4000-8000-000000000001', 'SV1X-2',
   '7e400000-0000-4000-8000-000000000001', '7e300000-0000-4000-8000-000000000001', 'in_progress', 'work_order',
   '7e100000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims',
  '{"sub":"7e100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $sv1x$
declare
  shop constant uuid := '7e200000-0000-4000-8000-000000000001';
  owner_id constant uuid := '7e100000-0000-4000-8000-000000000001';
  tech constant uuid := '7e100000-0000-4000-8000-000000000002';
  wo_1 constant uuid := '7e500000-0000-4000-8000-000000000001';
  wo_2 constant uuid := '7e500000-0000-4000-8000-000000000002';
  v1 jsonb;
  v2 jsonb;
  v3 jsonb;
  v_other jsonb;
begin
  -- Several scheduled visits on one work order remain valid.
  v1 := public.dispatch_create_service_visit_atomic(shop, null, wo_1, 'shop', null, null, null, tech, null, null, null, null, owner_id, 'sv1x-key-create-0001');
  v2 := public.dispatch_create_service_visit_atomic(shop, null, wo_1, 'shop', null, null, null, tech, null, null, null, null, owner_id, 'sv1x-key-create-0002');
  if (select count(*) from public.service_visits where work_order_id = wo_1 and status = 'scheduled') <> 2 then
    raise exception 'Two scheduled visits on one work order must remain valid.';
  end if;

  -- The first can be dispatched.
  perform public.dispatch_transition_service_visit_atomic(
    shop, (v1 #>> '{visit,id}')::uuid, 'dispatched', null, null, null, owner_id, 'sv1x-key-disp-0001');

  -- A second visit on the SAME work order cannot also be executing.
  begin
    perform public.dispatch_transition_service_visit_atomic(
      shop, (v2 #>> '{visit,id}')::uuid, 'dispatched', null, null, null, owner_id, 'sv1x-key-disp-0002');
    raise exception 'A second executing visit was allowed on the same work order.';
  exception when unique_violation then
    if sqlerrm not like '%service_visits_one_executing_per_work_order_uniq%' then raise; end if;
  end;
  if (select status from public.service_visits where id = (v2 #>> '{visit,id}')::uuid) <> 'scheduled' then
    raise exception 'The rejected transition changed the visit.';
  end if;

  -- Another work order is unaffected.
  v_other := public.dispatch_create_service_visit_atomic(shop, null, wo_2, 'shop', null, null, null, tech, null, null, null, null, owner_id, 'sv1x-key-create-0003');
  perform public.dispatch_transition_service_visit_atomic(
    shop, (v_other #>> '{visit,id}')::uuid, 'dispatched', null, null, null, owner_id, 'sv1x-key-disp-0003');

  -- Once the first visit is cancelled, the second may be dispatched.
  perform public.dispatch_transition_service_visit_atomic(
    shop, (v1 #>> '{visit,id}')::uuid, 'cancelled', null, null, null, owner_id, 'sv1x-key-cancel-0001');
  perform public.dispatch_transition_service_visit_atomic(
    shop, (v2 #>> '{visit,id}')::uuid, 'dispatched', null, null, null, owner_id, 'sv1x-key-disp-0004');

  -- A new scheduled visit alongside an executing one is still allowed.
  v3 := public.dispatch_create_service_visit_atomic(shop, null, wo_1, 'shop', null, null, null, tech, null, null, null, null, owner_id, 'sv1x-key-create-0004');
  if (select status from public.service_visits where id = (v3 #>> '{visit,id}')::uuid) <> 'scheduled' then
    raise exception 'A scheduled visit could not be created beside an executing one.';
  end if;
end
$sv1x$;

rollback;
