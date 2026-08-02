begin;

-- The AI action-event table exists in production and in the canonical AI
-- substrate SQL, but it was absent from the ordered migration chain. Restore
-- it before the operational-observability migration attaches its trigger.
create table if not exists public.ai_action_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  action_preview_id uuid references public.ai_action_previews(id) on delete set null,
  approval_id uuid references public.ai_action_approvals(id) on delete set null,
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  source text not null default 'system',
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_action_events_event_type_nonempty
    check (length(btrim(event_type)) > 0)
);

comment on table public.ai_action_events is
  'Append-only event trail for recommendation, preview, approval, and AI maintenance lifecycle events.';

create index if not exists idx_ai_action_events_shop_created
  on public.ai_action_events(shop_id, created_at desc);
create index if not exists idx_ai_action_events_recommendation
  on public.ai_action_events(recommendation_id);
create index if not exists idx_ai_action_events_preview
  on public.ai_action_events(action_preview_id);
create index if not exists idx_ai_action_events_approval
  on public.ai_action_events(approval_id);
create index if not exists idx_ai_action_events_idempotency
  on public.ai_action_events(shop_id, idempotency_key)
  where idempotency_key is not null;

alter table public.ai_action_events enable row level security;

revoke all on table public.ai_action_events from anon;
revoke all on table public.ai_action_events from authenticated;
grant select, insert on table public.ai_action_events to authenticated;
grant all on table public.ai_action_events to service_role;

drop policy if exists "service-role-manage-ai-action-events"
  on public.ai_action_events;
create policy "service-role-manage-ai-action-events"
  on public.ai_action_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_action_events_shop_select
  on public.ai_action_events;
create policy ai_action_events_shop_select
  on public.ai_action_events
  for select
  to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists ai_action_events_shop_insert
  on public.ai_action_events;
create policy ai_action_events_shop_insert
  on public.ai_action_events
  for insert
  to authenticated
  with check (shop_id = public.current_shop_id());

commit;
