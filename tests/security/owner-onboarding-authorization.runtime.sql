\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '82410000-0000-4000-8000-000000000001',
  'owner-bootstrap-runtime@example.test',
  '{"full_name":"Owner Bootstrap Runtime"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (
  id,
  user_id,
  full_name,
  stripe_checkout_complete,
  stripe_checkout_session_id,
  stripe_customer_id,
  stripe_subscription_id,
  completed_onboarding
)
values (
  '82410000-0000-4000-8000-000000000001',
  '82410000-0000-4000-8000-000000000001',
  'Owner Bootstrap Runtime',
  true,
  'cs_owner_bootstrap_runtime',
  'cus_owner_bootstrap_runtime',
  'sub_owner_bootstrap_runtime',
  false
)
on conflict (id) do update
set user_id = excluded.user_id,
    full_name = excluded.full_name,
    shop_id = null,
    role = null,
    stripe_checkout_complete = excluded.stripe_checkout_complete,
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    completed_onboarding = false;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82410000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $assert_canonical_owner_bootstrap$
declare
  v_shop_id uuid;
  v_created_shop boolean;
begin
  select result.shop_id, result.created_shop
    into v_shop_id, v_created_shop
  from public.bootstrap_owner_atomic(
    'Owner Bootstrap Runtime',
    'Owner Bootstrap Runtime',
    '219 Runtime Close SE',
    'Calgary',
    'Alberta',
    'T3M0B5',
    'CA',
    'America/Edmonton',
    'profixiq-owner-bootstrap-pending-v2:runtime-owner-pin-hash'
  ) result;

  if v_shop_id is null or not v_created_shop then
    raise exception 'Canonical owner bootstrap did not create one shop';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = '82410000-0000-4000-8000-000000000001'
      and profile.shop_id = v_shop_id
      and profile.role = 'owner'
      and not coalesce(profile.completed_onboarding, false)
  ) then
    raise exception 'Canonical owner bootstrap did not persist the pending owner profile';
  end if;

  if not exists (
    select 1
    from public.shops shop
    where shop.id = v_shop_id
      and shop.owner_id = '82410000-0000-4000-8000-000000000001'
      and shop.owner_pin_hash = 'runtime-owner-pin-hash'
      and shop.owner_pin is null
      and shop.pin is null
  ) then
    raise exception 'Canonical owner bootstrap did not persist the secured shop';
  end if;

  if not exists (
    select 1
    from public.shop_members member
    where member.shop_id = v_shop_id
      and member.user_id = '82410000-0000-4000-8000-000000000001'
      and member.role = 'owner'
  ) then
    raise exception 'Canonical owner bootstrap did not persist owner membership';
  end if;
end;
$assert_canonical_owner_bootstrap$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

do $assert_bootstrap_authorization_cleanup$
begin
  if exists (
    select 1
    from private.owner_bootstrap_authorizations
    where actor_user_id = '82410000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Canonical owner bootstrap left reusable authorization context';
  end if;
end;
$assert_bootstrap_authorization_cleanup$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '82410000-0000-4000-8000-000000000002',
  'direct-shop-insert-runtime@example.test',
  '{"full_name":"Direct Shop Insert Runtime"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (
  id,
  user_id,
  full_name,
  completed_onboarding
)
values (
  '82410000-0000-4000-8000-000000000002',
  '82410000-0000-4000-8000-000000000002',
  'Direct Shop Insert Runtime',
  false
)
on conflict (id) do update
set user_id = excluded.user_id,
    full_name = excluded.full_name,
    shop_id = null,
    role = null,
    completed_onboarding = false;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82410000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

-- A caller-controlled custom GUC is not proof that the SECURITY DEFINER RPC
-- completed its eligibility checks. This reproduces the forged-marker path
-- called out during review before attempting the direct shop insert.
select set_config(
  'profixiq.owner_bootstrap_actor_id',
  '82410000-0000-4000-8000-000000000002',
  true
);

do $reject_direct_first_shop_insert$
begin
  begin
    insert into public.shops (
      owner_id,
      created_by,
      business_name,
      shop_name,
      name,
      street,
      address,
      city,
      province,
      postal_code,
      country,
      timezone,
      owner_pin_hash
    )
    values (
      '82410000-0000-4000-8000-000000000002',
      '82410000-0000-4000-8000-000000000002',
      'Forbidden Direct Shop',
      'Forbidden Direct Shop',
      'Forbidden Direct Shop',
      '1 Direct Way',
      '1 Direct Way',
      'Calgary',
      'Alberta',
      'T0T0T0',
      'CA',
      'America/Edmonton',
      'untrusted-direct-hash'
    );

    raise exception 'Direct first-shop insert unexpectedly succeeded';
  exception
    when insufficient_privilege then
      -- Production's SECURITY DEFINER upsert reaches the profile guard, while
      -- clean replay's legacy invoker trigger is denied by the profile table
      -- privilege first. Both are SQLSTATE 42501 and both must roll the shop
      -- insert back without changing profile authorization.
      null;
  end;

  if exists (
    select 1
    from public.profiles profile
    where profile.id = '82410000-0000-4000-8000-000000000002'
      and (profile.shop_id is not null or profile.role is not null)
  ) then
    raise exception 'Rejected direct shop insert changed profile authorization';
  end if;

  if exists (
    select 1
    from public.shops shop
    where shop.owner_id = '82410000-0000-4000-8000-000000000002'
      and shop.business_name = 'Forbidden Direct Shop'
  ) then
    raise exception 'Rejected direct shop insert left a shop behind';
  end if;
end;
$reject_direct_first_shop_insert$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

do $assert_owner_bootstrap_acl$
declare
  v_untrusted_role text;
begin
  if has_function_privilege(
    'anon',
    'public.bootstrap_owner_atomic(text,text,text,text,text,text,text,text,text)',
    'execute'
  ) then
    raise exception 'Anonymous role can execute owner bootstrap';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.bootstrap_owner_atomic(text,text,text,text,text,text,text,text,text)',
    'execute'
  ) then
    raise exception 'Authenticated role cannot execute owner bootstrap';
  end if;

  foreach v_untrusted_role in array array['anon', 'authenticated', 'service_role']
  loop
    if has_table_privilege(
      v_untrusted_role,
      'private.owner_bootstrap_authorizations',
      'select'
    ) or has_table_privilege(
      v_untrusted_role,
      'private.owner_bootstrap_authorizations',
      'insert'
    ) or has_table_privilege(
      v_untrusted_role,
      'private.owner_bootstrap_authorizations',
      'update'
    ) or has_table_privilege(
      v_untrusted_role,
      'private.owner_bootstrap_authorizations',
      'delete'
    ) then
      raise exception '% role can forge owner bootstrap authorization',
        v_untrusted_role;
    end if;
  end loop;
end;
$assert_owner_bootstrap_acl$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

rollback;
