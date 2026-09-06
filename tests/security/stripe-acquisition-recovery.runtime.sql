\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- ACL / function security
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege(
    'anon',
    'public.recover_stranded_stripe_acquisition_identity(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.recover_stranded_stripe_acquisition_identity(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.recover_stranded_stripe_acquisition_identity(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'recovery runtime assertion failed: RPC ACL is unsafe';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Synthetic users / shops
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '71000000-0000-4000-8000-000000000001',
    'recovery-owner-a@example.com',
    '{"full_name":"Recovery Owner A"}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    'recovery-owner-b@example.com',
    '{"full_name":"Recovery Owner B"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (
  id,
  user_id,
  role,
  full_name,
  email,
  shop_id
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'owner',
    'Recovery Owner A',
    'recovery-owner-a@example.com',
    null
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    'owner',
    'Recovery Owner B',
    'recovery-owner-b@example.com',
    null
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    shop_id = excluded.shop_id;

insert into public.shops (
  id,
  owner_id,
  business_name,
  name,
  user_limit
)
values
  (
    'e7100000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Recovery Shop A',
    'Recovery Shop A',
    3
  ),
  (
    'e7200000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    'Recovery Shop B',
    'Recovery Shop B',
    3
  )
on conflict (id) do nothing;

-- Baseline shop creation can automatically link owner profiles.
update public.profiles
set shop_id = case id
  when '71000000-0000-4000-8000-000000000001'
    then 'e7100000-0000-4000-8000-000000000001'::uuid
  when '72000000-0000-4000-8000-000000000002'
    then 'e7200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
);

-- Give A the stale identity that recovery is intended to replace.
update public.profiles
set stripe_checkout_session_id = 'cs_test_recovery_old_a',
    stripe_customer_id = 'cus_recoveryolda',
    stripe_subscription_id = 'sub_recoveryolda'
where id = '71000000-0000-4000-8000-000000000001';

update public.shops
set stripe_checkout_session_id = 'cs_test_recovery_old_a',
    stripe_customer_id = 'cus_recoveryolda',
    stripe_subscription_id = 'sub_recoveryolda'
where id = 'e7100000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Runtime behavior
--
-- Fixture setup and behavioral assertions run as the test database role
-- because private.stripe_acquisition_intents intentionally grants no direct
-- table access to service_role. The ACL assertion above separately verifies
-- that only service_role, not anon/authenticated, can execute the recovery RPC.
-- ---------------------------------------------------------------------------

do $$
declare
  v_intent uuid := 'a7100000-0000-4000-8000-000000000001';
  v_nonce text := repeat('a', 64);
  v_recovered boolean;
  v_reason text;
  v_shop uuid;
  v_profile_session text;
  v_profile_customer text;
  v_profile_subscription text;
  v_shop_session text;
  v_shop_customer text;
  v_shop_subscription text;
  v_status text;
  v_claimed_user uuid;
  v_claimed_shop uuid;
