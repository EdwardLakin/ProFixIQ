-- P1-012: make Stripe webhook delivery replay-safe and prevent stale
-- subscription events from overwriting newer canonical billing state.

begin;

create schema if not exists private;

create table if not exists private.stripe_webhook_event_receipts (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  stripe_account_id text,
  object_id text,
  event_created_at timestamptz not null,
  status text not null default 'processing',
  claim_token uuid,
  attempt_count integer not null default 1,
  delivery_count integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_event_receipts_event_id_check
    check (event_id ~ '^evt_[A-Za-z0-9_]+$'),
  constraint stripe_webhook_event_receipts_event_type_check
    check (char_length(event_type) between 3 and 200),
  constraint stripe_webhook_event_receipts_status_check
    check (status in ('processing', 'processed', 'failed')),
  constraint stripe_webhook_event_receipts_attempt_count_check
    check (attempt_count > 0),
  constraint stripe_webhook_event_receipts_delivery_count_check
    check (delivery_count > 0)
);

alter table private.stripe_webhook_event_receipts enable row level security;
alter table private.stripe_webhook_event_receipts force row level security;

create index if not exists stripe_webhook_event_receipts_status_claimed_idx
  on private.stripe_webhook_event_receipts (status, claimed_at);

create table if not exists private.stripe_subscription_event_watermarks (
  subscription_id text primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  stripe_customer_id text,
  event_id text not null unique,
  event_created_at timestamptz not null,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_subscription_event_watermarks_subscription_check
    check (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  constraint stripe_subscription_event_watermarks_customer_check
    check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  constraint stripe_subscription_event_watermarks_event_check
    check (event_id ~ '^evt_[A-Za-z0-9_]+$')
);

alter table private.stripe_subscription_event_watermarks enable row level security;
alter table private.stripe_subscription_event_watermarks force row level security;

create index if not exists stripe_subscription_event_watermarks_shop_idx
  on private.stripe_subscription_event_watermarks (shop_id, event_created_at desc);

revoke all on table private.stripe_webhook_event_receipts
  from public, anon, authenticated, service_role;
revoke all on table private.stripe_subscription_event_watermarks
  from public, anon, authenticated, service_role;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_stripe_account_id text,
  p_object_id text,
  p_event_created_at timestamptz,
  p_lease_seconds integer
)
returns table (
  claimed boolean,
  already_processed boolean,
  in_progress boolean,
  claim_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_receipt private.stripe_webhook_event_receipts%rowtype;
  v_claim_token uuid := gen_random_uuid();
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'invalid Stripe event id';
  end if;
  if p_event_type is null or char_length(trim(p_event_type)) not between 3 and 200 then
    raise exception using errcode = '22023', message = 'invalid Stripe event type';
  end if;
  if p_event_created_at is null then
    raise exception using errcode = '22023', message = 'Stripe event creation time is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise exception using errcode = '22023', message = 'Stripe event lease must be between 30 and 3600 seconds';
  end if;

  insert into private.stripe_webhook_event_receipts (
    event_id,
    event_type,
    livemode,
    stripe_account_id,
    object_id,
    event_created_at,
    status,
    claim_token,
    claimed_at
  )
  values (
    p_event_id,
    trim(p_event_type),
    p_livemode,
    nullif(trim(coalesce(p_stripe_account_id, '')), ''),
    nullif(trim(coalesce(p_object_id, '')), ''),
    p_event_created_at,
    'processing',
    v_claim_token,
    now()
  )
  on conflict (event_id) do nothing
  returning * into v_receipt;

  if found then
    return query
    select true, false, false, v_receipt.claim_token, v_receipt.attempt_count;
    return;
  end if;

  select receipt.*
  into v_receipt
  from private.stripe_webhook_event_receipts receipt
  where receipt.event_id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Stripe event receipt disappeared during claim';
  end if;

  if v_receipt.event_type <> trim(p_event_type)
     or v_receipt.livemode is distinct from p_livemode
     or v_receipt.stripe_account_id is distinct from nullif(trim(coalesce(p_stripe_account_id, '')), '')
     or v_receipt.object_id is distinct from nullif(trim(coalesce(p_object_id, '')), '')
     or v_receipt.event_created_at is distinct from p_event_created_at then
    raise exception using errcode = '22023', message = 'Stripe event receipt metadata conflict';
  end if;

  update private.stripe_webhook_event_receipts
  set delivery_count = delivery_count + 1,
      last_received_at = now(),
      updated_at = now()
  where event_id = p_event_id
  returning * into v_receipt;

  if v_receipt.status = 'processed' then
    return query
    select false, true, false, null::uuid, v_receipt.attempt_count;
    return;
  end if;

  if v_receipt.status = 'processing'
     and v_receipt.claimed_at is not null
     and v_receipt.claimed_at > now() - make_interval(secs => p_lease_seconds) then
    return query
    select false, false, true, null::uuid, v_receipt.attempt_count;
    return;
  end if;

  v_claim_token := gen_random_uuid();
  update private.stripe_webhook_event_receipts
  set status = 'processing',
      claim_token = v_claim_token,
      attempt_count = attempt_count + 1,
      claimed_at = now(),
      processed_at = null,
      failed_at = null,
      last_error = null,
      updated_at = now()
  where event_id = p_event_id
  returning * into v_receipt;

  return query
  select true, false, false, v_receipt.claim_token, v_receipt.attempt_count;
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  p_event_id text,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update private.stripe_webhook_event_receipts
  set status = 'processed',
      processed_at = now(),
      failed_at = null,
      last_error = null,
      updated_at = now()
  where event_id = p_event_id
    and claim_token = p_claim_token
    and status = 'processing';

  if found then
    return true;
  end if;

  return exists (
    select 1
    from private.stripe_webhook_event_receipts
    where event_id = p_event_id
      and claim_token = p_claim_token
      and status = 'processed'
  );
end;
$$;

create or replace function public.fail_stripe_webhook_event(
  p_event_id text,
  p_claim_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update private.stripe_webhook_event_receipts
  set status = 'failed',
      failed_at = now(),
      last_error = left(nullif(trim(coalesce(p_error, '')), ''), 1000),
      updated_at = now()
  where event_id = p_event_id
    and claim_token = p_claim_token
    and status = 'processing';

  return found;
end;
$$;

create or replace function public.apply_stripe_subscription_webhook_snapshot(
  p_shop_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_event_id text,
  p_event_created_at timestamptz,
  p_snapshot jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_shop public.shops%rowtype;
  v_watermark private.stripe_subscription_event_watermarks%rowtype;
  v_subscription_status text;
  v_trial_end timestamptz;
  v_current_period_end timestamptz;
  v_plan text;
  v_checkout_session_id text;
begin
  if p_shop_id is null then
    raise exception using errcode = '22023', message = 'shop id is required';
  end if;
  if p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$' then
    raise exception using errcode = '22023', message = 'invalid Stripe subscription id';
  end if;
  if p_customer_id is not null and p_customer_id !~ '^cus_[A-Za-z0-9]+$' then
    raise exception using errcode = '22023', message = 'invalid Stripe customer id';
  end if;
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' or p_event_created_at is null then
    raise exception using errcode = '22023', message = 'invalid Stripe subscription event';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid Stripe subscription snapshot';
  end if;

  v_subscription_status := nullif(trim(p_snapshot ->> 'stripe_subscription_status'), '');
  v_plan := nullif(trim(p_snapshot ->> 'plan'), '');
  v_checkout_session_id := nullif(trim(p_snapshot ->> 'stripe_checkout_session_id'), '');

  begin
    v_trial_end := nullif(trim(p_snapshot ->> 'stripe_trial_end'), '')::timestamptz;
    v_current_period_end := nullif(trim(p_snapshot ->> 'stripe_current_period_end'), '')::timestamptz;
  exception
    when invalid_datetime_format then
      raise exception using errcode = '22023', message = 'invalid Stripe subscription timestamp';
  end;

  if v_subscription_status is not null and v_subscription_status not in (
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused'
  ) then
    raise exception using errcode = '22023', message = 'invalid Stripe subscription status';
  end if;
  if v_plan is not null and v_plan not in ('starter', 'pro', 'unlimited') then
    raise exception using errcode = '22023', message = 'invalid canonical billing plan';
  end if;

  select shop.*
  into v_shop
  from public.shops shop
  where shop.id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'billing shop not found';
  end if;

  if (v_shop.stripe_customer_id is not null and v_shop.stripe_customer_id is distinct from p_customer_id)
     or (v_shop.stripe_subscription_id is not null and v_shop.stripe_subscription_id <> p_subscription_id) then
    return false;
  end if;

  insert into private.stripe_subscription_event_watermarks (
    subscription_id,
    shop_id,
    stripe_customer_id,
    event_id,
    event_created_at
  )
  values (
    p_subscription_id,
    p_shop_id,
    p_customer_id,
    p_event_id,
    p_event_created_at
  )
  on conflict (subscription_id) do nothing;

  select watermark.*
  into v_watermark
  from private.stripe_subscription_event_watermarks watermark
  where watermark.subscription_id = p_subscription_id
  for update;

  if not found or v_watermark.shop_id <> p_shop_id then
    return false;
  end if;

  if v_watermark.event_created_at > p_event_created_at
     or (
       v_watermark.event_created_at = p_event_created_at
       and v_watermark.event_id > p_event_id
     ) then
    return false;
  end if;

  update public.shops
  set stripe_customer_id = p_customer_id,
      stripe_subscription_id = p_subscription_id,
      stripe_subscription_status = v_subscription_status,
      stripe_trial_end = v_trial_end,
      stripe_current_period_end = v_current_period_end,
      plan = v_plan,
      stripe_checkout_session_id = coalesce(
        v_checkout_session_id,
        stripe_checkout_session_id
      )
  where id = p_shop_id;

  update private.stripe_subscription_event_watermarks
  set stripe_customer_id = p_customer_id,
      event_id = p_event_id,
      event_created_at = p_event_created_at,
      applied_at = now(),
      updated_at = now()
  where subscription_id = p_subscription_id;

  return true;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, boolean, text, text, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_stripe_webhook_event(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.apply_stripe_subscription_webhook_snapshot(uuid, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(text, text, boolean, text, text, timestamptz, integer)
  to service_role;
grant execute on function public.complete_stripe_webhook_event(text, uuid)
  to service_role;
grant execute on function public.fail_stripe_webhook_event(text, uuid, text)
  to service_role;
grant execute on function public.apply_stripe_subscription_webhook_snapshot(uuid, text, text, text, timestamptz, jsonb)
  to service_role;

comment on table private.stripe_webhook_event_receipts is
  'Service-only Stripe webhook receipt ledger used for atomic delivery claims and replay protection.';
comment on table private.stripe_subscription_event_watermarks is
  'Service-only monotonic watermark for canonical Stripe subscription billing updates.';

commit;
