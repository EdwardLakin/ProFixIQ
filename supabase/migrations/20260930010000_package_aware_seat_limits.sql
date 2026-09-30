begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Seat-limit enforcement (shops.user_limit / the GENERATED shops.max_users
-- column, and the two profiles triggers that read them) was only ever
-- computed from the legacy shops.plan field (starter/pro/unlimited/...) via
-- plan_user_limit(). It never learned about the current product-package
-- model (shops.subscription_package + stripe_pricing_model =
-- 'product_packages_v1': shop_operations, field_service, fleet_maintenance,
-- complete_operations -- see features/stripe/lib/stripe/product-packages.ts).
--
-- Confirmed live on production: two real (non-demo) shops on the
-- 'field_service' package -- a package with no seat concept at all
-- (PRODUCT_PACKAGE_PRICING.field_service.includedUsers = null; it's priced
-- by service trucks, not users) -- have max_users stuck at 10 anyway,
-- inherited from the legacy plan-based default. Neither has hit it yet
-- (each has 1 user today), but the very next staff member past 10 would
-- incorrectly fail with "Shop user limit reached".

-- Mirrors PRODUCT_PACKAGE_PRICING[*].includedUsers. Unlimited is
-- represented the same way plan_user_limit() already represents it
-- (2147483647), not null: shops.max_users is a GENERATED column whose
-- formula falls back to COALESCE(user_limit, 1) for these plans, so a null
-- user_limit would collapse max_users to 1 -- catastrophically the
-- opposite of unlimited -- instead of leaving it uncapped.
create or replace function public.product_package_user_limit(p_package_key text)
returns integer
language plpgsql
stable
set search_path = 'public, pg_temp'
as $$
declare
  v_key text := lower(trim(coalesce(p_package_key, '')));
begin
  if v_key in ('field_service', 'fleet_maintenance') then
    return 2147483647;
  end if;

  -- shop_operations, complete_operations, and any unrecognized/未-set
  -- package key all include the same 10 seats as the legacy default.
  return 10;
end;
$$;

revoke all on function public.product_package_user_limit(text) from public, anon, authenticated;
grant execute on function public.product_package_user_limit(text) to service_role;

-- Same signature, attributes, and legacy (non-package) behavior as before;
-- only now branches on stripe_pricing_model first.
create or replace function public.sync_shop_user_limit_from_billing()
returns trigger
language plpgsql
set search_path = 'public, pg_temp'
as $$
begin
  if new.stripe_pricing_model = 'product_packages_v1' then
    new.user_limit := public.product_package_user_limit(new.subscription_package);
  else
    new.user_limit := public.plan_user_limit(new.plan, new.stripe_subscription_status);
  end if;
  return new;
end;
$$;

-- Widen the trigger to also recompute when a shop's package or billing
-- model changes, not only when the legacy plan/subscription-status columns
-- do -- those are the columns package-model checkout actually writes.
drop trigger if exists trg_sync_shop_user_limit_from_billing on public.shops;

create trigger trg_sync_shop_user_limit_from_billing
before insert or update of plan, stripe_subscription_status, subscription_package, stripe_pricing_model
on public.shops
for each row
execute function public.sync_shop_user_limit_from_billing();

-- enforce_shop_user_limit() previously recomputed a limit itself from
-- shops.plan via plan_user_limit(), independently of (and inconsistently
-- with) shops.max_users -- the exact column
-- tg_profiles_enforce_shop_user_limit() already trusts, and the one the
-- fix above now keeps correctly synced for every billing model. Reading
-- max_users here too removes the second, package-blind computation
-- entirely instead of teaching it about packages separately, so there is
-- exactly one place (the sync trigger above) computing the effective
-- limit for any shop. The billing_entitlement_override = 'internal_demo'
-- exemption from the previous migration is unchanged.
create or replace function public.enforce_shop_user_limit()
returns trigger
language plpgsql
set search_path = 'public, extensions, pg_temp'
as $$
declare
  v_plan text;
  v_max integer;
  v_override text;
  v_count integer;
  v_target_shop uuid;
begin
  if tg_op = 'INSERT' then
    v_target_shop := new.shop_id;
  else
    if new.shop_id is not distinct from old.shop_id then
      return new;
    end if;
    v_target_shop := new.shop_id;
  end if;

  if v_target_shop is null then
    return new;
  end if;

  select coalesce(s.plan, 'starter'), coalesce(s.max_users, 1), s.billing_entitlement_override
    into v_plan, v_max, v_override
  from public.shops s
  where s.id = v_target_shop;

  if v_override = 'internal_demo' then
    return new;
  end if;

  v_count := public.shop_staff_user_count(v_target_shop);

  if v_count >= v_max then
    raise exception
      'PLAN_USER_LIMIT_REACHED: plan=% max=%',
      lower(v_plan),
      v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- One-time backfill: force every existing shop's user_limit/max_users to
-- recompute under the corrected logic (a plain UPDATE ... SET col = col
-- still fires an "UPDATE OF col" trigger in Postgres even though the value
-- is unchanged). Only 5 shops exist in production today; this is not a
-- bulk-data operation at any real scale.
update public.shops
set plan = plan,
    stripe_subscription_status = stripe_subscription_status,
    subscription_package = subscription_package,
    stripe_pricing_model = stripe_pricing_model;

commit;
