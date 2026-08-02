begin;

alter table public.shops
  add column if not exists billable_user_count integer not null default 0,
  add column if not exists stripe_billing_sync_required boolean not null default true,
  add column if not exists stripe_billing_sync_error text,
  add column if not exists stripe_billing_synced_at timestamptz,
  add column if not exists stripe_pricing_model text not null default 'legacy',
  add column if not exists stripe_connect_charge_model text,
  add column if not exists stripe_connect_dashboard_type text,
  add column if not exists stripe_connect_fees_collector text,
  add column if not exists stripe_connect_losses_collector text;

alter table public.shops
  drop constraint if exists shops_billable_user_count_check,
  add constraint shops_billable_user_count_check check (billable_user_count >= 0),
  drop constraint if exists shops_stripe_pricing_model_check,
  add constraint shops_stripe_pricing_model_check
    check (stripe_pricing_model in ('legacy', 'base_plus_seats_v2')),
  drop constraint if exists shops_stripe_connect_charge_model_check,
  add constraint shops_stripe_connect_charge_model_check
    check (stripe_connect_charge_model is null or stripe_connect_charge_model in ('direct', 'destination', 'legacy')),
  drop constraint if exists shops_stripe_connect_dashboard_type_check,
  add constraint shops_stripe_connect_dashboard_type_check
    check (stripe_connect_dashboard_type is null or stripe_connect_dashboard_type in ('full', 'express', 'none')),
  drop constraint if exists shops_stripe_connect_fees_collector_check,
  add constraint shops_stripe_connect_fees_collector_check
    check (stripe_connect_fees_collector is null or stripe_connect_fees_collector in ('stripe', 'application')),
  drop constraint if exists shops_stripe_connect_losses_collector_check,
  add constraint shops_stripe_connect_losses_collector_check
    check (stripe_connect_losses_collector is null or stripe_connect_losses_collector in ('stripe', 'application'));

create table if not exists public.shop_payment_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  portal_payments_enabled boolean not null default false,
  default_currency text not null default 'cad',
  platform_fee_bps integer not null default 0,
  allow_partial_payments boolean not null default false,
  minimum_payment_cents integer not null default 50,
  default_deposit_percent numeric(5,2) not null default 0,
  require_payment_before_release boolean not null default false,
  receipt_email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_payment_settings_currency_check check (default_currency in ('cad', 'usd')),
  constraint shop_payment_settings_platform_fee_check check (platform_fee_bps between 0 and 1000),
  constraint shop_payment_settings_minimum_payment_check check (minimum_payment_cents >= 50),
  constraint shop_payment_settings_deposit_check check (default_deposit_percent between 0 and 100)
);

create table if not exists public.billing_discount_grants (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  discount_class text not null,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  percent_off numeric(5,2),
  duration text not null,
  duration_in_months integer,
  status text not null default 'active',
  approved_by uuid references auth.users(id) on delete set null,
  terms_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint billing_discount_grants_class_check
    check (discount_class in ('founder', 'beta', 'extended_beta', 'referral', 'lifetime_discount', 'lifetime_access', 'internal')),
  constraint billing_discount_grants_duration_check
    check (duration in ('once', 'repeating', 'forever')),
  constraint billing_discount_grants_status_check
    check (status in ('active', 'redeemed', 'revoked', 'expired')),
  constraint billing_discount_grants_percent_check
    check (percent_off is null or percent_off between 0 and 100),
  constraint billing_discount_grants_months_check
    check (duration_in_months is null or duration_in_months > 0)
);

create index if not exists billing_discount_grants_shop_idx
  on public.billing_discount_grants(shop_id, status, created_at desc);

alter table public.shop_payment_settings enable row level security;
alter table public.billing_discount_grants enable row level security;

drop policy if exists shop_payment_settings_select_shop_managers on public.shop_payment_settings;
create policy shop_payment_settings_select_shop_managers
  on public.shop_payment_settings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.shop_id = shop_payment_settings.shop_id
        and lower(coalesce(p.role::text, '')) in ('owner', 'admin', 'manager', 'advisor')
    )
  );

drop policy if exists billing_discount_grants_select_shop_admins on public.billing_discount_grants;
create policy billing_discount_grants_select_shop_admins
  on public.billing_discount_grants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.shop_id = billing_discount_grants.shop_id
        and lower(coalesce(p.role::text, '')) in ('owner', 'admin')
    )
  );