begin

  -- -------------------------------------------------------------------------
  -- Pending intent must not be recoverable.
  -- -------------------------------------------------------------------------

  insert into private.stripe_acquisition_intents (
    id,
    request_key,
    nonce,
    plan_key,
    stripe_price_id,
    trial_days,
    status,
    stripe_checkout_session_id,
    stripe_customer_id,
    stripe_subscription_id,
    checkout_email,
    expires_at
  )
  values (
    v_intent,
    'acq:recovery-runtime-a',
    v_nonce,
    'pro',
    'price_recoverya',
    0,
    'checkout_created',
    'cs_test_recovery_new_a',
    null,
    null,
    null,
    now() + interval '24 hours'
  );

  select recovered, denial_reason
  into v_recovered, v_reason
  from public.recover_stranded_stripe_acquisition_identity(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    v_intent,
    v_nonce,
    'recovery-owner-a@example.com',
    'price_recoverya',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda'
  );

  if v_recovered or v_reason <> 'intent_identity_mismatch' then
    raise exception
      'recovery runtime assertion failed: incomplete checkout accepted (% / %)',
      v_recovered, v_reason;
  end if;

  -- Turn the fixture into an exact completed acquisition.
  update private.stripe_acquisition_intents
  set status = 'completed',
      stripe_customer_id = 'cus_recoverynewa',
      stripe_subscription_id = 'sub_recoverynewa',
      checkout_email = 'recovery-owner-a@example.com',
      stripe_completion_event_id = 'evt_recovery_runtime_a',
      stripe_completion_created_at = now(),
      -- Deliberately expired. Recovery must rely on fresh Stripe verification,
      -- not the original acquisition-intent TTL.
      expires_at = now() - interval '2 days',
      updated_at = now()
  where id = v_intent;

  -- -------------------------------------------------------------------------
  -- Wrong immutable Stripe identity must fail.
  -- -------------------------------------------------------------------------

  select recovered, denial_reason
  into v_recovered, v_reason
  from public.recover_stranded_stripe_acquisition_identity(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    v_intent,
    v_nonce,
    'recovery-owner-a@example.com',
    'price_wrongrecovery',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda'
  );

  if v_recovered or v_reason <> 'intent_identity_mismatch' then
    raise exception
      'recovery runtime assertion failed: mismatched Stripe identity accepted';
  end if;

  -- -------------------------------------------------------------------------
  -- Stale CAS snapshot must fail without changing canonical identity.
  -- -------------------------------------------------------------------------

  select recovered, denial_reason
  into v_recovered, v_reason
  from public.recover_stranded_stripe_acquisition_identity(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    v_intent,
    v_nonce,
    'recovery-owner-a@example.com',
    'price_recoverya',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_not_the_current_identity',
    'cus_recoveryolda',
    'sub_recoveryolda',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda'
  );

  if v_recovered or v_reason <> 'canonical_identity_changed' then
    raise exception
      'recovery runtime assertion failed: stale CAS snapshot accepted (% / %)',
      v_recovered, v_reason;
  end if;

  -- -------------------------------------------------------------------------
  -- Replacement identity owned by another profile/shop must fail.
  -- -------------------------------------------------------------------------

  update public.profiles
  set stripe_checkout_session_id = 'cs_test_recovery_new_a',
      stripe_customer_id = 'cus_recoverynewa',
      stripe_subscription_id = 'sub_recoverynewa'
  where id = '72000000-0000-4000-8000-000000000002';

  select recovered, denial_reason
  into v_recovered, v_reason
  from public.recover_stranded_stripe_acquisition_identity(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    v_intent,
    v_nonce,
    'recovery-owner-a@example.com',
    'price_recoverya',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda'
  );

  if v_recovered
     or v_reason <> 'replacement_identity_owned_by_other_profile' then
    raise exception
      'recovery runtime assertion failed: profile ownership collision accepted (% / %)',
      v_recovered, v_reason;
  end if;

  update public.profiles
  set stripe_checkout_session_id = null,
      stripe_customer_id = null,
      stripe_subscription_id = null
  where id = '72000000-0000-4000-8000-000000000002';

  update public.shops
  set stripe_checkout_session_id = 'cs_test_recovery_new_a',
      stripe_customer_id = 'cus_recoverynewa',
      stripe_subscription_id = 'sub_recoverynewa'
  where id = 'e7200000-0000-4000-8000-000000000002';

  select recovered, denial_reason
  into v_recovered, v_reason
  from public.recover_stranded_stripe_acquisition_identity(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    v_intent,
    v_nonce,
    'recovery-owner-a@example.com',
    'price_recoverya',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda'
  );

  if v_recovered
     or v_reason <> 'replacement_identity_owned_by_other_shop' then
    raise exception
      'recovery runtime assertion failed: shop ownership collision accepted (% / %)',
      v_recovered, v_reason;
  end if;

  update public.shops
  set stripe_checkout_session_id = null,
      stripe_customer_id = null,
      stripe_subscription_id = null
  where id = 'e7200000-0000-4000-8000-000000000002';

  -- -------------------------------------------------------------------------
  -- Exact valid recovery: expired completed acquisition is allowed.
  -- -------------------------------------------------------------------------

  select recovered, denial_reason, shop_id
  into v_recovered, v_reason, v_shop
  from public.recover_stranded_stripe_acquisition_identity(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    v_intent,
    v_nonce,
    'recovery-owner-a@example.com',
    'price_recoverya',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda',
    'cs_test_recovery_old_a',
    'cus_recoveryolda',
    'sub_recoveryolda'
  );

  if not v_recovered
     or v_reason is not null
     or v_shop <> 'e7100000-0000-4000-8000-000000000001'::uuid then
    raise exception
      'recovery runtime assertion failed: valid recovery rejected (% / % / %)',
      v_recovered, v_reason, v_shop;
  end if;

  select
    stripe_checkout_session_id,
    stripe_customer_id,
    stripe_subscription_id
  into
    v_profile_session,
    v_profile_customer,
    v_profile_subscription
  from public.profiles
  where id = '71000000-0000-4000-8000-000000000001';

  select
    stripe_checkout_session_id,
    stripe_customer_id,
    stripe_subscription_id
  into
    v_shop_session,
    v_shop_customer,
    v_shop_subscription
  from public.shops
  where id = 'e7100000-0000-4000-8000-000000000001';

  if v_profile_session <> 'cs_test_recovery_new_a'
     or v_profile_customer <> 'cus_recoverynewa'
     or v_profile_subscription <> 'sub_recoverynewa'
     or v_shop_session <> 'cs_test_recovery_new_a'
     or v_shop_customer <> 'cus_recoverynewa'
     or v_shop_subscription <> 'sub_recoverynewa' then
    raise exception
      'recovery runtime assertion failed: canonical Stripe identity was not swapped exactly';
  end if;

  select status, claimed_user_id, claimed_shop_id
  into v_status, v_claimed_user, v_claimed_shop
  from private.stripe_acquisition_intents
  where id = v_intent;

  if v_status <> 'claimed'
     or v_claimed_user <> '71000000-0000-4000-8000-000000000001'::uuid
     or v_claimed_shop <> 'e7100000-0000-4000-8000-000000000001'::uuid then
    raise exception
      'recovery runtime assertion failed: recovered intent was not consumed';
  end if;

  -- -------------------------------------------------------------------------
  -- Exact retry after the swap must be idempotent.
  -- -------------------------------------------------------------------------

  select recovered, denial_reason, shop_id
  into v_recovered, v_reason, v_shop
  from public.recover_stranded_stripe_acquisition_identity(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    v_intent,
    v_nonce,
    'recovery-owner-a@example.com',
    'price_recoverya',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa'
  );

  if not v_recovered
     or v_reason is not null
     or v_shop <> 'e7100000-0000-4000-8000-000000000001'::uuid then
    raise exception
      'recovery runtime assertion failed: exact retry was not idempotent';
  end if;

  -- -------------------------------------------------------------------------
  -- A claimed intent must NOT become a general-purpose relink mechanism.
  -- -------------------------------------------------------------------------

  update public.profiles
  set stripe_subscription_id = 'sub_changedafterrecovery'
  where id = '71000000-0000-4000-8000-000000000001';

  select recovered, denial_reason
  into v_recovered, v_reason
  from public.recover_stranded_stripe_acquisition_identity(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    v_intent,
    v_nonce,
    'recovery-owner-a@example.com',
    'price_recoverya',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_changedafterrecovery',
    'cs_test_recovery_new_a',
    'cus_recoverynewa',
    'sub_recoverynewa'
  );

  if v_recovered or v_reason <> 'intent_consumed' then
    raise exception
      'recovery runtime assertion failed: consumed intent replaced changed canonical state';
  end if;
end
$$;

rollback;
