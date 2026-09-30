begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- The internal demo shop (billing_entitlement_override = 'internal_demo') is
-- not a paying tenant; seat-limit enforcement exists to protect subscription
-- billing integrity, which does not apply to it. Every other demo-shop code
-- path already gates on this exact field (see resolveDemoShopOrFail() in
-- features/ops/server/demoAccess.ts and createDemoProspect()'s shop check),
-- but these two profiles triggers never granted the same exemption, so
-- approving a demo access request once the shop reaches its plan's included
-- seat count (10 for 'starter') fails with PLAN_USER_LIMIT_REACHED /
-- "Shop user limit reached" -- a hard block never intended for this shop.

create or replace function public.enforce_shop_user_limit()
returns trigger
language plpgsql
set search_path = 'public, extensions, pg_temp'
as $$
declare
  v_plan text;
  v_override text;
  v_limit integer;
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

  select coalesce(s.plan, 'starter'), s.billing_entitlement_override
    into v_plan, v_override
  from public.shops s
  where s.id = v_target_shop;

  if v_override = 'internal_demo' then
    return new;
  end if;

  v_limit := public.plan_user_limit(v_plan);

  -- unlimited plans
  if v_limit is null then
    return new;
  end if;

  v_count := public.shop_staff_user_count(v_target_shop);

  -- v_count is current count; adding this row would exceed if >= limit
  if v_count >= v_limit then
    raise exception
      'PLAN_USER_LIMIT_REACHED: plan=% max=%',
      lower(v_plan),
      v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.tg_profiles_enforce_shop_user_limit()
returns trigger
language plpgsql
set search_path = 'public, extensions, pg_temp'
as $$
declare
  v_max int;
  v_override text;
  v_count int;
begin
  if new.shop_id is null then
    return new;
  end if;

  -- Allow owner bootstrap/owner reassignment without tripping staff seat limits.
  if coalesce(new.role, '') = 'owner' then
    return new;
  end if;

  select coalesce(max_users, 1), billing_entitlement_override
    into v_max, v_override
  from public.shops
  where id = new.shop_id;

  if v_override = 'internal_demo' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.shop_id = new.shop_id then
    select count(*)
      into v_count
    from public.profiles
    where shop_id = new.shop_id
      and id <> new.id;
  else
    select count(*)
      into v_count
    from public.profiles
    where shop_id = new.shop_id;
  end if;

  if v_count >= v_max then
    raise exception 'Shop user limit reached'
      using errcode = '23514',
            detail = 'This shop has reached its allowed user limit for the current plan.';
  end if;

  return new;
end;
$$;

-- A third, independent layer hits the same wall: profixiq_mark_shop_billing_sync()
-- recalculates shops.active_user_count from the live profile count on every
-- profiles insert/update/delete, and shops_active_user_count_le_max_users
-- (a plain CHECK constraint on public.shops, unrelated to the two triggers
-- above) rejects that recalculation once active_user_count would exceed the
-- plan's max_users -- with no demo-shop exemption either. Fixing it here
-- directly on the constraint, rather than chasing it through max_users
-- (a GENERATED column derived from shops.user_limit, itself only re-synced
-- from the plan by a trigger that never fires for a plain profiles change),
-- keeps this a single, minimal, and future-proof exemption regardless of
-- how max_users is computed.
--
-- This constraint exists on canonical production but was never captured by
-- an earlier migration (the same class of untracked production drift noted
-- in 20260804052000_narrow_profile_user_count_trigger.sql), so a clean
-- replay never creates it -- "if exists" makes this migration promote it
-- into the baseline there while still safely replacing the live one.
alter table public.shops
  drop constraint if exists shops_active_user_count_le_max_users;

alter table public.shops
  add constraint shops_active_user_count_le_max_users
  check (
    coalesce(active_user_count, 0) <= coalesce(max_users, 1)
    or billing_entitlement_override = 'internal_demo'
  );

commit;
