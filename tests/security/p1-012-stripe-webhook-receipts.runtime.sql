\set ON_ERROR_STOP on

begin;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.claim_stripe_webhook_event(text,text,boolean,text,text,timestamptz,integer)',
    'public.complete_stripe_webhook_event(text,uuid)',
    'public.fail_stripe_webhook_event(text,uuid,text)',
    'public.apply_stripe_subscription_webhook_snapshot(uuid,text,text,text,timestamptz,jsonb)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'P1-012 runtime assertion failed: unsafe function ACL for %', v_signature;
    end if;
  end loop;

  if has_table_privilege('anon', 'private.stripe_webhook_event_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'private.stripe_webhook_event_receipts', 'SELECT')
     or has_table_privilege('service_role', 'private.stripe_webhook_event_receipts', 'SELECT')
     or has_table_privilege('anon', 'private.stripe_subscription_event_watermarks', 'SELECT')
     or has_table_privilege('authenticated', 'private.stripe_subscription_event_watermarks', 'SELECT')
     or has_table_privilege('service_role', 'private.stripe_subscription_event_watermarks', 'SELECT') then
    raise exception 'P1-012 runtime assertion failed: private Stripe ledgers are directly exposed';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '8a100000-0000-4000-8000-000000000001',
  'p1-012-owner@example.com',
  '{"full_name":"P1-012 Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, shop_id)
values (
  '8a100000-0000-4000-8000-000000000001',
  '8a100000-0000-4000-8000-000000000001',
  'owner',
  'P1-012 Owner',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    shop_id = excluded.shop_id;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values (
  '8b100000-0000-4000-8000-000000000001',
  '8a100000-0000-4000-8000-000000000001',
  'P1-012 Shop',
  'P1-012 Shop',
  3
)
on conflict (id) do nothing;

set local role service_role;

do $$
declare
  v_claimed boolean;
  v_processed boolean;
  v_in_progress boolean;
  v_token_a uuid;
  v_token_b uuid;
  v_attempts integer;
  v_ok boolean;
begin
  select claimed, already_processed, in_progress, claim_token, attempt_count
  into v_claimed, v_processed, v_in_progress, v_token_a, v_attempts
  from public.claim_stripe_webhook_event(
    'evt_p1012_receipt',
    'customer.subscription.updated',
    true,
    '',
    'sub_p1012receipt',
    '2026-07-27T02:00:00Z'::timestamptz,
    300
  );
  if not v_claimed or v_processed or v_in_progress or v_token_a is null or v_attempts <> 1 then
    raise exception 'P1-012 runtime assertion failed: first Stripe event claim was invalid';
  end if;

  select claimed, already_processed, in_progress, claim_token, attempt_count
  into v_claimed, v_processed, v_in_progress, v_token_b, v_attempts
  from public.claim_stripe_webhook_event(
    'evt_p1012_receipt',
    'customer.subscription.updated',
    true,
    '',
    'sub_p1012receipt',
    '2026-07-27T02:00:00Z'::timestamptz,
    300
  );
  if v_claimed or v_processed or not v_in_progress or v_token_b is not null or v_attempts <> 1 then
    raise exception 'P1-012 runtime assertion failed: concurrent delivery was claimable twice';
  end if;

  select public.fail_stripe_webhook_event(
    'evt_p1012_receipt',
    v_token_a,
    'simulated transient failure'
  ) into v_ok;
  if not v_ok then
    raise exception 'P1-012 runtime assertion failed: claimed event could not be failed';
  end if;

  select claimed, already_processed, in_progress, claim_token, attempt_count
  into v_claimed, v_processed, v_in_progress, v_token_b, v_attempts
  from public.claim_stripe_webhook_event(
    'evt_p1012_receipt',
    'customer.subscription.updated',
    true,
    '',
    'sub_p1012receipt',
    '2026-07-27T02:00:00Z'::timestamptz,
    300
  );
  if not v_claimed or v_processed or v_in_progress or v_token_b is null
     or v_token_b = v_token_a or v_attempts <> 2 then
    raise exception 'P1-012 runtime assertion failed: failed Stripe event was not safely reclaimable';
  end if;

  select public.complete_stripe_webhook_event(
    'evt_p1012_receipt',
    v_token_b
  ) into v_ok;
  if not v_ok then
    raise exception 'P1-012 runtime assertion failed: claimed Stripe event could not complete';
  end if;

  select claimed, already_processed, in_progress, claim_token, attempt_count
  into v_claimed, v_processed, v_in_progress, v_token_a, v_attempts
  from public.claim_stripe_webhook_event(
    'evt_p1012_receipt',
    'customer.subscription.updated',
    true,
    '',
    'sub_p1012receipt',
    '2026-07-27T02:00:00Z'::timestamptz,
    300
  );
  if v_claimed or not v_processed or v_in_progress or v_token_a is not null or v_attempts <> 2 then
    raise exception 'P1-012 runtime assertion failed: processed Stripe event was replayed';
  end if;

  begin
    perform public.claim_stripe_webhook_event(
      'evt_p1012_receipt',
      'customer.subscription.deleted',
      true,
      '',
      'sub_p1012receipt',
      '2026-07-27T02:00:00Z'::timestamptz,
      300
    );
    raise exception 'P1-012 runtime assertion failed: conflicting event metadata was accepted';
  exception
    when invalid_parameter_value then null;
  end;
end
$$;

do $$
declare
  v_applied boolean;
  v_shop public.shops%rowtype;
begin
  select public.apply_stripe_subscription_webhook_snapshot(
    '8b100000-0000-4000-8000-000000000001',
    'cus_p1012shop',
    'sub_p1012shop',
    'evt_p1012_subscription_new',
    '2026-07-27T02:00:00Z'::timestamptz,
    '{
      "stripe_subscription_status":"active",
      "stripe_trial_end":null,
      "stripe_current_period_end":"2026-08-27T02:00:00Z",
      "plan":"pro",
      "stripe_checkout_session_id":"cs_p1012shop"
    }'::jsonb
  ) into v_applied;
  if not v_applied then
    raise exception 'P1-012 runtime assertion failed: first subscription snapshot was rejected';
  end if;

  select public.apply_stripe_subscription_webhook_snapshot(
    '8b100000-0000-4000-8000-000000000001',
    'cus_p1012shop',
    'sub_p1012shop',
    'evt_p1012_subscription_old',
    '2026-07-27T01:00:00Z'::timestamptz,
    '{
      "stripe_subscription_status":"canceled",
      "stripe_trial_end":null,
      "stripe_current_period_end":"2026-07-27T01:00:00Z",
      "plan":"starter",
      "stripe_checkout_session_id":null
    }'::jsonb
  ) into v_applied;
  if v_applied then
    raise exception 'P1-012 runtime assertion failed: stale subscription snapshot was applied';
  end if;

  select * into v_shop
  from public.shops
  where id = '8b100000-0000-4000-8000-000000000001';
  if v_shop.stripe_subscription_status <> 'active'
     or v_shop.plan <> 'pro'
     or v_shop.stripe_subscription_id <> 'sub_p1012shop' then
    raise exception 'P1-012 runtime assertion failed: stale event changed canonical billing';
  end if;

  select public.apply_stripe_subscription_webhook_snapshot(
    '8b100000-0000-4000-8000-000000000001',
    'cus_p1012shop',
    'sub_p1012shop',
    'evt_p1012_subscription_new',
    '2026-07-27T02:00:00Z'::timestamptz,
    '{
      "stripe_subscription_status":"active",
      "stripe_trial_end":null,
      "stripe_current_period_end":"2026-08-27T02:00:00Z",
      "plan":"pro",
      "stripe_checkout_session_id":"cs_p1012shop"
    }'::jsonb
  ) into v_applied;
  if not v_applied then
    raise exception 'P1-012 runtime assertion failed: same-event retry was not idempotent';
  end if;

  select public.apply_stripe_subscription_webhook_snapshot(
    '8b100000-0000-4000-8000-000000000001',
    'cus_p1012shop',
    'sub_p1012shop',
    'evt_p1012_subscription_latest',
    '2026-07-27T03:00:00Z'::timestamptz,
    '{
      "stripe_subscription_status":"canceled",
      "stripe_trial_end":null,
      "stripe_current_period_end":"2026-07-27T03:00:00Z",
      "plan":"starter",
      "stripe_checkout_session_id":null
    }'::jsonb
  ) into v_applied;
  if not v_applied then
    raise exception 'P1-012 runtime assertion failed: newer subscription snapshot was rejected';
  end if;

  select * into v_shop
  from public.shops
  where id = '8b100000-0000-4000-8000-000000000001';
  if v_shop.stripe_subscription_status <> 'canceled'
     or v_shop.plan <> 'starter' then
    raise exception 'P1-012 runtime assertion failed: newest billing state was not canonical';
  end if;

  select public.apply_stripe_subscription_webhook_snapshot(
    '8b100000-0000-4000-8000-000000000001',
    'cus_p1012shop',
    'sub_p1012other',
    'evt_p1012_wrong_subscription',
    '2026-07-27T04:00:00Z'::timestamptz,
    '{"stripe_subscription_status":"active","plan":"unlimited"}'::jsonb
  ) into v_applied;
  if v_applied then
    raise exception 'P1-012 runtime assertion failed: different subscription replaced shop billing identity';
  end if;
