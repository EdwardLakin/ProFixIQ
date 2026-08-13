begin;

create table if not exists public.repair_session_event_context (
  event_id uuid primary key references public.repair_session_events(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  origin text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint repair_session_event_context_origin_check
    check (origin in ('voice', 'ui', 'system', 'offline', 'integration', 'copilot')),
  constraint repair_session_event_context_details_check
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 262144),
  constraint repair_session_event_context_operation_unique
    unique (event_id, operation_id)
);

create index if not exists repair_session_event_context_operation_idx
  on public.repair_session_event_context (operation_id);

commit;
