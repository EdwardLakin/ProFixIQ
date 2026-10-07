\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- ACL / function security: only service_role may execute the Early Access RPCs.
-- ---------------------------------------------------------------------------

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.issue_early_access_discount_grant_atomic(uuid,uuid,uuid,text,timestamptz,text,boolean,integer)',
    'public.attach_early_access_checkout_grant(uuid,text,text,text,text,uuid)',
    'public.bind_pending_early_access_discount_grant(uuid,uuid)',
    'public.rearm_expired_early_access_acquisition_intent(uuid,uuid,uuid,text,text,text,text,text,text)',
    'public.retire_early_access_acquisition_intent(uuid,text,uuid,text)'
  ] loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'early access runtime assertion failed: unsafe ACL on %', v_signature;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.early_access_discount_grant_bindings', 'SELECT')
     or has_table_privilege('authenticated', 'public.early_access_discount_grant_bindings', 'SELECT')
     or has_table_privilege('service_role', 'public.early_access_discount_grant_bindings', 'SELECT') then
    raise exception 'early access runtime assertion failed: bindings table must not be directly readable';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Synthetic operator, applicant, and shop owner
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'ea100000-0000-4000-8000-000000000001',
    'early-access-operator@example.com',
    '{"full_name":"Early Access Operator"}'::jsonb
  ),
  (
    'ea200000-0000-4000-8000-000000000002',
    'early-access-owner@example.com',
    '{"full_name":"Early Access Owner"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  (
    'ea100000-0000-4000-8000-000000000001',
    'ea100000-0000-4000-8000-000000000001',
    'owner',
    'Early Access Operator',
    'early-access-operator@example.com',
    null
  ),
  (
    'ea200000-0000-4000-8000-000000000002',
    'ea200000-0000-4000-8000-000000000002',
    'owner',
    'Early Access Owner',
    'early-access-owner@example.com',
    null
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    shop_id = excluded.shop_id;

insert into public.early_access_applications (
  id,
  full_name,
  email,
  company_name,
  product_package,
  operation_type,
  primary_challenge,
  offer_terms_version
)
values (
  'ea300000-0000-4000-8000-000000000003',
  'Early Access Owner',
  'Early-Access-Owner@Example.com',
  'Early Access Garage',
  'shop_operations',
  'automotive',
  'runtime fixture',
  'early-access-v1'
);

-- ---------------------------------------------------------------------------
-- Approval, reissue, and checkout attachment
-- ---------------------------------------------------------------------------

do $$
declare
  v_application uuid := 'ea300000-0000-4000-8000-000000000003';
  v_actor_auth uuid := 'ea100000-0000-4000-8000-000000000001';
  v_actor_profile uuid := 'ea100000-0000-4000-8000-000000000001';
  v_hash_a text := repeat('a', 64);
  v_hash_b text := repeat('b', 64);
  v_hash_c text := repeat('c', 64);
  v_ns_a text := repeat('1', 32);
  v_ns_b text := repeat('2', 32);
  v_grant uuid;
  v_reissued boolean;
  v_sqlstate text;
  v_count integer;
  v_status text;
  v_metadata jsonb;
  v_ok boolean;
begin
  -- Approval creates exactly one grant and flips the application atomically.
  select grant_id, reissued into v_grant, v_reissued
    from public.issue_early_access_discount_grant_atomic(
      v_application, v_actor_auth, v_actor_profile,
      v_hash_a, now() + interval '14 days', v_ns_a, false, 0
    );
  if v_grant is null or v_reissued then
    raise exception 'early access runtime assertion failed: approval did not issue a first grant';
  end if;

  select status into v_status from public.early_access_applications where id = v_application;
  if v_status <> 'approved' then
    raise exception 'early access runtime assertion failed: application not approved (%)', v_status;
  end if;

  select count(*) into v_count
    from public.billing_discount_grants g
   where g.metadata->>'application_id' = v_application::text;
  if v_count <> 1 then
    raise exception 'early access runtime assertion failed: expected one grant, found %', v_count;
  end if;

  select metadata into v_metadata from public.billing_discount_grants where id = v_grant;
  if v_metadata->>'approval_token_hash' <> v_hash_a
     or v_metadata->>'application_email' <> 'early-access-owner@example.com'
     or (v_metadata->>'token_reissue_count')::integer <> 0 then
    raise exception 'early access runtime assertion failed: grant metadata is wrong: %', v_metadata;
  end if;

  -- A second plain approval must be rejected and must not create another grant.
  begin
    perform 1 from public.issue_early_access_discount_grant_atomic(
      v_application, v_actor_auth, v_actor_profile,
      v_hash_b, now() + interval '14 days', v_ns_b, false, 0
    );
    raise exception 'early access runtime assertion failed: duplicate approval succeeded';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '55000' then
      raise;
    end if;
  end;

  select count(*) into v_count
    from public.billing_discount_grants g
   where g.metadata->>'application_id' = v_application::text;
  if v_count <> 1 then
    raise exception 'early access runtime assertion failed: duplicate approval created a grant';
  end if;

  -- Reissue with a stale expected count is a compare-and-swap failure.
  begin
    perform 1 from public.issue_early_access_discount_grant_atomic(
      v_application, v_actor_auth, v_actor_profile,
      v_hash_b, now() + interval '14 days', v_ns_b, true, 5
    );
    raise exception 'early access runtime assertion failed: stale reissue succeeded';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '40001' then
      raise;
    end if;
  end;

  -- Reissue works once the link has merely expired by timestamp, and the grant
  -- stays active so the application is never stranded.
  update public.billing_discount_grants
     set metadata = metadata || jsonb_build_object('approval_expires_at', now() - interval '1 day')
   where id = v_grant;

  select grant_id, reissued into v_grant, v_reissued
    from public.issue_early_access_discount_grant_atomic(
      v_application, v_actor_auth, v_actor_profile,
      v_hash_b, now() + interval '14 days', v_ns_b, true, 0
    );
  if not v_reissued then
    raise exception 'early access runtime assertion failed: reissue not reported';
  end if;

  select metadata into v_metadata from public.billing_discount_grants where id = v_grant;
  if v_metadata->>'approval_token_hash' <> v_hash_b
     or v_metadata->>'checkout_attempt_namespace' <> v_ns_b
     or (v_metadata->>'token_reissue_count')::integer <> 1 then
    raise exception 'early access runtime assertion failed: reissue did not rotate link: %', v_metadata;
  end if;

  -- Attach: wrong namespace is refused.
  select public.attach_early_access_checkout_grant(
    v_grant, v_ns_a, 'coupon_runtime', 'cus_eaowner1', 'cs_test_ea_1',
    'ea400000-0000-4000-8000-000000000004'
  ) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: stale namespace attach succeeded';
  end if;

  -- Attach: first checkout is recorded.
  select public.attach_early_access_checkout_grant(
    v_grant, v_ns_b, 'coupon_runtime', 'cus_eaowner1', 'cs_test_ea_1',
    'ea400000-0000-4000-8000-000000000004'
  ) into v_ok;
  if v_ok is distinct from true then
    raise exception 'early access runtime assertion failed: first attach failed';
  end if;

  -- Attach: re-attaching the same session is idempotent.
  select public.attach_early_access_checkout_grant(
    v_grant, v_ns_b, 'coupon_runtime', 'cus_eaowner1', 'cs_test_ea_1',
    'ea400000-0000-4000-8000-000000000004'
  ) into v_ok;
  if v_ok is distinct from true then
    raise exception 'early access runtime assertion failed: idempotent attach failed';
  end if;

  -- Attach: a different customer may never replace the stored one.
  select public.attach_early_access_checkout_grant(
    v_grant, v_ns_b, 'coupon_runtime', 'cus_eaother99', 'cs_test_ea_1',
    'ea400000-0000-4000-8000-000000000004'
  ) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: customer swap succeeded';
  end if;

  -- Attach: a different session is refused while the earlier intent is unknown.
  select public.attach_early_access_checkout_grant(
    v_grant, v_ns_b, 'coupon_runtime', 'cus_eaowner1', 'cs_test_ea_2',
    'ea400000-0000-4000-8000-000000000005'
  ) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: attach over unknown intent succeeded';
  end if;

  -- A reissue is refused while the attached checkout is still live.
  insert into private.stripe_acquisition_intents (
    id, request_key, nonce, plan_key, stripe_price_id, trial_days, status,
    stripe_checkout_session_id, expires_at
  ) values (
    'ea400000-0000-4000-8000-000000000004',
    'early-access:runtime:live',
    repeat('d', 64),
    'starter',
    'price_runtime1',
    7,
    'checkout_created',
    'cs_test_ea_1',
    now() + interval '12 hours'
  );

  begin
    perform 1 from public.issue_early_access_discount_grant_atomic(
      v_application, v_actor_auth, v_actor_profile,
      v_hash_c, now() + interval '14 days', repeat('3', 32), true, 1
    );
    raise exception 'early access runtime assertion failed: reissue over a live checkout succeeded';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '55000' then
      raise;
    end if;
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- Expired-intent retirement and re-arm for a verified completed checkout
-- ---------------------------------------------------------------------------

do $$
declare
  v_grant uuid;
  v_intent uuid := 'ea400000-0000-4000-8000-000000000004';
  v_session text := 'cs_test_ea_1';
  v_ns text := repeat('2', 32);
  v_nonce text := repeat('d', 64);
  v_owner uuid := 'ea200000-0000-4000-8000-000000000002';
  v_ok boolean;
  v_status text;
  v_expires timestamptz;
begin
  select g.id into v_grant
    from public.early_access_discount_grant_bindings b
    join public.billing_discount_grants g on g.id = b.grant_id
   where b.application_id = 'ea300000-0000-4000-8000-000000000003';

  -- Retire refuses a mismatched session.
  select public.retire_early_access_acquisition_intent(v_grant, v_ns, v_intent, 'cs_test_wrong')
    into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: retire accepted a foreign session';
  end if;

  -- Retire marks the exact attached intent expired.
  select public.retire_early_access_acquisition_intent(v_grant, v_ns, v_intent, v_session)
    into v_ok;
  select status into v_status from private.stripe_acquisition_intents where id = v_intent;
  if v_ok is distinct from true or v_status <> 'expired' then
    raise exception 'early access runtime assertion failed: retire did not expire intent (%)', v_status;
  end if;

  -- Re-arm refuses a different applicant email.
  select public.rearm_expired_early_access_acquisition_intent(
    v_grant, 'ea100000-0000-4000-8000-000000000001', v_intent, v_nonce, v_session,
    'cus_eaowner1', 'sub_eaowner1', 'price_runtime1', 'early-access-operator@example.com'
  ) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: rearm accepted another user';
  end if;

  -- Re-arm refuses a customer that is not the grant customer.
  select public.rearm_expired_early_access_acquisition_intent(
    v_grant, v_owner, v_intent, v_nonce, v_session,
    'cus_eaother99', 'sub_eaowner1', 'price_runtime1', 'early-access-owner@example.com'
  ) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: rearm accepted a foreign customer';
  end if;

  -- Re-arm refuses a wrong nonce.
  select public.rearm_expired_early_access_acquisition_intent(
    v_grant, v_owner, v_intent, repeat('e', 64), v_session,
    'cus_eaowner1', 'sub_eaowner1', 'price_runtime1', 'early-access-owner@example.com'
  ) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: rearm accepted a wrong nonce';
  end if;

  -- Re-arm succeeds for the verified identity and opens a short claim window.
  select public.rearm_expired_early_access_acquisition_intent(
    v_grant, v_owner, v_intent, v_nonce, v_session,
    'cus_eaowner1', 'sub_eaowner1', 'price_runtime1', 'early-access-owner@example.com'
  ) into v_ok;
  select status, expires_at into v_status, v_expires
    from private.stripe_acquisition_intents where id = v_intent;
  if v_ok is distinct from true
     or v_status <> 'completed'
     or v_expires <= now()
     or v_expires > now() + interval '1 hour' then
    raise exception 'early access runtime assertion failed: rearm result wrong (%, %, %)', v_ok, v_status, v_expires;
  end if;

  -- Once claimed, an intent can never be re-armed or retired.
  update private.stripe_acquisition_intents
     set status = 'claimed', claimed_user_id = v_owner, claimed_at = now()
   where id = v_intent;

  select public.rearm_expired_early_access_acquisition_intent(
    v_grant, v_owner, v_intent, v_nonce, v_session,
    'cus_eaowner1', 'sub_eaowner1', 'price_runtime1', 'early-access-owner@example.com'
  ) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: rearm touched a claimed intent';
  end if;

  select public.retire_early_access_acquisition_intent(v_grant, v_ns, v_intent, v_session)
    into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: retire touched a claimed intent';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Deferred shop binding after canonical owner bootstrap
-- ---------------------------------------------------------------------------

insert into public.shops (id, owner_id, business_name, name, user_limit)
values (
  'ea500000-0000-4000-8000-000000000005',
  'ea200000-0000-4000-8000-000000000002',
  'Early Access Garage',
  'Early Access Garage',
  3
)
on conflict (id) do nothing;

update public.profiles
   set shop_id = 'ea500000-0000-4000-8000-000000000005'
 where id = 'ea200000-0000-4000-8000-000000000002';

do $$
declare
  v_grant uuid;
  v_owner uuid := 'ea200000-0000-4000-8000-000000000002';
  v_shop uuid := 'ea500000-0000-4000-8000-000000000005';
  v_ok boolean;
  v_status text;
  v_shop_id uuid;
begin
  select g.id into v_grant
    from public.early_access_discount_grant_bindings b
    join public.billing_discount_grants g on g.id = b.grant_id
   where b.application_id = 'ea300000-0000-4000-8000-000000000003';

  -- Nothing pending yet: the adapter returns without binding anything.
  select public.bind_pending_early_access_discount_grant(v_owner, v_shop) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: bound a grant with no pending state';
  end if;

  -- The link route defers the grant until onboarding creates the shop.
  update public.billing_discount_grants
     set metadata = metadata || jsonb_build_object(
       'pending_user_id', v_owner,
       'subscription_id', 'sub_eaowner1',
       'checkout_session_id', 'cs_test_ea_1'
     )
   where id = v_grant;

  -- The shop does not carry the subscription yet: still no binding.
  select public.bind_pending_early_access_discount_grant(v_owner, v_shop) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: bound before shop billing identity existed';
  end if;

  update public.shops set stripe_subscription_id = 'sub_eaowner1' where id = v_shop;
  update public.profiles set stripe_subscription_id = 'sub_eaowner1' where id = v_owner;

  -- Another user can never bind the owner's pending grant.
  select public.bind_pending_early_access_discount_grant(
    'ea100000-0000-4000-8000-000000000001', v_shop
  ) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: wrong user bound the grant';
  end if;

  -- The owner's matching shop binds the grant exactly once.
  select public.bind_pending_early_access_discount_grant(v_owner, v_shop) into v_ok;
  select status, shop_id into v_status, v_shop_id
    from public.billing_discount_grants where id = v_grant;
  if v_ok is distinct from true or v_status <> 'redeemed' or v_shop_id is distinct from v_shop then
    raise exception 'early access runtime assertion failed: bind result wrong (%, %, %)', v_ok, v_status, v_shop_id;
  end if;

  select public.bind_pending_early_access_discount_grant(v_owner, v_shop) into v_ok;
  if v_ok is distinct from false then
    raise exception 'early access runtime assertion failed: grant bound twice';
  end if;
end
$$;

rollback;
