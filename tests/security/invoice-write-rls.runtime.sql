\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '41100000-0000-4000-8000-000000000001',
    'invoice-rls-owner-a@example.com',
    '{"full_name":"Invoice RLS Owner A"}'::jsonb
  ),
  (
    '42200000-0000-4000-8000-000000000002',
    'invoice-rls-owner-b@example.com',
    '{"full_name":"Invoice RLS Owner B"}'::jsonb
  ),
  (
    '43300000-0000-4000-8000-000000000003',
    'invoice-rls-tech-a@example.com',
    '{"full_name":"Invoice RLS Tech A"}'::jsonb
  ),
  (
    '54400000-0000-4000-8000-000000000004',
    'invoice-rls-portal@example.com',
    '{"full_name":"Invoice RLS Portal Customer"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '41100000-0000-4000-8000-000000000001',
    '41100000-0000-4000-8000-000000000001',
    'owner',
    'Invoice RLS Owner A'
  ),
  (
    '42200000-0000-4000-8000-000000000002',
    '42200000-0000-4000-8000-000000000002',
    'owner',
    'Invoice RLS Owner B'
  ),
  (
    '43300000-0000-4000-8000-000000000003',
    '43300000-0000-4000-8000-000000000003',
    'mechanic',
    'Invoice RLS Tech A'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values
  (
    'a4100000-0000-4000-8000-000000000001',
    '41100000-0000-4000-8000-000000000001',
    'Invoice RLS Shop A',
    'Invoice RLS Shop A'
  ),
  (
    'b4200000-0000-4000-8000-000000000002',
    '42200000-0000-4000-8000-000000000002',
    'Invoice RLS Shop B',
    'Invoice RLS Shop B'
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '42200000-0000-4000-8000-000000000002'::uuid
    then 'b4200000-0000-4000-8000-000000000002'::uuid
  else 'a4100000-0000-4000-8000-000000000001'::uuid
end
where id in (
  '41100000-0000-4000-8000-000000000001',
  '42200000-0000-4000-8000-000000000002',
  '43300000-0000-4000-8000-000000000003'
);

insert into public.work_orders (id, shop_id)
values
  (
    'a4120000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001'
  ),
  (
    'b4220000-0000-4000-8000-000000000002',
    'b4200000-0000-4000-8000-000000000002'
  );

insert into public.invoices (
  id,
  shop_id,
  work_order_id,
  invoice_number,
  status,
  notes
)
values
  (
    'a4110000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001',
    'a4120000-0000-4000-8000-000000000001',
    'INV-RLS-A',
    'draft',
    'original-a'
  ),
  (
    'b4210000-0000-4000-8000-000000000002',
    'b4200000-0000-4000-8000-000000000002',
    'b4220000-0000-4000-8000-000000000002',
    'INV-RLS-B',
    'draft',
    'original-b'
  );

-- A same-shop mechanic may still read an invoice through the staff read policy,
-- but must not be able to mutate it directly.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '43300000-0000-4000-8000-000000000003',
  true
);
set local role authenticated;
update public.invoices
set notes = 'mechanic-mutated'
where id = 'a4110000-0000-4000-8000-000000000001';
reset role;

do $$
begin
  if exists (
    select 1
    from public.invoices
    where id = 'a4110000-0000-4000-8000-000000000001'
      and notes = 'mechanic-mutated'
  ) then
    raise exception
      'Invoice RLS regression: same-shop mechanic directly updated invoice';
  end if;
end
$$;

-- A billing operator in the invoice shop retains the intended direct write
-- contract used by authenticated billing workflows.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '41100000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
update public.invoices
set notes = 'owner-a-updated'
where id = 'a4110000-0000-4000-8000-000000000001';
reset role;

do $$
begin
  if not exists (
    select 1
    from public.invoices
    where id = 'a4110000-0000-4000-8000-000000000001'
      and notes = 'owner-a-updated'
  ) then
    raise exception
      'Invoice RLS regression: same-shop billing operator could not update invoice';
  end if;
end
$$;

-- Even a billing operator cannot cross the tenant boundary.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '42200000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
update public.invoices
set notes = 'owner-b-cross-shop'
where id = 'a4110000-0000-4000-8000-000000000001';
reset role;

do $$
begin
  if exists (
    select 1
    from public.invoices
    where id = 'a4110000-0000-4000-8000-000000000001'
      and notes = 'owner-b-cross-shop'
  ) then
    raise exception
      'Invoice RLS regression: billing operator crossed shop boundary';
  end if;

  if has_table_privilege('anon', 'public.invoices', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.invoices', 'TRUNCATE') then
    raise exception
      'Invoice RLS regression: API-facing role retains TRUNCATE on invoices';
  end if;

  if has_table_privilege('anon', 'public.payments', 'INSERT')
     or has_table_privilege('anon', 'public.payments', 'UPDATE')
     or has_table_privilege('anon', 'public.payments', 'DELETE')
     or has_table_privilege('anon', 'public.payments', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.payments', 'INSERT')
     or has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     or has_table_privilege('authenticated', 'public.payments', 'DELETE')
     or has_table_privilege('authenticated', 'public.payments', 'TRUNCATE') then
    raise exception
      'Payment RLS regression: API-facing role retains payment mutation privileges';
  end if;
end
$$;

-- A customer identity alone must not expose invoices. Visibility requires an
-- accepted, non-revoked portal invite and must disappear again on revocation.
insert into public.customers (id, user_id, shop_id, name, email)
values (
  'a4140000-0000-4000-8000-000000000004',
  '54400000-0000-4000-8000-000000000004',
  'a4100000-0000-4000-8000-000000000001',
  'Invoice RLS Portal Customer',
  'invoice-rls-portal@example.com'
);

insert into public.work_orders (id, shop_id, customer_id)
values (
  'a4150000-0000-4000-8000-000000000005',
  'a4100000-0000-4000-8000-000000000001',
  'a4140000-0000-4000-8000-000000000004'
);

insert into public.invoices (
  id,
  shop_id,
  work_order_id,
  customer_id,
  invoice_number,
  status
)
values (
  'a4160000-0000-4000-8000-000000000006',
  'a4100000-0000-4000-8000-000000000001',
  'a4150000-0000-4000-8000-000000000005',
  'a4140000-0000-4000-8000-000000000004',
  'INV-RLS-PORTAL',
  'draft'
);

insert into public.customer_portal_invites (
  id,
  customer_id,
  shop_id,
  email,
  token
)
values (
  'a4170000-0000-4000-8000-000000000007',
  'a4140000-0000-4000-8000-000000000004',
  'a4100000-0000-4000-8000-000000000001',
  'invoice-rls-portal@example.com',
  'a4180000-0000-4000-8000-000000000008'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '54400000-0000-4000-8000-000000000004',
  true
);
set local role authenticated;
do $$
begin
  if exists (
    select 1
    from public.invoices
    where id = 'a4160000-0000-4000-8000-000000000006'
  ) then
    raise exception
      'Invoice RLS regression: unaccepted portal invite can read invoice';
  end if;
end
$$;
reset role;

update public.customer_portal_invites
set accepted_at = now(),
    accepted_by_user_id = '54400000-0000-4000-8000-000000000004'
where id = 'a4170000-0000-4000-8000-000000000007';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '54400000-0000-4000-8000-000000000004',
  true
);
set local role authenticated;
do $$
begin
  if not exists (
    select 1
    from public.invoices
    where id = 'a4160000-0000-4000-8000-000000000006'
  ) then
    raise exception
      'Invoice RLS regression: accepted portal invite cannot read invoice';
  end if;
end
$$;
reset role;

update public.customer_portal_invites
set revoked_at = now()
where id = 'a4170000-0000-4000-8000-000000000007';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '54400000-0000-4000-8000-000000000004',
  true
);
set local role authenticated;
do $$
begin
  if exists (
    select 1
    from public.invoices
    where id = 'a4160000-0000-4000-8000-000000000006'
  ) then
    raise exception
      'Invoice RLS regression: revoked portal invite can still read invoice';
  end if;
end
$$;
reset role;

rollback;
