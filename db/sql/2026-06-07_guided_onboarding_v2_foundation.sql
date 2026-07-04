-- Guided Onboarding v2 foundation
-- Additive, shop-scoped tables for the optional owner/admin guided setup control room.

create table if not exists public.guided_onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by uuid references auth.users(id),
  status text not null default 'active',
  current_step_key text,
  existing_system text,
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.guided_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.guided_onboarding_sessions(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  step_key text not null,
  destination_path text not null,
  title text not null,
  question text not null,
  description text not null default '',
  highlight_key text not null default 'default',
  status text not null default 'not_started',
  answer jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(session_id, step_key)
);

create table if not exists public.guided_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.guided_onboarding_sessions(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  step_key text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists guided_onboarding_sessions_shop_id_idx on public.guided_onboarding_sessions(shop_id);
create index if not exists guided_onboarding_sessions_status_idx on public.guided_onboarding_sessions(status);
create index if not exists guided_onboarding_sessions_current_step_key_idx on public.guided_onboarding_sessions(current_step_key);

create index if not exists guided_onboarding_steps_shop_id_idx on public.guided_onboarding_steps(shop_id);
create index if not exists guided_onboarding_steps_session_id_idx on public.guided_onboarding_steps(session_id);
create index if not exists guided_onboarding_steps_status_idx on public.guided_onboarding_steps(status);
create index if not exists guided_onboarding_steps_step_key_idx on public.guided_onboarding_steps(step_key);

create index if not exists guided_onboarding_events_shop_id_idx on public.guided_onboarding_events(shop_id);
create index if not exists guided_onboarding_events_session_id_idx on public.guided_onboarding_events(session_id);
create index if not exists guided_onboarding_events_step_key_idx on public.guided_onboarding_events(step_key);
create index if not exists guided_onboarding_events_event_type_idx on public.guided_onboarding_events(event_type);

alter table public.guided_onboarding_steps
  add column if not exists destination_path text;
alter table public.guided_onboarding_steps
  add column if not exists title text;
alter table public.guided_onboarding_steps
  add column if not exists question text;
alter table public.guided_onboarding_steps
  add column if not exists description text not null default '';
alter table public.guided_onboarding_steps
  add column if not exists highlight_key text;

update public.guided_onboarding_steps
set
  destination_path = coalesce(destination_path, '/dashboard/onboarding-v2'),
  title = coalesce(title, step_key),
  question = coalesce(question, 'Continue this guided setup step.'),
  description = coalesce(description, ''),
  highlight_key = coalesce(highlight_key, step_key, 'default')
where destination_path is null
  or title is null
  or question is null
  or description is null
  or highlight_key is null;

alter table public.guided_onboarding_steps
  alter column destination_path set not null,
  alter column title set not null,
  alter column question set not null,
  alter column highlight_key set not null;

alter table public.guided_onboarding_sessions enable row level security;
alter table public.guided_onboarding_steps enable row level security;
alter table public.guided_onboarding_events enable row level security;

drop policy if exists guided_onboarding_sessions_shop_select
  on public.guided_onboarding_sessions;

create policy guided_onboarding_sessions_shop_select
  on public.guided_onboarding_sessions
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_sessions.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );

drop policy if exists guided_onboarding_sessions_shop_insert
  on public.guided_onboarding_sessions;

create policy guided_onboarding_sessions_shop_insert
  on public.guided_onboarding_sessions
  for insert to authenticated
  with check (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_sessions.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );

drop policy if exists guided_onboarding_sessions_shop_update
  on public.guided_onboarding_sessions;

create policy guided_onboarding_sessions_shop_update
  on public.guided_onboarding_sessions
  for update to authenticated
  using (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_sessions.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  )
  with check (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_sessions.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );

drop policy if exists guided_onboarding_steps_shop_select
  on public.guided_onboarding_steps;

create policy guided_onboarding_steps_shop_select
  on public.guided_onboarding_steps
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_steps.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );

drop policy if exists guided_onboarding_steps_shop_insert
  on public.guided_onboarding_steps;

create policy guided_onboarding_steps_shop_insert
  on public.guided_onboarding_steps
  for insert to authenticated
  with check (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_steps.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );

drop policy if exists guided_onboarding_steps_shop_update
  on public.guided_onboarding_steps;

create policy guided_onboarding_steps_shop_update
  on public.guided_onboarding_steps
  for update to authenticated
  using (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_steps.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  )
  with check (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_steps.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );

drop policy if exists guided_onboarding_events_shop_select
  on public.guided_onboarding_events;

create policy guided_onboarding_events_shop_select
  on public.guided_onboarding_events
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_events.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );

drop policy if exists guided_onboarding_events_shop_insert
  on public.guided_onboarding_events;

create policy guided_onboarding_events_shop_insert
  on public.guided_onboarding_events
  for insert to authenticated
  with check (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = guided_onboarding_events.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );

drop policy if exists service_role_manage_guided_onboarding_sessions
  on public.guided_onboarding_sessions;

create policy service_role_manage_guided_onboarding_sessions
  on public.guided_onboarding_sessions
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists service_role_manage_guided_onboarding_steps
  on public.guided_onboarding_steps;

create policy service_role_manage_guided_onboarding_steps
  on public.guided_onboarding_steps
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists service_role_manage_guided_onboarding_events
  on public.guided_onboarding_events;

create policy service_role_manage_guided_onboarding_events
  on public.guided_onboarding_events
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
