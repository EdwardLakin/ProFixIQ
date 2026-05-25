BEGIN;

-- Resolve function-call ambiguity introduced when a 2-arg overload gained a default value
-- while a legacy 1-arg overload may still exist in some environments.
--
-- Canonical behavior is preserved in the 2-arg form, but we explicitly remove its default
-- and keep a 1-arg wrapper so both call styles remain deterministic.

create or replace function public.plan_user_limit(
  p_plan text,
  p_stripe_subscription_status text
)
returns integer
language plpgsql
stable
as $$
declare
  v_plan text := lower(trim(coalesce(p_plan, '')));
  v_status text := lower(trim(coalesce(p_stripe_subscription_status, '')));
begin
  if v_plan in ('pro_plus', 'unlimited', 'complete_unlimited') then
    return 2147483647;
  end if;

  if v_plan in ('complete_100') then
    return 100;
  end if;

  if v_plan in ('pro', 'pro50', 'complete_50') then
    return 50;
  end if;

  if v_plan in ('starter', 'starter10', 'free', 'diy', 'complete_10') then
    return 10;
  end if;

  if v_status = 'trialing' then
    return 10;
  end if;

  return 10;
end;
$$;

create or replace function public.plan_user_limit(p_plan text)
returns integer
language sql
stable
as $$
  select public.plan_user_limit(p_plan, null::text)
$$;

comment on function public.plan_user_limit(text, text)
is 'Canonical seat-cap resolver (2-arg, no default) to avoid ambiguous resolution with 1-arg overloads.';

comment on function public.plan_user_limit(text)
is 'Compatibility wrapper delegating to public.plan_user_limit(text, text) with null subscription status.';

COMMIT;
