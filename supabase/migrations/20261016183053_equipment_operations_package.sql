begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Standalone Equipment Operations package (contract change approved by the
-- owner for this task). Strictly additive: the only change to each existing
-- object is that 'equipment_operations' becomes an accepted package value, and
-- profixiq_shop_has_product_access gains an 'equipment' capability, and the
-- 'shop' and 'field_service' engine capabilities also resolve true for the
-- Equipment package (field service is native to Equipment). Result for every
-- other package, legacy (null package) shops and billing overrides is
-- unchanged, and no role becomes more or less capable. Grants are preserved because every function keeps its signature.
-- product_package_user_limit already returns the 10-seat default for any
-- non-Field/Fleet key, so it needs no change.

alter table public.shops
  drop constraint if exists shops_subscription_package_check,
  add constraint shops_subscription_package_check check (
    subscription_package is null
    or subscription_package in (
      'shop_operations',
      'field_service',
      'fleet_maintenance',
      'complete_operations',
      'equipment_operations'
    )
  ) not valid;

alter table public.shops
  validate constraint shops_subscription_package_check;

-- Same body as the deployed function except the accepted package list.
create or replace function public.apply_stripe_subscription_webhook_snapshot(
  p_shop_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_event_id text,
  p_event_created_at timestamptz,
  p_snapshot jsonb
) returns boolean
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
  v_subscription_package text;
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
  v_subscription_package := nullif(trim(p_snapshot ->> 'subscription_package'), '');
  v_checkout_session_id := nullif(trim(p_snapshot ->> 'stripe_checkout_session_id'), '');

  begin
    v_trial_end := nullif(trim(p_snapshot ->> 'stripe_trial_end'), '')::timestamptz;
    v_current_period_end := nullif(trim(p_snapshot ->> 'stripe_current_period_end'), '')::timestamptz;
  exception
    when invalid_datetime_format then
      raise exception using errcode = '22023', message = 'invalid Stripe subscription timestamp';
  end;

  if v_subscription_status is not null and v_subscription_status not in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
    'canceled', 'unpaid', 'paused'
  ) then
    raise exception using errcode = '22023', message = 'invalid Stripe subscription status';
  end if;
  if v_plan is not null and v_plan not in ('starter', 'pro', 'unlimited') then
    raise exception using errcode = '22023', message = 'invalid canonical billing plan';
  end if;
  if v_pricing_model not in ('legacy', 'base_plus_seats_v2', 'product_packages_v1') then
    raise exception using errcode = '22023', message = 'invalid Stripe pricing model';
  end if;
  if v_subscription_package is not null and v_subscription_package not in (
    'shop_operations', 'field_service', 'fleet_maintenance', 'complete_operations',
    'equipment_operations'
  ) then
    raise exception using errcode = '22023', message = 'invalid subscription package';
  end if;
  if v_pricing_model = 'product_packages_v1' and v_subscription_package is null then
    raise exception using errcode = '22023', message = 'package pricing requires a subscription package';
  end if;

  select shop.* into v_shop
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
    subscription_id, shop_id, stripe_customer_id, event_id, event_created_at
  ) values (
    p_subscription_id, p_shop_id, p_customer_id, p_event_id, p_event_created_at
  ) on conflict (subscription_id) do nothing;

  select watermark.* into v_watermark
  from private.stripe_subscription_event_watermarks watermark
  where watermark.subscription_id = p_subscription_id
  for update;

  if not found or v_watermark.shop_id <> p_shop_id then return false; end if;
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
      subscription_package = v_subscription_package,
      plan = v_plan,
      stripe_checkout_session_id = coalesce(
        v_checkout_session_id,
        stripe_checkout_session_id
      ),
      billing_entitlement_updated_at = now()
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

create or replace function public.profixiq_shop_has_product_access(
  p_shop_id uuid,
  p_capability text
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
      when shop.billing_entitlement_override in ('active', 'internal_demo') then true
      when shop.billing_entitlement_override in ('read_only', 'suspended') then false
      when not (
        lower(coalesce(shop.stripe_subscription_status, '')) in ('trialing', 'active', 'past_due')
        or coalesce(shop.billing_grace_until > now(), false)
      ) then false
      when shop.subscription_package is null
        and shop.stripe_pricing_model <> 'product_packages_v1' then true
      when p_capability = 'shop' then
        shop.subscription_package in ('shop_operations', 'complete_operations', 'equipment_operations')
      when p_capability = 'field_service' then
        shop.subscription_package in ('field_service', 'complete_operations', 'equipment_operations')
      when p_capability = 'fleet_maintenance' then
        shop.subscription_package in ('fleet_maintenance', 'complete_operations')
      when p_capability = 'equipment' then
        shop.subscription_package = 'equipment_operations'
      else false
    end
    from public.shops shop
    where shop.id = p_shop_id
      and (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.profiles profile
          where profile.shop_id = shop.id
            and (profile.id = auth.uid() or profile.user_id = auth.uid())
        )
        or exists (
          select 1
          from public.fleet_members member
          where member.shop_id = shop.id
            and member.user_id = auth.uid()
        )
      )
  ), false);
$$;

commit;
