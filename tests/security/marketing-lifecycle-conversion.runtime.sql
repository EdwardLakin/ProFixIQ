\set ON_ERROR_STOP on

begin;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.record_marketing_signup_completed(uuid,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.record_marketing_signup_completed(uuid,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.record_marketing_signup_completed(uuid,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'anon',
    'public.record_marketing_onboarding_completed(uuid,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.record_marketing_onboarding_completed(uuid,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.record_marketing_onboarding_completed(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'marketing lifecycle runtime assertion failed: RPC ACL is unsafe';
  end if;
end
$$;

insert into auth.users (id, email, created_at, raw_user_meta_data)
values
  (
    '8a100000-0000-4000-8000-000000000001',
    'lifecycle-new@example.com',
    now(),
    '{"full_name":"Lifecycle New"}'::jsonb
  ),
  (
    '8a200000-0000-4000-8000-000000000002',
    'lifecycle-existing@example.com',
    now() - interval '7 days',
    '{"full_name":"Lifecycle Existing"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  (
    '8a100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001',
    'owner',
    'Lifecycle New',
    'lifecycle-new@example.com',
    null
  ),
  (
    '8a200000-0000-4000-8000-000000000002',
    '8a200000-0000-4000-8000-000000000002',
    'owner',
    'Lifecycle Existing',
    'lifecycle-existing@example.com',
    null
  )
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  (
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001',
    'Lifecycle New Shop',
    'Lifecycle New Shop',
    3
  ),
  (
    '8b200000-0000-4000-8000-000000000002',
    '8a200000-0000-4000-8000-000000000002',
    'Lifecycle Existing Shop',
    'Lifecycle Existing Shop',
    3
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '8a100000-0000-4000-8000-000000000001'
    then '8b100000-0000-4000-8000-000000000001'::uuid
  when '8a200000-0000-4000-8000-000000000002'
    then '8b200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '8a100000-0000-4000-8000-000000000001',
  '8a200000-0000-4000-8000-000000000002'
);

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
  expires_at,
  claimed_user_id,
  claimed_shop_id,
  claimed_at,
  created_at,
  updated_at
)
values
  (
    '8c100000-0000-4000-8000-000000000001',
    'acq:8d100000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'complete',
    'price_lifecycle_new',
    14,
    'claimed',
    'cs_test_lifecycle_new',
    'cus_lifecyclenew',
    'sub_lifecyclenew',
    'lifecycle-new@example.com',
    now() + interval '1 day',
    '8a100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001',
    now(),
    now() - interval '1 hour',
    now()
  ),
  (
    '8c200000-0000-4000-8000-000000000002',
    'acq:8d200000-0000-4000-8000-000000000002',
    repeat('b', 64),
    'complete',
    'price_lifecycle_existing',
    14,
    'claimed',
    'cs_test_lifecycle_existing',
    'cus_lifecycleexisting',
    'sub_lifecycleexisting',
    'lifecycle-existing@example.com',
    now() + interval '1 day',
    '8a200000-0000-4000-8000-000000000002',
    '8b200000-0000-4000-8000-000000000002',
    now(),
    now() - interval '1 hour',
    now()
  );

insert into public.marketing_events (
  event_name,
  package_key,
  interval,
  checkout_mode,
  checkout_attempt_id
)
values
  ('checkout_started', 'complete', 'monthly', 'trial', '8d100000-0000-4000-8000-000000000001'),
  ('checkout_started', 'complete', 'monthly', 'trial', '8d200000-0000-4000-8000-000000000002');

do $$
declare
  v_result boolean;
  v_count integer;
begin
  select public.record_marketing_signup_completed(
    '8c100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001'
  ) into v_result;
  if not v_result then
    raise exception 'marketing lifecycle runtime assertion failed: new-account signup was not recorded';
  end if;

  perform public.record_marketing_signup_completed(
    '8c100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001'
  );
  select count(*) into v_count
  from public.marketing_events
  where event_name = 'signup_completed'
    and checkout_attempt_id = '8d100000-0000-4000-8000-000000000001';
  if v_count <> 1 then
    raise exception 'marketing lifecycle runtime assertion failed: signup idempotence broke';
  end if;

  select public.record_marketing_signup_completed(
    '8c200000-0000-4000-8000-000000000002',
    '8a200000-0000-4000-8000-000000000002'
  ) into v_result;
  if v_result then
    raise exception 'marketing lifecycle runtime assertion failed: existing-account acquisition emitted signup_completed';
  end if;
end
$$;

insert into public.guided_onboarding_sessions (
  id,
  shop_id,
  created_by,
  status,
  current_step_key,
  completed_at
)
values
  (
    '8e100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001',
    'completed',
    null,
    now()
  ),
  (
    '8e200000-0000-4000-8000-000000000002',
    '8b200000-0000-4000-8000-000000000002',
    '8a200000-0000-4000-8000-000000000002',
    'completed',
    null,
    now()
  );

-- Simulate a later billing-session replacement. Lifecycle correlation must use
-- the durable acquisition binding, not this mutable shop billing field.
update public.shops
set stripe_checkout_session_id = 'cs_test_replaced_after_claim'
where id = '8b100000-0000-4000-8000-000000000001';

do $$
declare
  v_result boolean;
  v_count integer;
  v_event_text text;
begin
  select public.record_marketing_onboarding_completed(
    '8e100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001'
  ) into v_result;
  if not v_result then
    raise exception 'marketing lifecycle runtime assertion failed: billing-session replacement broke durable onboarding correlation';
  end if;

  perform public.record_marketing_onboarding_completed(
    '8e100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001'
  );
  select count(*) into v_count
  from public.marketing_events
  where event_name = 'onboarding_completed'
    and checkout_attempt_id = '8d100000-0000-4000-8000-000000000001';
  if v_count <> 1 then
    raise exception 'marketing lifecycle runtime assertion failed: onboarding idempotence broke';
  end if;

  select public.record_marketing_onboarding_completed(
    '8e200000-0000-4000-8000-000000000002',
    '8b200000-0000-4000-8000-000000000002'
  ) into v_result;
  if v_result then
    raise exception 'marketing lifecycle runtime assertion failed: existing-account acquisition emitted onboarding_completed';
  end if;

  select row_to_json(me)::text into v_event_text
  from public.marketing_events as me
  where me.event_name = 'onboarding_completed'
    and me.checkout_attempt_id = '8d100000-0000-4000-8000-000000000001'
  limit 1;
  if v_event_text like '%8a100000-0000-4000-8000-000000000001%'
     or v_event_text like '%8b100000-0000-4000-8000-000000000001%' then
    raise exception 'marketing lifecycle runtime assertion failed: lifecycle event leaked user/shop identity';
  end if;
end
$$;


-- Force lifecycle writes to fail inside the analytics adapter. The exception
-- must be swallowed so the already-completed onboarding state remains intact.
alter table public.marketing_events
  add constraint marketing_events_lifecycle_failure_fixture_check
  check (event_name not in ('signup_completed', 'onboarding_completed'));

do $
declare
  v_result boolean;
  v_status text;
begin
  select public.record_marketing_signup_completed(
    '8c100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001'
  ) into v_result;
  if v_result then
    raise exception 'marketing lifecycle runtime assertion failed: forced signup analytics error was not fail-open';
  end if;

  select public.record_marketing_onboarding_completed(
    '8e100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001'
  ) into v_result;
  if v_result then
    raise exception 'marketing lifecycle runtime assertion failed: forced onboarding analytics error was not fail-open';
  end if;

  select status into v_status
  from public.guided_onboarding_sessions
  where id = '8e100000-0000-4000-8000-000000000001';
  if v_status <> 'completed' then
    raise exception 'marketing lifecycle runtime assertion failed: analytics error changed completed onboarding state';
  end if;
end
$;

rollback;
