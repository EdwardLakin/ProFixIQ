\set ON_ERROR_STOP on

-- Regression for the demo-prospect shop isolation migration
-- (20261002151344_demo_prospect_shop_isolation.sql): every demo prospect
-- previously shared one single internal demo shop, with zero isolation
-- beyond this app's standard "any staff sees the whole shop" visibility --
-- two concurrent prospects could see each other's live work orders,
-- customers, and vehicles. createDemoProspect() now clones a fresh shop per
-- prospect instead. This test proves the isolation claim empirically
-- (not just by reading the application code): two prospect shops, each
-- with their own fixture data, queried as each prospect's own authenticated
-- role, must never see the other's data -- using the exact same shop_id
-- RLS every other tenant in this app already relies on (no new RLS was
-- added for this feature).
--
-- Also covers the new shops.demo_prospect_profile_id unique partial index:
-- a profile can own at most one prospect shop.

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'd5150000-0000-4000-8000-00000000a001',
    'demo-prospect-isolation-a@example.test',
    '{"full_name":"Demo Prospect A"}'::jsonb
  ),
  (
    'd5150000-0000-4000-8000-00000000b001',
    'demo-prospect-isolation-b@example.test',
    '{"full_name":"Demo Prospect B"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id, demo_access_expires_at)
values
  (
    'd5150000-0000-4000-8000-00000000a001',
    'd5150000-0000-4000-8000-00000000a001',
    'owner', 'Demo Prospect A',
    'demo-prospect-isolation-a@example.test', null,
    now() + interval '7 days'
  ),
  (
    'd5150000-0000-4000-8000-00000000b001',
    'd5150000-0000-4000-8000-00000000b001',
    'owner', 'Demo Prospect B',
    'demo-prospect-isolation-b@example.test', null,
    now() + interval '7 days'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    demo_access_expires_at = excluded.demo_access_expires_at;

-- Prospect A's own cloned shop.
insert into public.shops (id, owner_id, business_name, name, plan, billing_entitlement_override)
values (
  'd5151000-0000-4000-8000-00000000a000',
  'd5150000-0000-4000-8000-00000000a001',
  'Demo Prospect Shop A Runtime',
  'Demo Prospect Shop A Runtime',
  'starter',
  'internal_demo'
)
on conflict (id) do update
set billing_entitlement_override = 'internal_demo';

-- Prospect B's own cloned shop.
insert into public.shops (id, owner_id, business_name, name, plan, billing_entitlement_override)
values (
  'd5151000-0000-4000-8000-00000000b000',
  'd5150000-0000-4000-8000-00000000b001',
  'Demo Prospect Shop B Runtime',
  'Demo Prospect Shop B Runtime',
  'starter',
  'internal_demo'
)
on conflict (id) do update
set billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = 'd5151000-0000-4000-8000-00000000a000'
where id = 'd5150000-0000-4000-8000-00000000a001';

update public.profiles
set shop_id = 'd5151000-0000-4000-8000-00000000b000'
where id = 'd5150000-0000-4000-8000-00000000b001';

update public.shops
set demo_prospect_profile_id = 'd5150000-0000-4000-8000-00000000a001'
where id = 'd5151000-0000-4000-8000-00000000a000';

update public.shops
set demo_prospect_profile_id = 'd5150000-0000-4000-8000-00000000b001'
where id = 'd5151000-0000-4000-8000-00000000b000';

-- Fixture-style data in each prospect's own shop, as seedDemoShopFixtures()
-- would create it.
insert into public.customers (id, shop_id, name, email)
values
  (
    'd5152000-0000-4000-8000-00000000a000',
    'd5151000-0000-4000-8000-00000000a000',
    'Prospect A Customer',
    'customer-a@example.test'
  ),
  (
    'd5152000-0000-4000-8000-00000000b000',
    'd5151000-0000-4000-8000-00000000b000',
    'Prospect B Customer',
    'customer-b@example.test'
  )
on conflict (id) do update set shop_id = excluded.shop_id;

insert into public.work_orders (id, shop_id, custom_id, status, record_type, user_id)
values
  (
    'd5153000-0000-4000-8000-00000000a000',
    'd5151000-0000-4000-8000-00000000a000',
    'DEMO-PROSPECT-A-WO',
    'new',
    'work_order',
    'd5150000-0000-4000-8000-00000000a001'
  ),
  (
    'd5153000-0000-4000-8000-00000000b000',
    'd5151000-0000-4000-8000-00000000b000',
    'DEMO-PROSPECT-B-WO',
    'new',
    'work_order',
    'd5150000-0000-4000-8000-00000000b001'
  )
on conflict (id) do update set shop_id = excluded.shop_id;

-- Query as Prospect A: must see exactly their own customer/work order, and
-- never Prospect B's, despite both shops being billing_entitlement_override
-- = 'internal_demo' and both profiles having role = 'owner'.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd5150000-0000-4000-8000-00000000a001', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d5150000-0000-4000-8000-00000000a001"}',
  true
);
set local role authenticated;

do $demo_prospect_isolation_check$
declare
  v_own_customer_count integer;
  v_other_customer_count integer;
  v_own_wo_count integer;
  v_other_wo_count integer;
begin
  select count(*) into v_own_customer_count
  from public.customers
  where id = 'd5152000-0000-4000-8000-00000000a000';

  select count(*) into v_other_customer_count
  from public.customers
  where id = 'd5152000-0000-4000-8000-00000000b000';

  select count(*) into v_own_wo_count
  from public.work_orders
  where id = 'd5153000-0000-4000-8000-00000000a000';

  select count(*) into v_other_wo_count
  from public.work_orders
  where id = 'd5153000-0000-4000-8000-00000000b000';

  if v_own_customer_count <> 1 then
    raise exception
      'PXQ10: Prospect A could not see their own cloned shop''s customer (count=%).',
      v_own_customer_count;
  end if;

  if v_other_customer_count <> 0 then
    raise exception
      'PXQ11: Regression -- Prospect A could see Prospect B''s customer (count=%). Per-prospect shop isolation is broken.',
      v_other_customer_count;
  end if;

  if v_own_wo_count <> 1 then
    raise exception
      'PXQ12: Prospect A could not see their own cloned shop''s work order (count=%).',
      v_own_wo_count;
  end if;

  if v_other_wo_count <> 0 then
    raise exception
      'PXQ13: Regression -- Prospect A could see Prospect B''s work order (count=%). Per-prospect shop isolation is broken.',
      v_other_wo_count;
  end if;
end;
$demo_prospect_isolation_check$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- A profile may own at most one prospect shop: a second shop pointed at the
-- same demo_prospect_profile_id must be rejected by the unique partial
-- index added in 20261002151344_demo_prospect_shop_isolation.sql.
do $demo_prospect_profile_uniqueness$
begin
  insert into public.shops (
    id, owner_id, business_name, name, plan,
    billing_entitlement_override, demo_prospect_profile_id
  )
  values (
    'd5151000-0000-4000-8000-00000000a999',
    'd5150000-0000-4000-8000-00000000a001',
    'Duplicate Prospect Shop Runtime',
    'Duplicate Prospect Shop Runtime',
    'starter',
    'internal_demo',
    'd5150000-0000-4000-8000-00000000a001'
  );

  raise exception
    'PXQ14: Regression -- a second shop with the same demo_prospect_profile_id was accepted; the unique partial index is missing or broken.'
    using errcode = 'PXQ14';
exception
  when unique_violation then
    -- Expected.
    null;
end;
$demo_prospect_profile_uniqueness$;

rollback;
