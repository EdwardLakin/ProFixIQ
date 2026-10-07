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

create unique index if not exists marketing_events_checkout_started_attempt_uidx
  on public.marketing_events (checkout_attempt_id)
  where event_name = 'checkout_started'
    and checkout_attempt_id is not null;
