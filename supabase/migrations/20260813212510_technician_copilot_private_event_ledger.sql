-- Technician CoPilot V2 phase 1: ordered repair-event ledger.

begin;

create table if not exists copilot.repair_session_events (
  id uuid primary key default gen_random_uuid(),
  repair_session_id uuid not null references copilot.repair_sessions(id) on delete cascade,
  event_seq bigint not null check (event_seq > 0),
  event_type text not null check (char_length(btrim(event_type)) between 1 and 120),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint repair_session_events_seq_unique unique (repair_session_id, event_seq)
);

create table if not exists copilot.repair_session_event_context (
  event_id uuid primary key references copilot.repair_session_events(id) on delete cascade,
  operation_id uuid not null unique,
  origin text not null check (origin in ('voice', 'ui', 'system', 'offline', 'integration', 'copilot')),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object')
    check (octet_length(details::text) <= 262144)
);

create index if not exists repair_session_events_timeline_idx
  on copilot.repair_session_events (repair_session_id, event_seq);

commit;
