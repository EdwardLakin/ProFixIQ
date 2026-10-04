\set ON_ERROR_STOP on

begin;

-- Fixtures: one shop with an inspection template, one customer with a work
-- order, and a second shop's template that must not be usable.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('8f010000-0000-4000-8000-000000000001', 'portal-insp-owner@example.test', '{"full_name":"Portal Insp Owner"}'::jsonb),
  ('8f010000-0000-4000-8000-000000000002', 'portal-insp-customer@example.test', '{}'::jsonb),
  ('8f010000-0000-4000-8000-000000000003', 'portal-insp-owner-b@example.test', '{"full_name":"Portal Insp Owner B"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('8f010000-0000-4000-8000-000000000001', '8f010000-0000-4000-8000-000000000001', 'owner', 'Portal Insp Owner'),
  ('8f010000-0000-4000-8000-000000000003', '8f010000-0000-4000-8000-000000000003', 'owner', 'Portal Insp Owner B')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('8f030000-0000-4000-8000-000000000001', '8f010000-0000-4000-8000-000000000001', 'Portal Insp Shop', 'Portal Insp Shop', 5),
  ('8f030000-0000-4000-8000-000000000002', '8f010000-0000-4000-8000-000000000003', 'Portal Insp Shop B', 'Portal Insp Shop B', 5)
on conflict (id) do nothing;

update public.profiles set shop_id = '8f030000-0000-4000-8000-000000000001'
where id = '8f010000-0000-4000-8000-000000000001';
update public.profiles set shop_id = '8f030000-0000-4000-8000-000000000002'
where id = '8f010000-0000-4000-8000-000000000003';

insert into public.customers (id, shop_id, user_id, name)
values ('8f040000-0000-4000-8000-000000000001', '8f030000-0000-4000-8000-000000000001', '8f010000-0000-4000-8000-000000000002', 'Portal Insp Customer');

insert into public.vehicles (id, shop_id, user_id, customer_id, vin, year, make, model)
values ('8f050000-0000-4000-8000-000000000001', '8f030000-0000-4000-8000-000000000001', '8f010000-0000-4000-8000-000000000002', '8f040000-0000-4000-8000-000000000001', '1FTBW1X80NKA8F501', 2022, 'Ford', 'Transit');

insert into public.work_orders (id, shop_id, customer_id, vehicle_id, custom_id, status)
values ('8f060000-0000-4000-8000-000000000001', '8f030000-0000-4000-8000-000000000001', '8f040000-0000-4000-8000-000000000001', '8f050000-0000-4000-8000-000000000001', 'PORTAL-INSP-A', 'new');

insert into public.inspection_templates (id, shop_id, template_name, description, sections)
values
  ('8f080000-0000-4000-8000-000000000001', '8f030000-0000-4000-8000-000000000001', 'Seasonal safety inspection', 'Checks tires, brakes and fluids', '[]'::jsonb),
  ('8f080000-0000-4000-8000-000000000002', '8f030000-0000-4000-8000-000000000001', '   ', 'Description only template', '[]'::jsonb),
  ('8f080000-0000-4000-8000-000000000003', '8f030000-0000-4000-8000-000000000002', 'Other shop inspection', null, '[]'::jsonb);

create temp table portal_insp_results (label text primary key, result jsonb, error text);
grant all on table portal_insp_results to authenticated;

-- Called exactly as the portal does: as the authenticated customer.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"8f010000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $portal_insp_calls$
declare
  v_shop constant uuid := '8f030000-0000-4000-8000-000000000001';
  v_customer constant uuid := '8f040000-0000-4000-8000-000000000001';
  v_work_order constant uuid := '8f060000-0000-4000-8000-000000000001';
  v_actor constant uuid := '8f010000-0000-4000-8000-000000000002';
begin
  insert into portal_insp_results values (
    'named',
    public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'inspection', '8f080000-0000-4000-8000-000000000001', null, null, null, 'portal-insp:named', now()),
    null);
  insert into portal_insp_results values (
    'named_replay',
    public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'inspection', '8f080000-0000-4000-8000-000000000001', null, null, null, 'portal-insp:named', now()),
    null);
  insert into portal_insp_results values (
    'description_only',
    public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'inspection', '8f080000-0000-4000-8000-000000000002', null, null, null, 'portal-insp:description', now()),
    null);

  begin
    perform public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'inspection', '8f080000-0000-4000-8000-000000000003', null, null, null, 'portal-insp:other-shop', now());
    insert into portal_insp_results values ('other_shop_template', null, 'NO_ERROR');
  exception when others then
    insert into portal_insp_results values ('other_shop_template', null, sqlerrm);
  end;

  begin
    perform public.add_portal_request_line_atomic(v_shop, v_customer, v_work_order, v_actor, 'inspection', '8f080000-0000-4000-8000-0000000000ff', null, null, null, 'portal-insp:missing', now());
    insert into portal_insp_results values ('missing_template', null, 'NO_ERROR');
  exception when others then
    insert into portal_insp_results values ('missing_template', null, sqlerrm);
  end;
end;
$portal_insp_calls$;

reset role;

do $portal_insp_assertions$
declare
  v_line public.work_order_lines%rowtype;
  v_result jsonb;
begin
  select result into v_result from portal_insp_results where label = 'named';
  if (v_result ->> 'ok')::boolean is not true or (v_result ->> 'idempotent')::boolean is not false then
    raise exception 'Inspection line was not created: %', v_result;
  end if;
  select * into v_line from public.work_order_lines where id = (v_result -> 'line' ->> 'id')::uuid;
  if v_line.job_type is distinct from 'inspection'
     or v_line.inspection_template_id is distinct from '8f080000-0000-4000-8000-000000000001'::uuid
     or v_line.description is distinct from 'Seasonal safety inspection'
     or v_line.status is distinct from 'awaiting_approval'
     or v_line.approval_state is distinct from 'pending'
     or v_line.line_status is distinct from 'pending'
     or v_line.punchable is not false
     or v_line.external_id is distinct from 'portal_request:portal-insp:named' then
    raise exception 'Inspection line has the wrong shape: %', to_jsonb(v_line);
  end if;

  if ((select result from portal_insp_results where label = 'named_replay') ->> 'idempotent')::boolean is not true then
    raise exception 'Replayed inspection request was not idempotent';
  end if;
  if (select count(*) from public.work_order_lines where external_id = 'portal_request:portal-insp:named') <> 1 then
    raise exception 'Replayed inspection request created another line';
  end if;

  -- A template with a blank name falls back to its description.
  select result into v_result from portal_insp_results where label = 'description_only';
  select * into v_line from public.work_order_lines where id = (v_result -> 'line' ->> 'id')::uuid;
  if v_line.description is distinct from 'Description only template' then
    raise exception 'Description fallback failed: %', to_jsonb(v_line);
  end if;

  -- Tenant scope and validation are unchanged.
  if (select error from portal_insp_results where label = 'other_shop_template') is distinct from 'Inspection template not found for this shop.' then
    raise exception 'Another shop''s template was not rejected: %', (select error from portal_insp_results where label = 'other_shop_template');
  end if;
  if (select error from portal_insp_results where label = 'missing_template') is distinct from 'Inspection template not found for this shop.' then
    raise exception 'A missing template was not rejected: %', (select error from portal_insp_results where label = 'missing_template');
  end if;
end;
$portal_insp_assertions$;

rollback;
