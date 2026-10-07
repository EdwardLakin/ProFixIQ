create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_name text not null check (event_name in (
    'marketing_trial_click',
    'marketing_demo_click',
    'marketing_subscribe_click',
    'pricing_view',
    'checkout_started',
    'signup_completed',
    'onboarding_completed'
  )),
  source_path text,
  destination text,
  package_key text,
  interval text check (interval is null or interval in ('monthly', 'yearly')),
  checkout_mode text check (checkout_mode is null or checkout_mode in ('trial', 'paid')),
  checkout_attempt_id uuid,
  anonymous_session_id uuid
);

alter table public.marketing_events enable row level security;

revoke all on table public.marketing_events from anon, authenticated;

create index if not exists marketing_events_created_at_idx
  on public.marketing_events (created_at desc);

create index if not exists marketing_events_event_name_created_at_idx
  on public.marketing_events (event_name, created_at desc);

create index if not exists marketing_events_source_path_created_at_idx
  on public.marketing_events (source_path, created_at desc);

-- Record checkout_started only after the server has successfully attached a
-- real Stripe Checkout Session to the acquisition intent. This keeps the
-- conversion event out of the anonymous collector and makes the existing
-- acquisition intent row the authoritative boundary. Package/mode attribution
-- remains joinable through checkout_attempt_id from the preceding intent event.
create or replace function public.attach_stripe_acquisition_checkout(
  p_intent_id uuid,
  p_nonce text,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_attached boolean;
  v_request_key text;
begin
  if p_checkout_session_id is null or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$' then
    return false;
  end if;

  update private.stripe_acquisition_intents
  set stripe_checkout_session_id = p_checkout_session_id,
      status = case when status = 'pending' then 'checkout_created' else status end,
      updated_at = now()
  where id = p_intent_id
    and nonce = p_nonce
    and expires_at > now()
    and status in ('pending', 'checkout_created', 'completed', 'claimed')
    and (stripe_checkout_session_id is null or stripe_checkout_session_id = p_checkout_session_id)
  returning true, request_key into v_attached, v_request_key;

  if coalesce(v_attached, false)
     and v_request_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and not exists (
       select 1
       from public.marketing_events
       where event_name = 'checkout_started'
         and checkout_attempt_id = v_request_key::uuid
     ) then
    insert into public.marketing_events (
      event_name,
      destination,
      checkout_attempt_id
    )
    values (
      'checkout_started',
      'stripe_checkout',
      v_request_key::uuid
    );
  end if;

  return coalesce(v_attached, false);
end;
$$;
