\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('bb300000-0000-4000-8000-000000000001', 'portal-access-owner@example.com', '{"full_name":"Portal Access Owner"}'::jsonb),
  ('bb300000-0000-4000-8000-000000000002', 'portal-access-advisor@example.com', '{"full_name":"Portal Access Advisor"}'::jsonb),
  ('bb300000-0000-4000-8000-000000000003', 'portal-access-alice@example.com', '{}'::jsonb),
  ('bb300000-0000-4000-8000-000000000004', 'portal-access-bob@example.com', '{}'::jsonb),
  ('bb300000-0000-4000-8000-000000000005', 'portal-access-carol@example.com', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.shops (id, owner_id, name)
values ('bb300000-0000-4000-8000-00000000000a', 'bb300000-0000-4000-8000-000000000001', 'Portal Access Shop')
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'bb300000-0000-4000-8000-000000000002',
  'bb300000-0000-4000-8000-000000000002',
  'advisor',
  'Portal Access Advisor',
  'portal-access-advisor@example.com',
  'bb300000-0000-4000-8000-00000000000a'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    shop_id = excluded.shop_id;

-- Three pure portal customers: none of them has a `profiles` row.
insert into public.customers (id, user_id, shop_id, first_name, email)
values
  ('bb300000-0000-4000-8000-000000000011', 'bb300000-0000-4000-8000-000000000003', 'bb300000-0000-4000-8000-00000000000a', 'Alice', 'portal-access-alice@example.com'),
  ('bb300000-0000-4000-8000-000000000012', 'bb300000-0000-4000-8000-000000000004', 'bb300000-0000-4000-8000-00000000000a', 'Bob', 'portal-access-bob@example.com'),
  ('bb300000-0000-4000-8000-000000000013', 'bb300000-0000-4000-8000-000000000005', 'bb300000-0000-4000-8000-00000000000a', 'Carol', 'portal-access-carol@example.com')
on conflict (id) do nothing;

insert into public.customer_portal_invites
  (id, customer_id, shop_id, email, token, accepted_at, accepted_by_user_id, revoked_at)
values
  ('bb300000-0000-4000-8000-000000000021', 'bb300000-0000-4000-8000-000000000011', 'bb300000-0000-4000-8000-00000000000a', 'portal-access-alice@example.com', gen_random_uuid(), now(), 'bb300000-0000-4000-8000-000000000003', null),
  ('bb300000-0000-4000-8000-000000000022', 'bb300000-0000-4000-8000-000000000012', 'bb300000-0000-4000-8000-00000000000a', 'portal-access-bob@example.com', gen_random_uuid(), now(), 'bb300000-0000-4000-8000-000000000004', null),
  ('bb300000-0000-4000-8000-000000000023', 'bb300000-0000-4000-8000-000000000013', 'bb300000-0000-4000-8000-00000000000a', 'portal-access-carol@example.com', gen_random_uuid(), now(), 'bb300000-0000-4000-8000-000000000005', now())
on conflict (id) do nothing;

-- Alice: the canonical portal guard's two reads must both succeed, and must
-- expose nothing beyond her own records.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'bb300000-0000-4000-8000-000000000003', true);
set local role authenticated;

do $portal_access_alice$
declare
  v_customers integer;
  v_invites integer;
  v_foreign integer;
begin
  select count(*) into v_customers
  from public.customers c
  where c.user_id = 'bb300000-0000-4000-8000-000000000003';
  if v_customers <> 1 then
    raise exception 'Portal customer cannot read their own customer row (got %)', v_customers;
  end if;

  select count(*) into v_foreign
  from public.customers c
  where c.id in (
    'bb300000-0000-4000-8000-000000000012',
    'bb300000-0000-4000-8000-000000000013'
  );
  if v_foreign <> 0 then
    raise exception 'Portal customer can read another customer record (got %)', v_foreign;
  end if;

  select count(*) into v_invites
  from public.customer_portal_invites i
  where i.customer_id = 'bb300000-0000-4000-8000-000000000011'
    and i.accepted_by_user_id = 'bb300000-0000-4000-8000-000000000003'
    and i.accepted_at is not null
    and i.revoked_at is null;
  if v_invites <> 1 then
    raise exception 'Portal customer cannot read their own accepted invite (got %)', v_invites;
  end if;

  select count(*) into v_foreign from public.customer_portal_invites i
  where i.accepted_by_user_id <> 'bb300000-0000-4000-8000-000000000003';
  if v_foreign <> 0 then
    raise exception 'Portal customer can read another customer invite (got %)', v_foreign;
  end if;
end;
$portal_access_alice$;

-- Carol's invite is revoked. Revocation must remove invite evidence at the RLS
-- boundary, not merely through an application filter.
reset role;
select set_config('request.jwt.claim.sub', 'bb300000-0000-4000-8000-000000000005', true);
set local role authenticated;

do $portal_access_revoked$
declare
  v_invites integer;
begin
  select count(*) into v_invites from public.customer_portal_invites;
  if v_invites <> 0 then
    raise exception 'A revoked portal customer still reads invite evidence (got %)', v_invites;
  end if;
end;
$portal_access_revoked$;

-- Staff visibility must be unchanged by the additive portal policies.
reset role;
select set_config('request.jwt.claim.sub', 'bb300000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $portal_access_staff$
declare
  v_customers integer;
begin
  select count(*) into v_customers
  from public.customers c
  where c.shop_id = 'bb300000-0000-4000-8000-00000000000a';
  if v_customers < 3 then
    raise exception 'Staff lost shop-scoped customer visibility (got %)', v_customers;
  end if;
end;
$portal_access_staff$;

reset role;

do $portal_access_privileges$
begin
  -- The invite token is a bearer credential and must never reach the browser.
  if has_column_privilege('authenticated', 'public.customer_portal_invites', 'token', 'SELECT') then
    raise exception 'Authenticated callers can read the portal invite token';
  end if;

  if not has_column_privilege('authenticated', 'public.customer_portal_invites', 'accepted_at', 'SELECT') then
    raise exception 'Authenticated callers lost the invite lifecycle columns the portal guard reads';
  end if;

  -- Invite acceptance runs through a SECURITY DEFINER RPC keyed by invite id,
  -- so anon needs no table access at all.
  if has_table_privilege('anon', 'public.customer_portal_invites', 'SELECT')
     or has_table_privilege('anon', 'public.customer_portal_invites', 'INSERT')
     or has_table_privilege('anon', 'public.customer_portal_invites', 'UPDATE')
     or has_table_privilege('anon', 'public.customer_portal_invites', 'DELETE')
  then
    raise exception 'Anonymous callers retain privileges on customer_portal_invites';
  end if;
end;
$portal_access_privileges$;

rollback;

select 'portal_customer_self_access_ok' as result;
