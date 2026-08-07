\set ON_ERROR_STOP on

begin;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.begin_stripe_acquisition_intent(text,text,text,text,integer,boolean)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.begin_stripe_acquisition_intent(text,text,text,text,integer,boolean)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.begin_stripe_acquisition_intent(text,text,text,text,integer,boolean)',
    'EXECUTE'
  ) then
    raise exception 'P0-006 runtime assertion failed: begin intent ACL is unsafe';
  end if;

  if has_function_privilege(
    'anon',
    'public.claim_stripe_acquisition_intent(uuid,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.claim_stripe_acquisition_intent(uuid,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.claim_stripe_acquisition_intent(uuid,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'P0-006 runtime assertion failed: claim intent ACL is unsafe';
  end if;

  if has_table_privilege('anon', 'private.stripe_acquisition_intents', 'SELECT')
     or has_table_privilege('authenticated', 'private.stripe_acquisition_intents', 'SELECT')
     or has_table_privilege('service_role', 'private.stripe_acquisition_intents', 'SELECT') then
    raise exception 'P0-006 runtime assertion failed: private acquisition intents are exposed';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '66000000-0000-4000-8000-000000000001',
    'p0-006-owner-a@example.com',
    '{"full_name":"P0-006 Owner A"}'::jsonb
  ),
  (
    '67000000-0000-4000-8000-000000000002',
    'p0-006-owner-b@example.com',
    '{"full_name":"P0-006 Owner B"}'::jsonb
  ),
  (
    '68000000-0000-4000-8000-000000000003',
    'p0-006-mechanic@example.com',
    '{"full_name":"P0-006 Mechanic"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, shop_id)
values
  (
    '66000000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000001',
    'owner',
    'P0-006 Owner A',
    null
  ),
  (
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000002',
    'owner',
    'P0-006 Owner B',
    null
  ),
  (
    '68000000-0000-4000-8000-000000000003',
    '68000000-0000-4000-8000-000000000003',
    'mechanic',
    'P0-006 Mechanic',
    null
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    shop_id = excluded.shop_id;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  (
    'c6100000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000001',
    'P0-006 Shop A',
    'P0-006 Shop A',
    3
  ),
  (
    'd6200000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000002',
    'P0-006 Shop B',
    'P0-006 Shop B',
    3
  )
on conflict (id) do nothing;

-- The baseline shop trigger immediately links owner profiles to newly inserted
-- shops. Restore the acquisition fixtures to their intended pre-onboarding
-- state before exercising the claim path.
update public.profiles
set shop_id = null
where id in (
  '66000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-000000000002'
);

update public.profiles
set shop_id = 'd6200000-0000-4000-8000-000000000002'
where id = '68000000-0000-4000-8000-000000000003';

set local role service_role;

do $$
declare
  v_intent_a uuid;
  v_nonce_a text;
  v_retry_intent uuid;
  v_retry_nonce text;
  v_claimed boolean;
  v_reason text;
  v_shop uuid;
  v_ok boolean;
  v_intent_b uuid;
  v_nonce_b text;
  v_intent_c uuid;
  v_nonce_c text;
begin
  select intent_id, intent_nonce
  into v_intent_a, v_nonce_a
  from public.begin_stripe_acquisition_intent(
    'acq:p0-006-owner-a',
    repeat('a', 64),
    'pro',
    'price_p0006pro',
    14,
    true
  );

  select intent_id, intent_nonce
  into v_retry_intent, v_retry_nonce
  from public.begin_stripe_acquisition_intent(
    'acq:p0-006-owner-a',
    repeat('f', 64),
    'pro',
    'price_p0006pro',
    14,
    true
  );
  if v_retry_intent <> v_intent_a or v_retry_nonce <> v_nonce_a then
    raise exception 'P0-006 runtime assertion failed: repeated checkout did not reuse its intent';
  end if;

  select public.attach_stripe_acquisition_checkout(
    v_intent_a,
    v_nonce_a,
    'cs_test_p0006_owner_a'
  ) into v_ok;
  if not v_ok then
    raise exception 'P0-006 runtime assertion failed: valid checkout attachment failed';
  end if;

  select public.record_stripe_acquisition_completion(
    v_intent_a,
    v_nonce_a,
    'cs_test_p0006_owner_a',
    'cus_p0006ownera',
    'sub_p0006ownera',
    'price_p0006pro',
    'p0-006-owner-a@example.com',
    'evt_p0006_a',
    now()
  ) into v_ok;
  if not v_ok then
    raise exception 'P0-006 runtime assertion failed: valid completion was rejected';
  end if;

  select claimed, denial_reason
  into v_claimed, v_reason
  from public.claim_stripe_acquisition_intent(
    v_intent_a,
    v_nonce_a,
    'cs_test_p0006_owner_a',
    'cus_p0006ownera',
    'sub_p0006ownera',
    'price_p0006pro',
    'attacker@example.com',
    '66000000-0000-4000-8000-000000000001'
  );
  if v_claimed or v_reason <> 'email_mismatch' then
    raise exception 'P0-006 runtime assertion failed: forged checkout email was accepted';
  end if;

  select claimed, denial_reason, shop_id
  into v_claimed, v_reason, v_shop
  from public.claim_stripe_acquisition_intent(
    v_intent_a,
    v_nonce_a,
    'cs_test_p0006_owner_a',
    'cus_p0006ownera',
    'sub_p0006ownera',
    'price_p0006pro',
    'p0-006-owner-a@example.com',
    '66000000-0000-4000-8000-000000000001'
  );
  if not v_claimed or v_reason is not null or v_shop is not null then
    raise exception 'P0-006 runtime assertion failed: valid pre-shop claim failed';
  end if;

  select claimed, denial_reason
  into v_claimed, v_reason
  from public.claim_stripe_acquisition_intent(
    v_intent_a,
    v_nonce_a,
    'cs_test_p0006_owner_a',
    'cus_p0006ownera',
    'sub_p0006ownera',
    'price_p0006pro',
    'p0-006-owner-a@example.com',
    '66000000-0000-4000-8000-000000000001'
  );
  if not v_claimed or v_reason <> 'already_claimed' then
    raise exception 'P0-006 runtime assertion failed: same-user retry was not idempotent';
  end if;

  select public.record_stripe_acquisition_completion(
    v_intent_a,
    v_nonce_a,
    'cs_test_p0006_owner_a',
    'cus_p0006ownera',
    'sub_p0006ownera',
    'price_p0006pro',
    'p0-006-owner-a@example.com',
    'evt_p0006_a_duplicate',
    now() - interval '1 minute'
  ) into v_ok;
  if not v_ok then
    raise exception 'P0-006 runtime assertion failed: duplicate/out-of-order webhook was not idempotent';
  end if;

  select intent_id, intent_nonce
  into v_intent_b, v_nonce_b
  from public.begin_stripe_acquisition_intent(
    'acq:p0-006-owner-b',
    repeat('b', 64),
    'starter',
    'price_p0006starter',
    14,
    false
  );
  perform public.attach_stripe_acquisition_checkout(v_intent_b, v_nonce_b, 'cs_test_p0006_owner_b');

  select claimed
  into v_claimed
  from public.claim_stripe_acquisition_intent(
    v_intent_b,
    v_nonce_b,
    'cs_test_p0006_owner_b',
    'cus_p0006ownerb',
    'sub_p0006ownerb',
    'price_p0006starter',
    'p0-006-owner-b@example.com',
    '67000000-0000-4000-8000-000000000002'
  );
  if not v_claimed then
    raise exception 'P0-006 runtime assertion failed: second valid claim failed';
  end if;

  select claimed, denial_reason
  into v_claimed, v_reason
  from public.claim_stripe_acquisition_intent(
    v_intent_b,
    v_nonce_b,
    'cs_test_p0006_owner_b',
    'cus_p0006ownerb',
    'sub_p0006ownerb',
    'price_p0006starter',
    'p0-006-owner-a@example.com',
    '66000000-0000-4000-8000-000000000001'
  );
  if v_claimed or v_reason <> 'intent_consumed' then
    raise exception 'P0-006 runtime assertion failed: consumed intent was claimable by another user';
  end if;

  select intent_id, intent_nonce
  into v_intent_c, v_nonce_c
  from public.begin_stripe_acquisition_intent(
    'acq:p0-006-mechanic',
    repeat('c', 64),
    'starter',
    'price_p0006starter',
    14,
    false
  );
  perform public.attach_stripe_acquisition_checkout(v_intent_c, v_nonce_c, 'cs_test_p0006_mechanic');

  select claimed, denial_reason
  into v_claimed, v_reason
  from public.claim_stripe_acquisition_intent(
    v_intent_c,
    v_nonce_c,
    'cs_test_p0006_mechanic',
    'cus_p0006mechanic',
    'sub_p0006mechanic',
    'price_p0006starter',
    'p0-006-mechanic@example.com',
    '68000000-0000-4000-8000-000000000003'
  );
  if v_claimed or v_reason <> 'billing_role_required' then
    raise exception 'P0-006 runtime assertion failed: non-billing shop role claimed checkout';
  end if;

  begin
    perform public.begin_stripe_acquisition_intent(
      'acq:p0-006-invalid-trial', repeat('d', 64), 'starter', 'price_p0006starter', 61, false
    );
    raise exception 'P0-006 runtime assertion failed: disallowed trial was accepted';
  exception
    when invalid_parameter_value then null;
  end;
end
$$;

reset role;

update public.profiles
set shop_id = 'c6100000-0000-4000-8000-000000000001',
    role = 'owner'
where id = '66000000-0000-4000-8000-000000000001';

do $$
declare
  v_shop public.shops%rowtype;
  v_claimed_shop uuid;
begin
  select * into v_shop
  from public.shops
  where id = 'c6100000-0000-4000-8000-000000000001';

  if v_shop.stripe_checkout_session_id <> 'cs_test_p0006_owner_a'
     or v_shop.stripe_customer_id <> 'cus_p0006ownera'
     or v_shop.stripe_subscription_id <> 'sub_p0006ownera' then
    raise exception 'P0-006 runtime assertion failed: claimed billing did not follow verified shop assignment';
  end if;

  select claimed_shop_id into v_claimed_shop
  from private.stripe_acquisition_intents
  where request_key = 'acq:p0-006-owner-a';
  if v_claimed_shop <> 'c6100000-0000-4000-8000-000000000001'::uuid then
    raise exception 'P0-006 runtime assertion failed: claimed intent did not record assigned shop';
  end if;
end
$$;

set local role authenticated;
set local request.jwt.claim.sub = '66000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    update public.profiles
    set stripe_customer_id = 'cus_attacker'
    where id = '66000000-0000-4000-8000-000000000001';
    raise exception 'P0-006 runtime assertion failed: client profile billing write was accepted';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.shops
    set stripe_subscription_id = 'sub_attacker'
    where id = 'c6100000-0000-4000-8000-000000000001';
    raise exception 'P0-006 runtime assertion failed: client shop billing write was accepted';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;

rollback;
