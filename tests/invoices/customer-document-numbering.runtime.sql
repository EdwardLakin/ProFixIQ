\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a6000000-0000-4000-8000-000000000001',
  'document-number-runtime-owner@example.com',
  '{"full_name":"Document Number Runtime Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values (
  'a6000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  'owner',
  'Document Number Runtime Owner'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values (
  'b6000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  'Document Number Runtime Shop',
  'Document Number Runtime Shop'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = 'b6000000-0000-4000-8000-000000000001'
where id = 'a6000000-0000-4000-8000-000000000001';

insert into public.work_orders (id, shop_id, status, type, custom_id)
values
  (
    'c6000000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000001',
    'in_progress',
    'repair',
    null
  ),
  (
    'c6000000-0000-4000-8000-000000000002',
    'b6000000-0000-4000-8000-000000000001',
    'in_progress',
    'repair',
    'WO-deadbeefcafe'
  );

do $$
declare
  v_first text;
  v_second text;
begin
  select custom_id into v_first
  from public.work_orders
  where id = 'c6000000-0000-4000-8000-000000000001';

  select custom_id into v_second
  from public.work_orders
  where id = 'c6000000-0000-4000-8000-000000000002';

  if v_first !~ '^WO-[0-9]{6,}$'
     or v_second !~ '^WO-[0-9]{6,}$'
     or v_first = v_second then
    raise exception 'Runtime assertion failed: work-order numbers are not canonical and unique.';
  end if;
end
$$;

insert into public.invoices (
  id,
  shop_id,
  work_order_id,
  invoice_number,
  status,
  subtotal,
  discount_total,
  tax_total,
  total,
  currency
)
values
  (
    'd6000000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001',
    null,
    'draft',
    0,
    0,
    0,
    0,
    'CAD'
  ),
  (
    'd6000000-0000-4000-8000-000000000002',
    'b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000002',
    'WO-deadbeef',
    'draft',
    0,
    0,
    0,
    0,
    'CAD'
  );

do $$
declare
  v_first text;
  v_second text;
begin
  select invoice_number into v_first
  from public.invoices
  where id = 'd6000000-0000-4000-8000-000000000001';

  select invoice_number into v_second
  from public.invoices
  where id = 'd6000000-0000-4000-8000-000000000002';

  if v_first !~ '^INV-[0-9]{6,}$'
     or v_second !~ '^INV-[0-9]{6,}$'
     or v_first = v_second then
    raise exception 'Runtime assertion failed: invoice numbers are not canonical and unique.';
  end if;
end
$$;

select 'customer_document_numbering_runtime_ok' as result;

rollback;
