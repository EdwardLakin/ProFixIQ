-- Technician CoPilot V2 phase 2: server command envelope.
-- RLS is intentionally enabled with no browser policies.

begin;

create table if not exists public.copilot_server_commands (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  action text not null check (action in ('session.read', 'session.start', 'event.append')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint copilot_server_commands_payload_check
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 262144)
);

alter table public.copilot_server_commands enable row level security;

create index if not exists copilot_server_commands_created_at_idx
  on public.copilot_server_commands (created_at desc);

comment on table public.copilot_server_commands is
  'Server-only Technician CoPilot command envelope. RLS intentionally has no client policies.';

commit;
