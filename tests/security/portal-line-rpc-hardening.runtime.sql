\set ON_ERROR_STOP on

begin;

-- Fixtures: one shop, portal customers A and B, one work order each.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('8e010000-0000-4000-8000-000000000001', 'portal-harden-owner@example.test', '{"full_name":"Portal Harden Owner"}'::jsonb),
  ('8e010000-0000-4000-8000-000000000002', 'portal-harden-a@example.test', '{}'::jsonb),
  ('8e010000-0000-4000-8000-000000000003', 'portal-harden-b@example.test', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values ('8e010000-0000-4000-8000-000000000001', '8e010000-0000-4000-8000-000000000001', 'owner', 'Portal Harden Owner')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values ('8e030000-0000-4000-8000-000000000001', '8e010000-0000-4000-8000-000000000001', 'Portal Harden Shop', 'Portal Harden Shop', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = '8e030000-0000-4000-8000-000000000001'
where id = '8e010000-0000-4000-8000-000000000001';

insert into public.customers (id, shop_id, user_id, name)
values
  ('8e040000-0000-4000-8000-000000000001', '8e030000-0000-4000-8000-000000000001', '8e010000-0000-4000-8000-000000000002', 'Portal Harden A'),
  ('8e040000-0000-4000-8000-000000000002', '8e030000-0000-4000-8000-000000000001', '8e010000-0000-4000-8000-000000000003', 'Portal Harden B');

insert into public.vehicles (id, shop_id, user_id, customer_id, vin, year, make, model)
values
  ('8e050000-0000-4000-8000-000000000001', '8e030000-0000-4000-8000-000000000001', '8e010000-0000-4000-8000-000000000002', '8e040000-0000-4000-8000-000000000001', '1FTBW1X80NKA8E501', 2022, 'Ford', 'Transit'),
  ('8e050000-0000-4000-8000-000000000002', '8e030000-0000-4000-8000-000000000001', '8e010000-0000-4000-8000-000000000003', '8e040000-0000-4000-8000-000000000002', '1FTBW1X80NKA8E502', 2022, 'Ford', 'Transit');

insert into public.work_orders (id, shop_id, customer_id, vehicle_id, custom_id, status)
values
  ('8e060000-0000-4000-8000-000000000001', '8e030000-0000-4000-8000-000000000001', '8e040000-0000-4000-8000-000000000001', '8e050000-0000-4000-8000-000000000001', 'PORTAL-HARDEN-A', 'new'),
  ('8e060000-0000-4000-8000-000000000002', '8e030000-0000-4000-8000-000000000001', '8e040000-0000-4000-8000-000000000002', '8e050000-0000-4000-8000-000000000002', 'PORTAL-HARDEN-B', 'new');

insert into public.menu_items (id, shop_id, description)
values ('8e070000-0000-4000-8000-000000000001', '8e030000-0000-4000-8000-000000000001', 'Portal harden oil change');

create temp table portal_harden_results (label text primary key, result jsonb, error text);
grant all on table portal_harden_results to authenticated, service_role;

-- 1. Customer B (authenticated) tries to act as customer A, using A's ids.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"8e010000-0000-4000-8000-000000000003","role":"authenticated"}', true);

do $harden_cross$
declare
  v_shop constant uuid := '8e030000-0000-4000-8000-000000000001';
  v_customer_a constant uuid := '8e040000-0000-4000-8000-000000000001';
  v_work_order_a constant uuid := '8e060000-0000-4000-8000-000000000001';
  v_actor_a constant uuid := '8e010000-0000-4000-8000-000000000002';
begin
  begin
    perform public.add_portal_request_line_atomic(v_shop, v_customer_a, v_work_order_a, v_actor_a, 'custom', null, 'Injected line', null, 'job', 'harden:cross-custom', now());
    insert into portal_harden_results values ('cross_custom', null, 'NO_ERROR');
  exception when others then
    insert into portal_harden_results values ('cross_custom', null, sqlerrm);
  end;
  begin
    perform public.add_portal_request_line_atomic(v_shop, v_customer_a, v_work_order_a, v_actor_a, 'menu', '8e070000-0000-4000-8000-000000000001', null, null, null, 'harden:cross-menu', now());
    insert into portal_harden_results values ('cross_menu', null, 'NO_ERROR');
  exception when others then
    insert into portal_harden_results values ('cross_menu', null, sqlerrm);
  end;
end;
$harden_cross$;

-- 2. Customer A, as the portal does: diagnostic line, replay, info line,
--    then approval of the info line and of a normal job line.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"8e010000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $harden_own$
declare
  v_shop constant uuid := '8e030000-0000-4000-8000-000000000001';
  v_customer constant uuid := '8e040000-0000-4000-8000-000000000001';
  v_work_order constant uuid := '8e060000-0000-4000-8000-000000000001';
  v_actor constant uuid := '8e010000-0000-4000-8000-000000000002';
  v_info jsonb;
  v_job jsonb;
begin
  insert into portal_harden_results values (
    'diagnostic',
    public.add_portal_diagnostic_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'Shakes at speed', 'Highway only', 'harden:diag', now()),
    null);
  -- Replay one day later: must return the stored result and not touch the line.
  insert into portal_harden_results values (
    'diagnostic_replay',
    public.add_portal_diagnostic_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'Shakes at speed', 'Highway only', 'harden:diag', now() + interval '1 day'),
    null);

  v_info := public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'custom', null, 'Note only', null, 'info', 'harden:info', now());
  v_job := public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'custom', null, 'Real job', null, 'job', 'harden:job', now());

  begin
    perform public.apply_portal_line_decision_atomic(v_shop, v_customer, v_work_order, (v_info -> 'line' ->> 'id')::uuid, v_actor, 'approve', 'harden:approve-info', now());
    insert into portal_harden_results values ('approve_info', null, 'NO_ERROR');
  exception when others then
    insert into portal_harden_results values ('approve_info', null, sqlerrm);
  end;

  insert into portal_harden_results values (
    'approve_job',
    public.apply_portal_line_decision_atomic(v_shop, v_customer, v_work_order, (v_job -> 'line' ->> 'id')::uuid, v_actor, 'approve', 'harden:approve-job', now()),
    null);
  insert into portal_harden_results values (
    'decline_info',
    public.apply_portal_line_decision_atomic(v_shop, v_customer, v_work_order, (v_info -> 'line' ->> 'id')::uuid, v_actor, 'decline', 'harden:decline-info', now()),
    null);
