begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

alter table public.shops
  add column if not exists subscription_package text;

alter table public.shops
  drop constraint if exists shops_subscription_package_check,
  add constraint shops_subscription_package_check check (
    subscription_package is null
    or subscription_package in (
      'shop_operations',
      'field_service',
      'fleet_maintenance',
      'complete_operations'
    )
  ) not valid,
  drop constraint if exists shops_stripe_pricing_model_check,
  add constraint shops_stripe_pricing_model_check check (
    stripe_pricing_model in ('legacy', 'base_plus_seats_v2', 'product_packages_v1')
  ) not valid;

alter table public.shops
  validate constraint shops_subscription_package_check,
  validate constraint shops_stripe_pricing_model_check;

comment on column public.shops.subscription_package is
  'Stripe-synchronized product package. Null preserves grandfathered legacy subscription behavior.';

create or replace function public.profixiq_mark_package_capacity_billing_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_shop_id uuid;
  v_new_shop_id uuid;
  v_old_fleet_id uuid;
  v_new_fleet_id uuid;
begin
  if tg_table_name = 'service_vehicles' then
    if tg_op <> 'INSERT' then v_old_shop_id := old.shop_id; end if;
    if tg_op <> 'DELETE' then v_new_shop_id := new.shop_id; end if;
  else
    if tg_op <> 'INSERT' then
      v_old_shop_id := old.shop_id;
      v_old_fleet_id := old.fleet_id;
    end if;
    if tg_op <> 'DELETE' then
      v_new_shop_id := new.shop_id;
      v_new_fleet_id := new.fleet_id;
    end if;
    if v_old_shop_id is null and v_old_fleet_id is not null then
      select fleet.shop_id into v_old_shop_id
      from public.fleets fleet
      where fleet.id = v_old_fleet_id;
    end if;
    if v_new_shop_id is null and v_new_fleet_id is not null then
      select fleet.shop_id into v_new_shop_id
      from public.fleets fleet
      where fleet.id = v_new_fleet_id;
    end if;
  end if;

  update public.shops shop
  set stripe_billing_sync_required = true,
      stripe_billing_synced_at = null,
      billing_entitlement_updated_at = now()
  where shop.id in (v_old_shop_id, v_new_shop_id)
    and shop.stripe_pricing_model = 'product_packages_v1';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.profixiq_mark_package_capacity_billing_sync()
  from public, anon, authenticated;
grant execute on function public.profixiq_mark_package_capacity_billing_sync()
  to service_role;

drop trigger if exists service_vehicles_mark_package_billing_sync
  on public.service_vehicles;
create trigger service_vehicles_mark_package_billing_sync
after insert or delete or update of active, shop_id
on public.service_vehicles
for each row execute function public.profixiq_mark_package_capacity_billing_sync();

drop trigger if exists fleet_vehicles_mark_package_billing_sync
  on public.fleet_vehicles;
create trigger fleet_vehicles_mark_package_billing_sync
after insert or delete or update of active, shop_id, fleet_id
on public.fleet_vehicles
for each row execute function public.profixiq_mark_package_capacity_billing_sync();

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
      -- Existing subscribers keep their historical complete entitlement until
      -- they explicitly move to the package catalog.
      when shop.subscription_package is null
        and shop.stripe_pricing_model <> 'product_packages_v1' then true
      when p_capability = 'shop' then
        shop.subscription_package in ('shop_operations', 'complete_operations')
      when p_capability = 'field_service' then
        shop.subscription_package in ('field_service', 'complete_operations')
      when p_capability = 'fleet_maintenance' then
        shop.subscription_package in ('fleet_maintenance', 'complete_operations')
      else false
    end
    from public.shops shop
    where shop.id = p_shop_id
  ), false);
$$;

revoke all on function public.profixiq_shop_has_product_access(uuid, text)
  from public, anon;
grant execute on function public.profixiq_shop_has_product_access(uuid, text)
  to authenticated, service_role;