end
$$;

reset role;

do $$
declare
  v_claimed boolean;
  v_processed boolean;
  v_in_progress boolean;
  v_token_a uuid;
  v_token_b uuid;
  v_attempts integer;
  v_status text;
  v_deliveries integer;
  v_watermark_event text;
begin
  select claimed, already_processed, in_progress, claim_token, attempt_count
  into v_claimed, v_processed, v_in_progress, v_token_a, v_attempts
  from public.claim_stripe_webhook_event(
    'evt_p1012_abandoned',
    'customer.subscription.updated',
    true,
    '',
    'sub_p1012abandoned',
    '2026-07-27T02:30:00Z'::timestamptz,
    30
  );
  if not v_claimed or v_processed or v_in_progress
     or v_token_a is null or v_attempts <> 1 then
    raise exception 'P1-012 runtime assertion failed: abandoned-lease fixture was not claimed';
  end if;

  update private.stripe_webhook_event_receipts
  set claimed_at = now() - interval '31 seconds'
  where event_id = 'evt_p1012_abandoned';

  select claimed, already_processed, in_progress, claim_token, attempt_count
  into v_claimed, v_processed, v_in_progress, v_token_b, v_attempts
  from public.claim_stripe_webhook_event(
    'evt_p1012_abandoned',
    'customer.subscription.updated',
    true,
    '',
    'sub_p1012abandoned',
    '2026-07-27T02:30:00Z'::timestamptz,
    30
  );
  if not v_claimed or v_processed or v_in_progress or v_token_b is null
     or v_token_b = v_token_a or v_attempts <> 2 then
    raise exception 'P1-012 runtime assertion failed: abandoned Stripe claim was not safely reclaimed';
  end if;

  select status, attempt_count, delivery_count
  into v_status, v_attempts, v_deliveries
  from private.stripe_webhook_event_receipts
  where event_id = 'evt_p1012_receipt';
  if v_status <> 'processed' or v_attempts <> 2 or v_deliveries <> 4 then
    raise exception 'P1-012 runtime assertion failed: durable receipt history is inconsistent';
  end if;

  select event_id into v_watermark_event
  from private.stripe_subscription_event_watermarks
  where subscription_id = 'sub_p1012shop';
  if v_watermark_event <> 'evt_p1012_subscription_latest' then
    raise exception 'P1-012 runtime assertion failed: subscription watermark is not monotonic';
  end if;
end
$$;

rollback;
