begin;

create table if not exists public.repair_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  repair_session_id uuid not null references public.repair_sessions(id) on delete cascade,
  context_version bigint not null check (context_version >= 0),
  based_on_event_seq bigint not null check (based_on_event_seq >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  constraint repair_context_snapshots_version_unique unique (repair_session_id, context_version),
  constraint repair_context_snapshots_event_bounds_check check (based_on_event_seq <= context_version)
);

create index if not exists repair_context_snapshots_latest_idx
  on public.repair_context_snapshots (repair_session_id, context_version desc);

commit;
