begin;

-- Lifecycle conversion measurement is observational only. These triggers attach
-- server-authoritative acquisition and guided-onboarding transitions to the
-- existing anonymous checkout attempt key without storing user or shop ids in
-- public.marketing_events.
create unique index if not exists marketing_events_lifecycle_attempt_uidx
  on public.marketing_events (event_name, checkout_attempt_id)
  where event_name in ('signup_completed', 'onboarding_completed')
    and checkout_attempt_id is not null;

create or replace function private.capture_marketing_signup_completed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_attempt_id uuid;
  v_user_created_at timestamptz;
  v_checkout record;
begin
  if new.status <> 'claimed' or new.claimed_user_id is null then
    return new;
  end if;

  if old.status = 'claimed'
     and old.claimed_user_id is not distinct from new.claimed_user_id then
    return new;
  end if;

  select u.created_at
    into v_user_created_at
  from auth.users as u
  where u.id = new.claimed_user_id;

  -- Existing accounts can claim a completed acquisition. Count signup only
  -- when this auth identity was actually created after the acquisition began.
  if v_user_created_at is null or v_user_created_at < new.created_at then
    return new;
  end if;

  if new.request_key !~* '^acq:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;
  v_attempt_id := substring(new.request_key from 5)::uuid;

  select me.package_key, me.interval, me.checkout_mode
    into v_checkout
  from public.marketing_events as me
  where me.event_name = 'checkout_started'
    and me.checkout_attempt_id = v_attempt_id
  order by me.created_at asc
  limit 1;

  if not found then
    return new;
  end if;

  insert into public.marketing_events (
    event_name,
    package_key,
    interval,
    checkout_mode,
    checkout_attempt_id
  ) values (
    'signup_completed',
    v_checkout.package_key,
    v_checkout.interval,
    v_checkout.checkout_mode,
    v_attempt_id
  )
  on conflict do nothing;

  return new;
exception
  when others then
    raise warning 'marketing signup lifecycle capture failed [%]', sqlstate;
    return new;
end;
$function$;

alter function private.capture_marketing_signup_completed() owner to postgres;
revoke all on function private.capture_marketing_signup_completed()
  from public, anon, authenticated, service_role;

drop trigger if exists capture_marketing_signup_completed
  on private.stripe_acquisition_intents;
create trigger capture_marketing_signup_completed
after update of status, claimed_user_id
on private.stripe_acquisition_intents
for each row execute function private.capture_marketing_signup_completed();

create or replace function private.capture_marketing_onboarding_completed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_request_key text;
  v_attempt_id uuid;
  v_checkout record;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select i.request_key
    into v_request_key
  from private.stripe_acquisition_intents as i
  join public.shops as s
    on s.id = new.shop_id
   and s.stripe_checkout_session_id = i.stripe_checkout_session_id
  where i.status = 'claimed'
    and (i.claimed_shop_id = new.shop_id or i.claimed_shop_id is null)
  order by i.claimed_at asc nulls last, i.created_at asc
  limit 1;

  if v_request_key is null
     or v_request_key !~* '^acq:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;
  v_attempt_id := substring(v_request_key from 5)::uuid;

  select me.package_key, me.interval, me.checkout_mode
    into v_checkout
  from public.marketing_events as me
  where me.event_name = 'checkout_started'
    and me.checkout_attempt_id = v_attempt_id
  order by me.created_at asc
  limit 1;

  if not found then
    return new;
  end if;

  insert into public.marketing_events (
    event_name,
    package_key,
    interval,
    checkout_mode,
    checkout_attempt_id
  ) values (
    'onboarding_completed',
    v_checkout.package_key,
    v_checkout.interval,
    v_checkout.checkout_mode,
    v_attempt_id
  )
  on conflict do nothing;

  return new;
exception
  when others then
    raise warning 'marketing onboarding lifecycle capture failed [%]', sqlstate;
    return new;
end;
$function$;

alter function private.capture_marketing_onboarding_completed() owner to postgres;
revoke all on function private.capture_marketing_onboarding_completed()
  from public, anon, authenticated, service_role;

drop trigger if exists capture_marketing_onboarding_completed
  on public.guided_onboarding_sessions;
create trigger capture_marketing_onboarding_completed
after update of status
on public.guided_onboarding_sessions
for each row execute function private.capture_marketing_onboarding_completed();

-- Extend the prior acquisition snapshot without changing its contract. The
-- wrapper and lifecycle counts execute in one statement/MVCC snapshot.
create or replace function public.get_ops_marketing_lifecycle_funnel_snapshot(
  p_since timestamptz,
  p_breakdown_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with acquisition as (
    select public.get_ops_marketing_funnel_snapshot(
      p_since,
      p_breakdown_limit
    ) as snapshot
  ),
  lifecycle as (
    select
      count(*) filter (where event_name = 'signup_completed')::bigint as signup_completed,
      count(*) filter (where event_name = 'onboarding_completed')::bigint as onboarding_completed
    from public.marketing_events
    where created_at >= p_since
  )
  select a.snapshot || jsonb_build_object(
    'lifecycleSummary', jsonb_build_object(
      'signupCompleted', l.signup_completed,
      'onboardingCompleted', l.onboarding_completed
    )
  )
  from acquisition as a
  cross join lifecycle as l;
$function$;

alter function public.get_ops_marketing_lifecycle_funnel_snapshot(timestamptz, integer)
  owner to postgres;
revoke all on function public.get_ops_marketing_lifecycle_funnel_snapshot(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_ops_marketing_lifecycle_funnel_snapshot(timestamptz, integer)
  to service_role;

commit;