end;
$harden_own$;

-- 3. Trusted service-role calls remain available.
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $harden_service$
begin
  insert into portal_harden_results values (
    'service_role_call',
    public.add_portal_request_line_atomic(
      '8e030000-0000-4000-8000-000000000001', '8e040000-0000-4000-8000-000000000001',
      '8e060000-0000-4000-8000-000000000001', '8e010000-0000-4000-8000-000000000002',
      'custom', null, 'Service role line', null, 'job', 'harden:service', now()),
    null);
end;
$harden_service$;

reset role;

do $harden_assertions$
declare
  v_line public.work_order_lines%rowtype;
  v_result jsonb;
begin
  -- Cross-customer calls are rejected and insert nothing.
  if (select error from portal_harden_results where label = 'cross_custom') is distinct from 'Portal customer actor mismatch.' then
    raise exception 'Cross-customer custom call was not rejected: %', (select error from portal_harden_results where label = 'cross_custom');
  end if;
  if (select error from portal_harden_results where label = 'cross_menu') is distinct from 'Portal customer actor mismatch.' then
    raise exception 'Cross-customer menu call was not rejected: %', (select error from portal_harden_results where label = 'cross_menu');
  end if;
  if exists (select 1 from public.work_order_lines where external_id like 'portal_request:harden:cross-%') then
    raise exception 'A rejected cross-customer call still inserted a line';
  end if;

  -- Diagnostic replay returns the stored final result and does not mutate.
  select result into v_result from portal_harden_results where label = 'diagnostic_replay';
  if (v_result ->> 'idempotent')::boolean is not true
     or v_result ->> 'kind' is distinct from 'diagnostic'
     or v_result -> 'line' ->> 'job_type' is distinct from 'diagnosis' then
    raise exception 'Diagnostic replay did not return the stored final result: %', v_result;
  end if;
  select * into v_line from public.work_order_lines
  where external_id = 'portal_request:harden:diag';
  if v_line.updated_at >= now() + interval '12 hours' then
    raise exception 'Diagnostic replay rewrote the line (updated_at %)', v_line.updated_at;
  end if;
  if (select count(*) from public.work_order_lines where external_id = 'portal_request:harden:diag') <> 1 then
    raise exception 'Diagnostic replay created another line';
  end if;

  -- Informational lines cannot be approved; job lines still can.
  if (select error from portal_harden_results where label = 'approve_info') is distinct from 'Informational lines cannot be approved.' then
    raise exception 'Approving an informational line was not refused: %', (select error from portal_harden_results where label = 'approve_info');
  end if;
  select * into v_line from public.work_order_lines where external_id = 'portal_request:harden:info';
  if v_line.approval_state is distinct from 'declined' or v_line.punchable is not false then
    raise exception 'Informational line ended in the wrong state: %', to_jsonb(v_line);
  end if;
  select * into v_line from public.work_order_lines where external_id = 'portal_request:harden:job';
  if v_line.approval_state is distinct from 'approved' or v_line.punchable is not true then
    raise exception 'Approving a normal job line regressed: %', to_jsonb(v_line);
  end if;

  -- Service-role path is intact.
  if (select (result ->> 'ok')::boolean from portal_harden_results where label = 'service_role_call') is not true then
    raise exception 'Service-role call regressed';
  end if;
end;
$harden_assertions$;

rollback;