revoke all on table public.shop_payment_settings from anon;
revoke insert, update, delete, truncate, references, trigger on table public.shop_payment_settings from authenticated;
grant select on table public.shop_payment_settings to authenticated;

revoke all on table public.billing_discount_grants from anon;
revoke insert, update, delete, truncate, references, trigger on table public.billing_discount_grants from authenticated;
grant select on table public.billing_discount_grants to authenticated;

create or replace function public.set_shop_payment_settings_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_shop_payment_settings_updated_at() from public;

 drop trigger if exists shop_payment_settings_set_updated_at on public.shop_payment_settings;
create trigger shop_payment_settings_set_updated_at
before update on public.shop_payment_settings
for each row execute function public.set_shop_payment_settings_updated_at();

create or replace function public.refresh_shop_billable_user_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_shop_id uuid;
  v_count integer;
begin
  if tg_op = 'DELETE' then
    v_shop_id := old.shop_id;
  else
    v_shop_id := new.shop_id;
  end if;

  if v_shop_id is not null then
    select count(*)::integer
      into v_count
      from public.profiles p
     where p.shop_id = v_shop_id;

    update public.shops
       set billable_user_count = v_count,
           active_user_count = v_count,
           stripe_billing_sync_required = true,
           stripe_billing_sync_error = null
     where id = v_shop_id;
  end if;

  if tg_op = 'UPDATE' and old.shop_id is distinct from new.shop_id and old.shop_id is not null then
    select count(*)::integer
      into v_count
      from public.profiles p
     where p.shop_id = old.shop_id;

    update public.shops
       set billable_user_count = v_count,
           active_user_count = v_count,
           stripe_billing_sync_required = true,
           stripe_billing_sync_error = null
     where id = old.shop_id;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.refresh_shop_billable_user_count() from public;

 drop trigger if exists profiles_refresh_shop_billable_user_count on public.profiles;
create trigger profiles_refresh_shop_billable_user_count
after insert or delete or update of shop_id on public.profiles
for each row execute function public.refresh_shop_billable_user_count();

with counts as (
  select s.id as shop_id, count(p.id)::integer as billable_user_count
  from public.shops s
  left join public.profiles p on p.shop_id = s.id
  group by s.id
)
update public.shops s
   set billable_user_count = counts.billable_user_count,
       active_user_count = counts.billable_user_count,
       stripe_billing_sync_required = true
  from counts
 where s.id = counts.shop_id;

insert into public.shop_payment_settings (
  shop_id,
  default_currency,
  platform_fee_bps,
  portal_payments_enabled
)
select
  s.id,
  case when lower(coalesce(s.stripe_default_currency, 'cad')) = 'usd' then 'usd' else 'cad' end,
  greatest(0, least(1000, coalesce(s.stripe_platform_fee_bps, 0))),
  coalesce(s.stripe_onboarding_completed, false)
from public.shops s
on conflict (shop_id) do nothing;

create or replace function public.prevent_client_shop_billing_identity_write()
returns trigger
language plpgsql
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
    or new.max_users is distinct from old.max_users
    or new.active_user_count is distinct from old.active_user_count
    or new.billable_user_count is distinct from old.billable_user_count
    or new.stripe_billing_sync_required is distinct from old.stripe_billing_sync_required
    or new.stripe_billing_sync_error is distinct from old.stripe_billing_sync_error
    or new.stripe_billing_synced_at is distinct from old.stripe_billing_synced_at
    or new.stripe_pricing_model is distinct from old.stripe_pricing_model
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
  ) then
    raise exception using errcode = '42501', message = 'shop billing and payment fields are server managed';
  end if;
  return new;
end;
$$;

create or replace function public.plan_user_limit(p_plan text, p_stripe_subscription_status text)
returns integer
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_plan text := lower(trim(coalesce(p_plan, '')));
  v_status text := lower(trim(coalesce(p_stripe_subscription_status, '')));
begin
  if v_status in ('active', 'trialing') and v_plan in (
    'starter', 'starter10', 'free', 'diy', 'complete_10',
    'pro', 'pro50', 'complete_50', 'complete_100',
    'pro_plus', 'unlimited', 'complete_unlimited'
  ) then
    return 2147483647;
  end if;

  if v_plan in ('pro_plus', 'unlimited', 'complete_unlimited') then
    return 2147483647;
  end if;

  return 10;
end;
$$;

commit;
