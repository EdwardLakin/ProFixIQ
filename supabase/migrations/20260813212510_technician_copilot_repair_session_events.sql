begin;

create table if not exists public.repair_session_events (
  id uuid primary key default gen_random_uuid(),
  repair_session_id uuid not null references public.repair_sessions(id) on delete cascade,
  event_seq bigint not null check (event_seq > 0),
  event_type text not null,
  created_at timestamptz not null default now(),
  constraint repair_session_events_seq_unique unique (repair_session_id, event_seq)
);

commit;
