begin;

-- `plan_user_limit` is a compatibility contract used by existing dashboards,
-- imports, and schema reconciliation. The v2 billing model does not enforce
-- this value as a staff-creation cap; billable users are reconciled separately.
create or replace function public.plan_user_limit(
  p_plan text,
  p_stripe_subscription_status text
)
returns integer
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_plan text := lower(trim(coalesce(p_plan, '')));
  v_status text := lower(trim(coalesce(p_stripe_subscription_status, '')));
begin
  if v_plan in ('pro_plus', 'unlimited', 'complete_unlimited') then
    return 2147483647;
  end if;

  if v_plan = 'complete_100' then
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
set search_path = public, pg_temp
as $$
  select public.plan_user_limit(p_plan, null::text)
$$;

revoke all on function public.plan_user_limit(text, text) from public, anon, authenticated;
revoke all on function public.plan_user_limit(text) from public, anon, authenticated;
grant execute on function public.plan_user_limit(text, text) to service_role;
grant execute on function public.plan_user_limit(text) to service_role;

commit;
