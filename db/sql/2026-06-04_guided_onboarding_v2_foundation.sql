-- Guided Onboarding V2 foundation.
-- Additive, shop-scoped tables only. Existing onboarding/auth tables are not changed.

begin;

create table if not exists public.guided_onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'in_progress', 'completed', 'cancelled')),
  current_step_key text null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists guided_onboarding_sessions_shop_updated_idx
  on public.guided_onboarding_sessions(shop_id, updated_at desc);

create index if not exists guided_onboarding_sessions_shop_status_idx
  on public.guided_onboarding_sessions(shop_id, status);

create table if not exists public.guided_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.guided_onboarding_sessions(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  step_key text not null,
  status text not null default 'not_started' check (status in (
    'not_started',
    'asked',
    'skipped',
    'routing',
    'upload_requested',
    'uploading',
    'uploaded',
    'parsing',
    'validation_required',
    'ready_to_import',
    'importing',
    'completed',
    'failed',
    'retry_requested'
  )),
  destination_path text not null,
  highlight_key text not null,
  skipped_reason text null,
  summary jsonb not null default '{}'::jsonb,
  error text null,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (session_id, step_key)
);

create index if not exists guided_onboarding_steps_shop_session_idx
  on public.guided_onboarding_steps(shop_id, session_id);

create index if not exists guided_onboarding_steps_shop_status_idx
  on public.guided_onboarding_steps(shop_id, status);

create table if not exists public.guided_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.guided_onboarding_sessions(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  step_key text null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guided_onboarding_events_shop_session_idx
  on public.guided_onboarding_events(shop_id, session_id, created_at desc);

create index if not exists guided_onboarding_events_shop_step_idx
  on public.guided_onboarding_events(shop_id, step_key, created_at desc);

alter table public.guided_onboarding_sessions enable row level security;
alter table public.guided_onboarding_steps enable row level security;
alter table public.guided_onboarding_events enable row level security;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'guided_onboarding_sessions',
    'guided_onboarding_steps',
    'guided_onboarding_events'
  ]
  LOOP
    EXECUTE format('drop policy if exists service_role_manage_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy service_role_manage_%I on public.%I to service_role using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', tbl, tbl);
    EXECUTE format('grant all on public.%I to service_role', tbl);

    EXECUTE format('drop policy if exists guided_onboarding_owner_admin_select_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy guided_onboarding_owner_admin_select_%I on public.%I for select to authenticated using (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'', ''admin'')))', tbl, tbl, tbl);

    EXECUTE format('drop policy if exists guided_onboarding_owner_admin_insert_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy guided_onboarding_owner_admin_insert_%I on public.%I for insert to authenticated with check (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'', ''admin'')))', tbl, tbl, tbl);

    EXECUTE format('drop policy if exists guided_onboarding_owner_admin_update_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy guided_onboarding_owner_admin_update_%I on public.%I for update to authenticated using (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'', ''admin''))) with check (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'', ''admin'')))', tbl, tbl, tbl, tbl);

    EXECUTE format('grant select, insert, update on public.%I to authenticated', tbl);
  END LOOP;
END $$;

commit;
