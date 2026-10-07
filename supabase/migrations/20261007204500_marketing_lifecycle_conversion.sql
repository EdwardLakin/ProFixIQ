begin;

-- Lifecycle conversion measurement is observational only. The canonical
-- acquisition and guided-onboarding flows call these additive service-role
-- adapters after their own authoritative state transitions. No trigger is
-- attached to a pre-existing shared lifecycle table.
create unique index if not exists marketing_events_lifecycle_attempt_uidx
  on public.marketing_events (event_name, checkout_attempt_id)
  where event_name in ('signup_completed', 'onboarding_completed')
    and checkout_attempt_id is not null;

create or replace function public.record_marketing_signup_completed(
  p_intent_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_intent record;
  v_attempt_id uuid;
  v_user_created_at timestamptz;
  v_checkout record;
begin
  select i.request_key, i.created_at
    into v_intent
  from private.stripe_acquisition_intents as i
  where i.id = p_intent_id
    and i.status = 'claimed'
    and i.claimed_user_id = p_user_id;

  if not found then
    return false;
  end if;

  select u.created_at
    into v_user_created_at
  from auth.users as u
  where u.id = p_user_id;

  -- Existing accounts can claim a completed acquisition. Count signup only
  -- when this auth identity was actually created after the acquisition began.
  if v_user_created_at is null or v_user_created_at < v_intent.created_at then
    return false;
  end if;

  if v_intent.request_key !~* '^acq:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_attempt_id := substring(v_intent.request_key from 5)::uuid;

  select me.package_key, me.interval, me.checkout_mode
    into v_checkout
  from public.marketing_events as me
  where me.event_name = 'checkout_started'
    and me.checkout_attempt_id = v_attempt_id
  order by me.created_at asc
  limit 1;

  if not found then
    return false;
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

  return true;
exception
  when others then
    raise warning 'marketing signup lifecycle capture failed [%]', sqlstate;
    return false;
end;
$function$;

alter function public.record_marketing_signup_completed(uuid, uuid)
  owner to postgres;
revoke all on function public.record_marketing_signup_completed(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_marketing_signup_completed(uuid, uuid)
  to service_role;

create or replace function public.record_marketing_onboarding_completed(
  p_session_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_session record;
  v_intent record;
  v_attempt_id uuid;
  v_signup record;
begin
  select s.created_by, s.status
    into v_session
  from public.guided_onboarding_sessions as s
  where s.id = p_session_id
    and s.shop_id = p_shop_id;

  if not found or v_session.status <> 'completed' then
    return false;
  end if;

  -- Prefer the durable claimed-shop binding. A newly created owner can claim
  -- checkout before a shop exists, so allow the session creator to bind the
  -- still-null claimed_shop_id without consulting mutable Stripe billing state.
  for v_intent in
    select i.request_key
    from private.stripe_acquisition_intents as i
    where i.status = 'claimed'
      and (
        i.claimed_shop_id = p_shop_id
        or (
          i.claimed_shop_id is null
          and v_session.created_by is not null
          and i.claimed_user_id = v_session.created_by
        )
      )
    order by
      case when i.claimed_shop_id = p_shop_id then 0 else 1 end,
      i.claimed_at desc nulls last,
      i.created_at desc
  loop
    if v_intent.request_key !~* '^acq:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      continue;
    end if;

    v_attempt_id := substring(v_intent.request_key from 5)::uuid;

    -- A downstream onboarding conversion is only valid for an acquisition
    -- that already produced the authoritative new-account signup event.
    select me.package_key, me.interval, me.checkout_mode
      into v_signup
    from public.marketing_events as me
    where me.event_name = 'signup_completed'
      and me.checkout_attempt_id = v_attempt_id
    order by me.created_at asc
    limit 1;

    if found then
      exit;
    end if;
    v_attempt_id := null;
  end loop;

  if v_attempt_id is null then
    return false;
  end if;

  insert into public.marketing_events (
    event_name,
    package_key,
    interval,
    checkout_mode,
    checkout_attempt_id
  ) values (
    'onboarding_completed',
    v_signup.package_key,
    v_signup.interval,
    v_signup.checkout_mode,
    v_attempt_id
  )
  on conflict do nothing;

  return true;
exception
  when others then
    raise warning 'marketing onboarding lifecycle capture failed [%]', sqlstate;
    return false;
end;
$function$;

alter function public.record_marketing_onboarding_completed(uuid, uuid)
  owner to postgres;
revoke all on function public.record_marketing_onboarding_completed(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_marketing_onboarding_completed(uuid, uuid)
  to service_role;

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
