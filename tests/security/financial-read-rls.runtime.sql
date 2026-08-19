\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '61100000-0000-4000-8000-000000000001',
    'financial-read-owner@example.com',
    '{}'::jsonb
  ),
  (
    '62200000-0000-4000-8000-000000000002',
    'financial-read-tech@example.com',
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '61100000-0000-4000-8000-000000000001',
    '61100000-0000-4000-8000-000000000001',
    'owner',
    'Financial Read Owner'
  ),
  (
    '62200000-0000-4000-8000-000000000002',
    '62200000-0000-4000-8000-000000000002',
    'mechanic',
    'Financial Read Tech'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values (
  'a6100000-0000-4000-8000-000000000001',
  '61100000-0000-4000-8000-000000000001',
  'Financial Read Shop',
  'Financial Read Shop'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = 'a6100000-0000-4000-8000-000000000001'
where id in (
  '61100000-0000-4000-8000-000000000001',
  '62200000-0000-4000-8000-000000000002'
);

insert into public.work_orders (id, shop_id)
values (
  'a6200000-0000-4000-8000-000000000002',
  'a6100000-0000-4000-8000-000000000001'
);

insert into public.invoices (
  id,
  shop_id,
  work_order_id,
  invoice_number,
  status
)
values (
  'a6300000-0000-4000-8000-000000000003',
  'a6100000-0000-4000-8000-000000000001',
  'a6200000-0000-4000-8000-000000000002',
  'INV-READ-RLS',
  'draft'
);

insert into public.payments (
  id,
  shop_id,
  work_order_id,
  amount,
  status,
  stripe_session_id,
  amount_cents
)
values (
  'a6400000-0000-4000-8000-000000000004',
  'a6100000-0000-4000-8000-000000000001',
  'a6200000-0000-4000-8000-000000000002',
  12.34,
  'succeeded',
  'financial-read-rls-session',
  1234
);

insert into public.invoice_versions (
  id,
  shop_id,
  work_order_id,
  invoice_id,
  version_number,
  lifecycle_status,
  currency,
  subtotal,
  total,
  snapshot,
  snapshot_hash,
  issued_at
)
values (
  'a6500000-0000-4000-8000-000000000005',
  'a6100000-0000-4000-8000-000000000001',
  'a6200000-0000-4000-8000-000000000002',
  'a6300000-0000-4000-8000-000000000003',
  1,
  'issued',
  'CAD',
  12.34,
  12.34,
  '{}'::jsonb,
  'financial-read-rls-version',
  now()
);

insert into public.payment_events (
  id,
  shop_id,
  work_order_id,
  invoice_version_id,
  event_kind,
  amount,
  currency,
  processor,
  operation_key
)
values (
  'a6600000-0000-4000-8000-000000000006',
  'a6100000-0000-4000-8000-000000000001',
  'a6200000-0000-4000-8000-000000000002',
  'a6500000-0000-4000-8000-000000000005',
  'payment_succeeded',
  12.34,
  'CAD',
  'test',
  'financial-read-rls-event'
);

insert into public.payment_receipts (
  id,
  shop_id,
  work_order_id,
  invoice_version_id,
  payment_event_id,
  receipt_number,
  amount,
  currency,
  received_at,
  remaining_balance
)
values (
  'a6700000-0000-4000-8000-000000000007',
  'a6100000-0000-4000-8000-000000000001',
  'a6200000-0000-4000-8000-000000000002',
  'a6500000-0000-4000-8000-000000000005',
  'a6600000-0000-4000-8000-000000000006',
  'R-FINANCIAL-READ',
  12.34,
  'CAD',
  now(),
  0
);

-- Same-shop floor roles do not have application financial access and must not
-- recover it by querying any canonical financial table through PostgREST.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '62200000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
do $$
begin
  if exists (
    select 1 from public.invoices
    where id = 'a6300000-0000-4000-8000-000000000003'
  ) then
    raise exception
      'Financial read RLS regression: same-shop mechanic can read invoice';
  end if;

  if exists (
    select 1 from public.payments
    where id = 'a6400000-0000-4000-8000-000000000004'
  ) then
    raise exception
      'Financial read RLS regression: same-shop mechanic can read payment';
  end if;

  if exists (
    select 1 from public.invoice_versions
    where id = 'a6500000-0000-4000-8000-000000000005'
  ) then
    raise exception
      'Financial read RLS regression: same-shop mechanic can read invoice version';
  end if;

  if exists (
    select 1 from public.payment_events
    where id = 'a6600000-0000-4000-8000-000000000006'
  ) then
    raise exception
      'Financial read RLS regression: same-shop mechanic can read payment event';
  end if;

  if exists (
    select 1 from public.payment_receipts
    where id = 'a6700000-0000-4000-8000-000000000007'
  ) then
    raise exception
      'Financial read RLS regression: same-shop mechanic can read payment receipt';
  end if;
end
$$;
reset role;

-- Billing operators retain same-shop visibility across the complete canonical
-- financial read model.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '61100000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
do $$
begin
  if not exists (
    select 1 from public.invoices
    where id = 'a6300000-0000-4000-8000-000000000003'
  ) then
    raise exception
      'Financial read RLS regression: same-shop owner cannot read invoice';
  end if;

  if not exists (
    select 1 from public.payments
    where id = 'a6400000-0000-4000-8000-000000000004'
  ) then
    raise exception
      'Financial read RLS regression: same-shop owner cannot read payment';
  end if;

  if not exists (
    select 1 from public.invoice_versions
    where id = 'a6500000-0000-4000-8000-000000000005'
  ) then
    raise exception
      'Financial read RLS regression: same-shop owner cannot read invoice version';
  end if;

  if not exists (
    select 1 from public.payment_events
    where id = 'a6600000-0000-4000-8000-000000000006'
  ) then
    raise exception
      'Financial read RLS regression: same-shop owner cannot read payment event';
  end if;

  if not exists (
    select 1 from public.payment_receipts
    where id = 'a6700000-0000-4000-8000-000000000007'
  ) then
    raise exception
      'Financial read RLS regression: same-shop owner cannot read payment receipt';
  end if;
end
$$;
reset role;

rollback;
