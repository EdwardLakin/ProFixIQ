\set ON_ERROR_STOP on

begin;

-- Fixtures: one shop, a portal customer (A), a second customer (B) in the same
-- shop, and one work order for each.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('8d010000-0000-4000-8000-000000000001', 'portal-diag-owner@example.test', '{"full_name":"Portal Diag Owner"}'::jsonb),
  ('8d010000-0000-4000-8000-000000000002', 'portal-diag-customer-a@example.test', '{"full_name":"Portal Diag Customer A"}'::jsonb),
  ('8d010000-0000-4000-8000-000000000003', 'portal-diag-customer-b@example.test', '{"full_name":"Portal Diag Customer B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values ('8d010000-0000-4000-8000-000000000001', '8d010000-0000-4000-8000-000000000001', 'owner', 'Portal Diag Owner')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values ('8d030000-0000-4000-8000-000000000001', '8d010000-0000-4000-8000-000000000001', 'Portal Diag Shop', 'Portal Diag Shop', 5)
on conflict (id) do nothing;

update public.profiles
set shop_id = '8d030000-0000-4000-8000-000000000001'
where id = '8d010000-0000-4000-8000-000000000001';

insert into public.customers (id, shop_id, user_id, name)
values
  ('8d040000-0000-4000-8000-000000000001', '8d030000-0000-4000-8000-000000000001', '8d010000-0000-4000-8000-000000000002', 'Portal Diag Customer A'),
  ('8d040000-0000-4000-8000-000000000002', '8d030000-0000-4000-8000-000000000001', '8d010000-0000-4000-8000-000000000003', 'Portal Diag Customer B');

insert into public.vehicles (id, shop_id, user_id, customer_id, vin, year, make, model)
values
  ('8d050000-0000-4000-8000-000000000001', '8d030000-0000-4000-8000-000000000001', '8d010000-0000-4000-8000-000000000002', '8d040000-0000-4000-8000-000000000001', '1FTBW1X80NKA8D501', 2022, 'Ford', 'Transit'),
  ('8d050000-0000-4000-8000-000000000002', '8d030000-0000-4000-8000-000000000001', '8d010000-0000-4000-8000-000000000003', '8d040000-0000-4000-8000-000000000002', '1FTBW1X80NKA8D502', 2022, 'Ford', 'Transit');

insert into public.work_orders (id, shop_id, customer_id, vehicle_id, custom_id, status)
values
  ('8d060000-0000-4000-8000-000000000001', '8d030000-0000-4000-8000-000000000001', '8d040000-0000-4000-8000-000000000001', '8d050000-0000-4000-8000-000000000001', 'PORTAL-DIAG-A', 'new'),
  ('8d060000-0000-4000-8000-000000000002', '8d030000-0000-4000-8000-000000000001', '8d040000-0000-4000-8000-000000000002', '8d050000-0000-4000-8000-000000000002', 'PORTAL-DIAG-B', 'new');

insert into public.menu_items (id, shop_id, description)
values ('8d070000-0000-4000-8000-000000000001', '8d030000-0000-4000-8000-000000000001', 'Portal diag oil change');


create temp table portal_diag_results (label text primary key, result jsonb, error text);
grant all on table portal_diag_results to authenticated;

-- Everything below is called exactly as the portal does: as the authenticated
-- customer, through the RPCs.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"8d010000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $portal_diag_calls$
declare
  v_shop constant uuid := '8d030000-0000-4000-8000-000000000001';
  v_customer constant uuid := '8d040000-0000-4000-8000-000000000001';
  v_work_order constant uuid := '8d060000-0000-4000-8000-000000000001';
  v_other_work_order constant uuid := '8d060000-0000-4000-8000-000000000002';
  v_actor constant uuid := '8d010000-0000-4000-8000-000000000002';
begin
  insert into portal_diag_results values (
    'custom_job',
    public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'custom', null, 'Brake noise', 'Squeals when cold', 'job', 'portal-diag:custom-job', now()),
    null
  );
  insert into portal_diag_results values (
    'custom_job_replay',
    public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'custom', null, 'Brake noise', 'Squeals when cold', 'job', 'portal-diag:custom-job', now()),
    null
  );
  insert into portal_diag_results values (
    'custom_info',
    public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'custom', null, 'Customer note only', null, 'info', 'portal-diag:custom-info', now()),
    null
  );
  insert into portal_diag_results values (
    'menu',
    public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'menu', '8d070000-0000-4000-8000-000000000001', null, null, null, 'portal-diag:menu', now()),
    null
  );
  insert into portal_diag_results values (
    'diagnostic',
    public.add_portal_diagnostic_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'Steering wheel shakes at highway speed', 'When it happens: 90-110 km/h', 'portal-diag:diagnostic', now()),
    null
  );
  insert into portal_diag_results values (
    'diagnostic_replay',
    public.add_portal_diagnostic_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'Steering wheel shakes at highway speed', 'When it happens: 90-110 km/h', 'portal-diag:diagnostic', now()),
    null
  );

  -- Authorization and validation are unchanged.
  begin
    perform public.add_portal_request_line_atomic(v_shop, v_customer, v_other_work_order, v_actor, 'custom', null, 'Not mine', null, 'job', 'portal-diag:other-wo', now());
    insert into portal_diag_results values ('other_customers_work_order', null, 'NO_ERROR');
  exception when others then
    insert into portal_diag_results values ('other_customers_work_order', null, sqlerrm);
  end;

  begin
    perform public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'custom', null, '   ', null, 'job', 'portal-diag:blank', now());
    insert into portal_diag_results values ('blank_description', null, 'NO_ERROR');
  exception when others then
    insert into portal_diag_results values ('blank_description', null, sqlerrm);
  end;

  begin
    perform public.add_portal_diagnostic_line_atomic(v_shop, v_customer, v_work_order, '8d010000-0000-4000-8000-000000000003', 'Spoofed actor', null, 'portal-diag:spoof', now());
    insert into portal_diag_results values ('spoofed_actor', null, 'NO_ERROR');
  exception when others then
    insert into portal_diag_results values ('spoofed_actor', null, sqlerrm);
  end;
