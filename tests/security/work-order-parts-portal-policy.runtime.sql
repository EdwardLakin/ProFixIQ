\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'portal-policy-owner-a@example.com',
    '{"full_name":"Portal Policy Owner A"}'::jsonb
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    'portal-policy-owner-b@example.com',
    '{"full_name":"Portal Policy Owner B"}'::jsonb
  ),
  (
    '93000000-0000-4000-8000-000000000003',
    'portal-policy-customer-a@example.com',
    '{}'::jsonb
  ),
  (
    '94000000-0000-4000-8000-000000000004',
    'portal-policy-customer-b@example.com',
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'owner',
    'Portal Policy Owner A'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'owner',
    'Portal Policy Owner B'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

delete from public.profiles
where id in (
  '93000000-0000-4000-8000-000000000003',
  '94000000-0000-4000-8000-000000000004'
);

insert into public.shops (id, owner_id, business_name, name, plan, user_limit)
values
  (
    'a9100000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'Portal Policy Shop A',
    'Portal Policy Shop A',
    'complete_10',
    1
  ),
  (
    'b9200000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'Portal Policy Shop B',
    'Portal Policy Shop B',
    'complete_10',
    1
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '91000000-0000-4000-8000-000000000001'::uuid
    then 'a9100000-0000-4000-8000-000000000001'::uuid
  else 'b9200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002'
);

insert into public.customers (id, shop_id, user_id, name, email)
values
  (
    'ca100000-0000-4000-8000-000000000001',
    'a9100000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000003',
    'Portal Customer A',
    'portal-policy-customer-a@example.com'
  ),
  (
    'cb200000-0000-4000-8000-000000000002',
    'b9200000-0000-4000-8000-000000000002',
    '94000000-0000-4000-8000-000000000004',
    'Portal Customer B',
    'portal-policy-customer-b@example.com'
  )
on conflict (id) do update
set shop_id = excluded.shop_id,
    user_id = excluded.user_id,
    name = excluded.name,
    email = excluded.email;

insert into public.work_orders (id, shop_id, customer_id, status)
values
  (
    'ea100000-0000-4000-8000-000000000001',
    'a9100000-0000-4000-8000-000000000001',
    'ca100000-0000-4000-8000-000000000001',
    'open'
  ),
  (
    'eb200000-0000-4000-8000-000000000002',
    'b9200000-0000-4000-8000-000000000002',
    'cb200000-0000-4000-8000-000000000002',
    'open'
  )
on conflict (id) do update
set shop_id = excluded.shop_id,
    customer_id = excluded.customer_id,
    status = excluded.status;

insert into public.work_order_parts (id, shop_id, work_order_id, description_snapshot)
values
  (
    'fa100000-0000-4000-8000-000000000001',
    'a9100000-0000-4000-8000-000000000001',
    'ea100000-0000-4000-8000-000000000001',
    'Portal-visible part A'
  ),
  (
    'fb200000-0000-4000-8000-000000000002',
    'b9200000-0000-4000-8000-000000000002',
    'eb200000-0000-4000-8000-000000000002',
    'Other-shop part B'
  )
on conflict (id) do update
set shop_id = excluded.shop_id,
    work_order_id = excluded.work_order_id,
    description_snapshot = excluded.description_snapshot;

insert into public.customer_portal_invites (
  id,
  shop_id,
  customer_id,
  email,
  token,
  accepted_at,
  accepted_by_user_id,
  revoked_at
)
values
  (
    'da100000-0000-4000-8000-000000000001',
    'a9100000-0000-4000-8000-000000000001',
    'ca100000-0000-4000-8000-000000000001',
    'portal-policy-customer-a@example.com',
    'portal-policy-token-a',
    now(),
    '93000000-0000-4000-8000-000000000003',
    null
  ),
  (
    'db200000-0000-4000-8000-000000000002',
    'b9200000-0000-4000-8000-000000000002',
    'cb200000-0000-4000-8000-000000000002',
    'portal-policy-customer-b@example.com',
    'portal-policy-token-b',
    now(),
    '94000000-0000-4000-8000-000000000004',
    null
  )
on conflict (id) do update
set accepted_at = excluded.accepted_at,
    accepted_by_user_id = excluded.accepted_by_user_id,
    revoked_at = excluded.revoked_at;

do $portal_policy$
begin
  if exists (
    select 1
    from public.profiles
    where id in (
      '93000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000004'
    )
  ) then
    raise exception 'Portal policy fixture must not have staff profiles';
  end if;
end
$portal_policy$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $portal_policy$
declare
  visible_ids uuid[];
begin
  select array_agg(id order by id)
  into visible_ids
  from public.work_order_parts;

  if visible_ids is distinct from array[
    'fa100000-0000-4000-8000-000000000001'::uuid
  ] then
    raise exception 'Portal-only customer saw the wrong work-order parts: %', visible_ids;
  end if;
end
$portal_policy$;

reset role;
update public.customer_portal_invites
set revoked_at = now()
where id = 'da100000-0000-4000-8000-000000000001';

set local role authenticated;
do $portal_policy$
begin
  if exists (select 1 from public.work_order_parts) then
    raise exception 'Revoked portal invite still grants work-order part access';
  end if;
end
$portal_policy$;

reset role;
rollback;
