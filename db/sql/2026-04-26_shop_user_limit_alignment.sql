-- Align DB-level shop seat enforcement inputs with canonical billing semantics.
-- This fixes profile insert/upsert failures caused by stale shops.user_limit values
-- while preserving database-side seat enforcement.

-- 1) Canonical plan -> seat cap resolver (with trial + safe fallback).
create or replace function public.plan_user_limit(p_plan text, p_stripe_subscription_status text default null)
returns integer
language plpgsql
stable
as $$
declare
  v_plan text := lower(trim(coalesce(p_plan, '')));
  v_status text := lower(trim(coalesce(p_stripe_subscription_status, '')));
begin
  if v_plan in ('pro_plus', 'unlimited') then
    return 2147483647;
  end if;

  if v_plan in ('pro', 'pro50') then
    return 50;
  end if;

  if v_plan in ('starter', 'starter10', 'free', 'diy') then
    return 10;
  end if;

  if v_status = 'trialing' then
    return 10;
  end if;

  return 10;
end;
$$;

comment on function public.plan_user_limit(text, text)
is 'Canonical seat cap resolver: starter=10, pro=50, unlimited=uncapped, trial fallback=10.';

-- 2) Keep shops.user_limit in sync with canonical plan semantics so existing DB triggers
-- that enforce limits via shops.user_limit use the correct cap.
create or replace function public.sync_shop_user_limit_from_billing()
returns trigger
language plpgsql
as $$
begin
  new.user_limit := public.plan_user_limit(new.plan, new.stripe_subscription_status);
  return new;
end;
$$;

drop trigger if exists trg_sync_shop_user_limit_from_billing on public.shops;

create trigger trg_sync_shop_user_limit_from_billing
before insert or update of plan, stripe_subscription_status
on public.shops
for each row
execute function public.sync_shop_user_limit_from_billing();

-- 3) Backfill all existing shops to canonical caps.
update public.shops s
set user_limit = public.plan_user_limit(s.plan, s.stripe_subscription_status)
where coalesce(s.user_limit, -1) is distinct from public.plan_user_limit(s.plan, s.stripe_subscription_status);