create or replace function public.profixiq_fleet_has_product_access(
  p_fleet_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      public.profixiq_shop_has_product_access(fleet.shop_id, 'fleet_maintenance')
      and (
        shop.subscription_package is distinct from 'complete_operations'
        or (
          select count(*)
          from public.fleet_vehicles fleet_vehicle
          where fleet_vehicle.fleet_id = fleet.id
            and fleet_vehicle.active
        ) <= 10
      )
    from public.fleets fleet
    join public.shops shop on shop.id = fleet.shop_id
    where fleet.id = p_fleet_id
      and fleet.active
  ), false);
$$;

revoke all on function public.profixiq_fleet_has_product_access(uuid)
  from public, anon;
grant execute on function public.profixiq_fleet_has_product_access(uuid)
  to authenticated, service_role;

-- Field Service keeps its explicit shop toggle and operator assignment, with
-- the paid package as the outer boundary.
create or replace function public.mobile_profile_has_field_service_access(
  p_shop_id uuid,
  p_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.profixiq_shop_has_product_access(p_shop_id, 'field_service')
    and exists (
      select 1
      from public.mobile_service_settings settings
      join public.mobile_field_operators operator
        on operator.shop_id = settings.shop_id
       and operator.profile_id = p_profile_id
       and operator.enabled
      join public.profiles profile
        on profile.id = operator.profile_id
       and profile.shop_id = settings.shop_id
      where settings.shop_id = p_shop_id
        and settings.onboarding_completed_at is not null
        and settings.service_model in ('mobile', 'both')
    );
$$;

revoke all on function public.mobile_profile_has_field_service_access(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mobile_profile_has_field_service_access(uuid, uuid)
  to service_role;

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
    'shop_operations', 'field_service', 'fleet_maintenance', 'complete_operations'
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

revoke all on function public.apply_stripe_subscription_webhook_snapshot(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_webhook_snapshot(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;

create or replace function public.prevent_client_shop_billing_identity_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.stripe_subscription_status is distinct from old.stripe_subscription_status
    or new.stripe_trial_end is distinct from old.stripe_trial_end
    or new.stripe_current_period_end is distinct from old.stripe_current_period_end
    or new.plan is distinct from old.plan
    or new.user_limit is distinct from old.user_limit
    or new.active_user_count is distinct from old.active_user_count
    or new.billable_user_count is distinct from old.billable_user_count
    or new.stripe_billing_sync_required is distinct from old.stripe_billing_sync_required
    or new.stripe_billing_sync_error is distinct from old.stripe_billing_sync_error
    or new.stripe_billing_synced_at is distinct from old.stripe_billing_synced_at
    or new.stripe_pricing_model is distinct from old.stripe_pricing_model
    or new.subscription_package is distinct from old.subscription_package
    or new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
    or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
    or new.stripe_details_submitted is distinct from old.stripe_details_submitted
    or new.stripe_onboarding_completed is distinct from old.stripe_onboarding_completed
    or new.stripe_default_currency is distinct from old.stripe_default_currency
    or new.stripe_platform_fee_bps is distinct from old.stripe_platform_fee_bps
    or new.stripe_connect_charge_model is distinct from old.stripe_connect_charge_model
    or new.stripe_connect_dashboard_type is distinct from old.stripe_connect_dashboard_type
    or new.stripe_connect_fees_collector is distinct from old.stripe_connect_fees_collector
    or new.stripe_connect_losses_collector is distinct from old.stripe_connect_losses_collector
    or new.billing_entitlement_override is distinct from old.billing_entitlement_override
    or new.billing_grace_until is distinct from old.billing_grace_until
    or new.billing_entitlement_updated_at is distinct from old.billing_entitlement_updated_at
  ) then
    raise exception using
      errcode = '42501',
      message = 'shop billing, payment, and entitlement fields are server managed';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_client_shop_billing_identity_write()
  from public, anon, authenticated;
grant execute on function public.prevent_client_shop_billing_identity_write()
  to service_role;

notify pgrst, 'reload schema';

commit;
