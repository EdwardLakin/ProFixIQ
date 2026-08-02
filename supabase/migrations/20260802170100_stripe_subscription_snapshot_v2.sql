begin;

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
  v_pricing_model text;
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
  v_pricing_model := coalesce(
    nullif(trim(p_snapshot ->> 'stripe_pricing_model'), ''),
    'legacy'
  );
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
  if v_pricing_model not in ('legacy', 'base_plus_seats_v2') then
    raise exception using errcode = '22023', message = 'invalid Stripe pricing model';
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
         stripe_pricing_model = v_pricing_model,
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

revoke all on function public.apply_stripe_subscription_webhook_snapshot(uuid, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_webhook_snapshot(uuid, text, text, text, timestamptz, jsonb)
  to service_role;

commit;