end;
$portal_diag_calls$;

reset role;

do $portal_diag_assertions$
declare
  v_line public.work_order_lines%rowtype;
  v_result jsonb;
  v_count integer;
begin
  -- Custom job line: created, pending, not punchable, idempotent on replay.
  select result into v_result from portal_diag_results where label = 'custom_job';
  if (v_result ->> 'ok')::boolean is not true or (v_result ->> 'idempotent')::boolean is not false then
    raise exception 'Custom job line was not created: %', v_result;
  end if;
  select * into v_line from public.work_order_lines where id = (v_result -> 'line' ->> 'id')::uuid;
  if v_line.status is distinct from 'awaiting_approval'
     or v_line.approval_state is distinct from 'pending'
     or v_line.line_type is distinct from 'job'
     or v_line.punchable is not false
     or v_line.complaint is distinct from 'Brake noise'
     or v_line.external_id is distinct from 'portal_request:portal-diag:custom-job' then
    raise exception 'Custom job line has the wrong shape: %', to_jsonb(v_line);
  end if;
  select count(*) into v_count from public.work_order_lines where external_id = 'portal_request:portal-diag:custom-job';
  if v_count <> 1 then
    raise exception 'Replayed custom line created % rows', v_count;
  end if;
  if ((select result from portal_diag_results where label = 'custom_job_replay') ->> 'idempotent')::boolean is not true then
    raise exception 'Replayed custom line was not reported as idempotent.';
  end if;

  -- Info line: same path, never punchable.
  select result into v_result from portal_diag_results where label = 'custom_info';
  select * into v_line from public.work_order_lines where id = (v_result -> 'line' ->> 'id')::uuid;
  if v_line.line_type is distinct from 'info' or v_line.punchable is not false then
    raise exception 'Info line has the wrong shape: %', to_jsonb(v_line);
  end if;

  -- Menu lines keep their existing shape. (The inspection kind is not exercised:
  -- it reads inspection_templates.is_active, a column absent from the schema,
  -- which is a separate pre-existing defect outside this change.)
  select result into v_result from portal_diag_results where label = 'menu';
  select * into v_line from public.work_order_lines where id = (v_result -> 'line' ->> 'id')::uuid;
  if v_line.menu_item_id is distinct from '8d070000-0000-4000-8000-000000000001'::uuid
     or v_line.status is distinct from 'awaiting_approval'
     or v_line.approval_state is distinct from 'pending' then
    raise exception 'Menu line changed shape: %', to_jsonb(v_line);
  end if;

  -- Diagnostic line: stamped with the canonical job type.
  select result into v_result from portal_diag_results where label = 'diagnostic';
  if (v_result ->> 'ok')::boolean is not true
     or v_result ->> 'kind' is distinct from 'diagnostic'
     or v_result -> 'line' ->> 'job_type' is distinct from 'diagnosis' then
    raise exception 'Diagnostic result has the wrong shape: %', v_result;
  end if;
  select * into v_line from public.work_order_lines where id = (v_result -> 'line' ->> 'id')::uuid;
  if v_line.job_type is distinct from 'diagnosis'
     or v_line.complaint is distinct from 'Steering wheel shakes at highway speed'
     or v_line.description is distinct from 'Steering wheel shakes at highway speed'
     or v_line.notes is distinct from 'When it happens: 90-110 km/h'
     or v_line.approval_state is distinct from 'pending'
     or v_line.punchable is not false then
    raise exception 'Diagnostic line has the wrong shape: %', to_jsonb(v_line);
  end if;
  select count(*) into v_count from public.work_order_lines where external_id = 'portal_request:portal-diag:diagnostic';
  if v_count <> 1 then
    raise exception 'Replayed diagnostic line created % rows', v_count;
  end if;

  -- Authorization and validation are unchanged.
  if (select error from portal_diag_results where label = 'other_customers_work_order') is distinct from 'Work order is not owned by this portal customer.' then
    raise exception 'Another customer''s work order was not rejected: %', (select error from portal_diag_results where label = 'other_customers_work_order');
  end if;
  if (select error from portal_diag_results where label = 'blank_description') is distinct from 'Custom request description is required.' then
    raise exception 'Blank description was not rejected: %', (select error from portal_diag_results where label = 'blank_description');
  end if;
  if (select error from portal_diag_results where label = 'spoofed_actor') is distinct from 'Portal customer actor mismatch.' then
    raise exception 'Spoofed actor was not rejected: %', (select error from portal_diag_results where label = 'spoofed_actor');
  end if;
end;
$portal_diag_assertions$;

rollback;
