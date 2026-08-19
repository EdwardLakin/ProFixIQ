\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '68100000-0000-4000-8000-000000000001',
    'vehicle-workspace-owner-a@example.test',
    '{"full_name":"Vehicle Workspace Owner A"}'::jsonb
  ),
  (
    '68100000-0000-4000-8000-000000000002',
    'vehicle-workspace-owner-b@example.test',
    '{"full_name":"Vehicle Workspace Owner B"}'::jsonb
  ),
  (
    '68100000-0000-4000-8000-000000000003',
    'vehicle-workspace-mechanic-a@example.test',
    '{"full_name":"Vehicle Workspace Mechanic A"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '68100000-0000-4000-8000-000000000001',
    '68100000-0000-4000-8000-000000000001',
    'owner',
    'Vehicle Workspace Owner A'
  ),
  (
    '68100000-0000-4000-8000-000000000002',
    '68100000-0000-4000-8000-000000000002',
    'owner',
    'Vehicle Workspace Owner B'
  ),
  (
    '68100000-0000-4000-8000-000000000003',
    '68100000-0000-4000-8000-000000000003',
    'mechanic',
    'Vehicle Workspace Mechanic A'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  (
    '68200000-0000-4000-8000-000000000001',
    '68100000-0000-4000-8000-000000000001',
    'Vehicle Workspace Shop A',
    'Vehicle Workspace Shop A',
    5
  ),
  (
    '68200000-0000-4000-8000-000000000002',
    '68100000-0000-4000-8000-000000000002',
    'Vehicle Workspace Shop B',
    'Vehicle Workspace Shop B',
    5
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id in (
    '68100000-0000-4000-8000-000000000001'::uuid,
    '68100000-0000-4000-8000-000000000003'::uuid
  ) then '68200000-0000-4000-8000-000000000001'::uuid
  else '68200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '68100000-0000-4000-8000-000000000001',
  '68100000-0000-4000-8000-000000000002',
  '68100000-0000-4000-8000-000000000003'
);

insert into public.customers (id, shop_id, user_id, name)
values
  (
    '68600000-0000-4000-8000-000000000001',
    '68200000-0000-4000-8000-000000000001',
    '68100000-0000-4000-8000-000000000001',
    'Vehicle Workspace Customer A'
  ),
  (
    '68600000-0000-4000-8000-000000000002',
    '68200000-0000-4000-8000-000000000002',
    '68100000-0000-4000-8000-000000000002',
    'Vehicle Workspace Customer B'
  );

insert into public.vehicles (
  id, shop_id, user_id, customer_id, vin, license_plate, unit_number, year, make, model
)
values
  (
    '68300000-0000-4000-8000-000000000001',
    '68200000-0000-4000-8000-000000000001',
    '68100000-0000-4000-8000-000000000001',
    '68600000-0000-4000-8000-000000000001',
    '1FTBW1X80NKA10001',
    'WS-A-1',
    'A-1',
    2022,
    'Ford',
    'Transit'
  ),
  (
    '68300000-0000-4000-8000-000000000002',
    '68200000-0000-4000-8000-000000000002',
    '68100000-0000-4000-8000-000000000002',
    '68600000-0000-4000-8000-000000000002',
    '1FTBW1X80NKA10002',
    'WS-B-1',
    'B-1',
    2022,
    'Ford',
    'Transit'
  );

insert into public.work_orders (
  id, shop_id, customer_id, vehicle_id, custom_id, status, record_type
)
values
  (
    '68400000-0000-4000-8000-000000000001',
    '68200000-0000-4000-8000-000000000001',
    '68600000-0000-4000-8000-000000000001',
    '68300000-0000-4000-8000-000000000001',
    'WS-A-1001',
    'in_progress',
    'work_order'
  ),
  (
    '68400000-0000-4000-8000-000000000002',
    '68200000-0000-4000-8000-000000000002',
    '68600000-0000-4000-8000-000000000002',
    '68300000-0000-4000-8000-000000000002',
    'WS-B-1001',
    'in_progress',
    'work_order'
  );

insert into public.invoices (
  id, shop_id, work_order_id, invoice_number, status, issued_at, currency
)
values
  (
    '68500000-0000-4000-8000-000000000001',
    '68200000-0000-4000-8000-000000000001',
    '68400000-0000-4000-8000-000000000001',
    'WS-A-INV-1',
    'issued',
    now(),
    'CAD'
  ),
  (
    '68500000-0000-4000-8000-000000000002',
    '68200000-0000-4000-8000-000000000002',
    '68400000-0000-4000-8000-000000000002',
    'WS-B-INV-1',
    'issued',
    now(),
    'CAD'
  );

-- Shop A may resolve its canonical records but cannot enumerate Shop B by a
-- guessed vehicle, WO, or invoice ID.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"68100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $vehicle_workspace_tenant$
begin
  if not exists (
    select 1 from public.vehicles
    where id = '68300000-0000-4000-8000-000000000001'
  ) or not exists (
    select 1 from public.work_orders
    where id = '68400000-0000-4000-8000-000000000001'
  ) or not exists (
    select 1 from public.invoices
    where id = '68500000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Vehicle workspace owner could not read same-Shop sources.';
  end if;

  if exists (
    select 1 from public.vehicles
    where id = '68300000-0000-4000-8000-000000000002'
  ) or exists (
    select 1 from public.work_orders
    where id = '68400000-0000-4000-8000-000000000002'
  ) or exists (
    select 1 from public.invoices
    where id = '68500000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Vehicle workspace tenant boundary exposed Shop B records.';
  end if;
end
$vehicle_workspace_tenant$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

-- A mechanic can see the same-Shop vehicle identity under existing vehicle RLS,
-- but an unassigned WO is not visible. The TypeScript read model requires that
-- RLS-visible WO anchor before returning any vehicle history.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"68100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $vehicle_workspace_mechanic$
begin
  if not exists (
    select 1 from public.vehicles
    where id = '68300000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Vehicle workspace mechanic fixture could not read vehicle identity.';
  end if;

  if exists (
    select 1 from public.work_orders
    where id = '68400000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Unassigned mechanic read a work order anchor.';
  end if;
end
$vehicle_workspace_mechanic$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

-- Anonymous direct access cannot discover either tenant.
set local role anon;

do $vehicle_workspace_anon$
begin
  begin
    if exists (
      select 1 from public.vehicles
      where id in (
        '68300000-0000-4000-8000-000000000001',
        '68300000-0000-4000-8000-000000000002'
      )
    ) then
      raise exception 'Anonymous actor discovered Vehicle Workspace vehicles.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    if exists (
      select 1 from public.work_orders
      where id in (
        '68400000-0000-4000-8000-000000000001',
        '68400000-0000-4000-8000-000000000002'
      )
    ) then
      raise exception 'Anonymous actor discovered Vehicle Workspace work orders.';
    end if;
  exception
    when insufficient_privilege then null;
  end;
end
$vehicle_workspace_anon$;

reset role;
rollback;
