begin;

-- The canonical AI operating-intelligence substrate existed in production and
-- in db/sql, but was absent from the ordered Supabase migration chain. Restore
-- the complete dependency graph before operational-observability migrations
-- attach triggers and create health projections.
create table if not exists public.ai_evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  subject_type text not null,
  subject_id uuid,
  domain text not null,
  evidence_kind text not null,
  snapshot jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  missing_data jsonb not null default '[]'::jsonb,
  freshness_at timestamptz,
  confidence numeric(5,4),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_evidence_snapshots_subject_type_nonempty
    check (length(btrim(subject_type)) > 0),
  constraint ai_evidence_snapshots_domain_nonempty
    check (length(btrim(domain)) > 0),
  constraint ai_evidence_snapshots_kind_nonempty
    check (length(btrim(evidence_kind)) > 0),
  constraint ai_evidence_snapshots_confidence_chk
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  domain text not null,
  recommendation_type text not null,
  subject_type text not null,
  subject_id uuid,
  title text not null,
  summary text,
  status text not null default 'open',
  priority text not null default 'normal',
  confidence numeric(5,4),
  risk_tier text not null default 'low',
  evidence_snapshot_id uuid references public.ai_evidence_snapshots(id) on delete set null,
  evidence_snapshot_ids uuid[] not null default '{}',
  missing_data jsonb not null default '[]'::jsonb,
  recommended_action jsonb not null default '{}'::jsonb,
  side_effects jsonb not null default '[]'::jsonb,
  requires_approval boolean not null default false,
  requires_owner_pin boolean not null default false,
  source text not null default 'system',
  source_run_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  dismissed_by uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_recommendations_domain_nonempty
    check (length(btrim(domain)) > 0),
  constraint ai_recommendations_type_nonempty
    check (length(btrim(recommendation_type)) > 0),
  constraint ai_recommendations_subject_nonempty
    check (length(btrim(subject_type)) > 0),
  constraint ai_recommendations_title_nonempty
    check (length(btrim(title)) > 0),
  constraint ai_recommendations_status_chk
    check (status in ('open','acknowledged','dismissed','resolved','expired','superseded')),
  constraint ai_recommendations_priority_chk
    check (priority in ('low','normal','high','urgent')),
  constraint ai_recommendations_risk_tier_chk
    check (risk_tier in ('low','medium','high','critical')),
  constraint ai_recommendations_confidence_chk
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists public.ai_action_previews (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  domain text not null,
  action_type text not null,
  subject_type text not null,
  subject_id uuid,
  status text not null default 'draft',
  preview_payload jsonb not null default '{}'::jsonb,
  intended_mutations jsonb not null default '[]'::jsonb,
  affected_records jsonb not null default '[]'::jsonb,
  side_effects jsonb not null default '[]'::jsonb,
  compensation_plan jsonb not null default '{}'::jsonb,
  idempotency_key text,
  requires_approval boolean not null default true,
  requires_owner_pin boolean not null default false,
  risk_tier text not null default 'medium',
  evidence_snapshot_id uuid references public.ai_evidence_snapshots(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_action_previews_domain_nonempty
    check (length(btrim(domain)) > 0),
  constraint ai_action_previews_action_type_nonempty
    check (length(btrim(action_type)) > 0),
  constraint ai_action_previews_subject_nonempty
    check (length(btrim(subject_type)) > 0),
  constraint ai_action_previews_status_chk
    check (status in ('draft','ready','approval_required','approved','rejected','expired','executed','cancelled','failed')),
  constraint ai_action_previews_risk_tier_chk
    check (risk_tier in ('low','medium','high','critical'))
);

create table if not exists public.ai_action_approvals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  action_preview_id uuid not null references public.ai_action_previews(id) on delete cascade,
  status text not null default 'pending',
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  owner_pin_required boolean not null default false,
  owner_pin_verified boolean not null default false,
  owner_pin_verification_ref text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_action_approvals_status_chk
    check (status in ('pending','approved','rejected','expired','cancelled'))
);

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

comment on table public.ai_evidence_snapshots is
  'Immutable AI evidence package for recommendation and action-preview grounding.';
comment on table public.ai_recommendations is
  'Canonical AI/rule recommendation ledger with confidence and evidence links.';
comment on table public.ai_action_previews is
  'Action preview and dry-run contract; this table does not execute actions.';
comment on table public.ai_action_approvals is
  'Human approval gate records for AI action previews.';
comment on table public.ai_action_events is
  'Append-only event trail for recommendation, preview, approval, and maintenance lifecycle events.';

create index if not exists idx_ai_evidence_snapshots_shop
  on public.ai_evidence_snapshots(shop_id);
create index if not exists idx_ai_evidence_snapshots_subject
  on public.ai_evidence_snapshots(shop_id, subject_type, subject_id);
create index if not exists idx_ai_evidence_snapshots_domain
  on public.ai_evidence_snapshots(shop_id, domain, evidence_kind);
create index if not exists idx_ai_evidence_snapshots_created
  on public.ai_evidence_snapshots(shop_id, created_at desc);

create index if not exists idx_ai_recommendations_shop_status
  on public.ai_recommendations(shop_id, status, created_at desc);
create index if not exists idx_ai_recommendations_shop_domain
  on public.ai_recommendations(shop_id, domain, created_at desc);
create index if not exists idx_ai_recommendations_subject
  on public.ai_recommendations(shop_id, subject_type, subject_id);
create index if not exists idx_ai_recommendations_evidence
  on public.ai_recommendations(evidence_snapshot_id);
create index if not exists idx_ai_recommendations_expires
  on public.ai_recommendations(shop_id, expires_at)
  where expires_at is not null;

create index if not exists idx_ai_action_previews_shop_status
  on public.ai_action_previews(shop_id, status, created_at desc);
create index if not exists idx_ai_action_previews_shop_domain
  on public.ai_action_previews(shop_id, domain, created_at desc);
create index if not exists idx_ai_action_previews_subject
  on public.ai_action_previews(shop_id, subject_type, subject_id);
create index if not exists idx_ai_action_previews_recommendation
  on public.ai_action_previews(recommendation_id);
create unique index if not exists idx_ai_action_previews_idempotency
  on public.ai_action_previews(shop_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_ai_action_previews_expires
  on public.ai_action_previews(shop_id, expires_at)
  where expires_at is not null;

create index if not exists idx_ai_action_approvals_shop_status
  on public.ai_action_approvals(shop_id, status, requested_at desc);
create index if not exists idx_ai_action_approvals_preview
  on public.ai_action_approvals(action_preview_id);
create index if not exists idx_ai_action_approvals_expires
  on public.ai_action_approvals(shop_id, expires_at)
  where expires_at is not null;

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

alter table public.ai_evidence_snapshots enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.ai_action_previews enable row level security;
alter table public.ai_action_approvals enable row level security;
alter table public.ai_action_events enable row level security;

revoke all on table public.ai_evidence_snapshots from anon;
revoke all on table public.ai_recommendations from anon;
revoke all on table public.ai_action_previews from anon;
revoke all on table public.ai_action_approvals from anon;
revoke all on table public.ai_action_events from anon;

grant select, insert on table public.ai_evidence_snapshots to authenticated;
grant select, insert, update on table public.ai_recommendations to authenticated;
grant select, insert, update on table public.ai_action_previews to authenticated;
grant select, insert, update on table public.ai_action_approvals to authenticated;
grant select, insert on table public.ai_action_events to authenticated;

grant all on table public.ai_evidence_snapshots to service_role;
grant all on table public.ai_recommendations to service_role;
grant all on table public.ai_action_previews to service_role;
grant all on table public.ai_action_approvals to service_role;
grant all on table public.ai_action_events to service_role;

drop policy if exists "service-role-manage-ai-evidence-snapshots"
  on public.ai_evidence_snapshots;
create policy "service-role-manage-ai-evidence-snapshots"
  on public.ai_evidence_snapshots for all to service_role
  using (true) with check (true);

drop policy if exists "service-role-manage-ai-recommendations"
  on public.ai_recommendations;
create policy "service-role-manage-ai-recommendations"
  on public.ai_recommendations for all to service_role
  using (true) with check (true);

drop policy if exists "service-role-manage-ai-action-previews"
  on public.ai_action_previews;
create policy "service-role-manage-ai-action-previews"
  on public.ai_action_previews for all to service_role
  using (true) with check (true);

drop policy if exists "service-role-manage-ai-action-approvals"
  on public.ai_action_approvals;
create policy "service-role-manage-ai-action-approvals"
  on public.ai_action_approvals for all to service_role
  using (true) with check (true);

drop policy if exists "service-role-manage-ai-action-events"
  on public.ai_action_events;
create policy "service-role-manage-ai-action-events"
  on public.ai_action_events for all to service_role
  using (true) with check (true);

drop policy if exists ai_evidence_snapshots_shop_select
  on public.ai_evidence_snapshots;
create policy ai_evidence_snapshots_shop_select
  on public.ai_evidence_snapshots for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists ai_evidence_snapshots_shop_insert
  on public.ai_evidence_snapshots;
create policy ai_evidence_snapshots_shop_insert
  on public.ai_evidence_snapshots for insert to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists ai_recommendations_shop_select
  on public.ai_recommendations;
create policy ai_recommendations_shop_select
  on public.ai_recommendations for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists ai_recommendations_shop_insert
  on public.ai_recommendations;
create policy ai_recommendations_shop_insert
  on public.ai_recommendations for insert to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists ai_recommendations_shop_update
  on public.ai_recommendations;
create policy ai_recommendations_shop_update
  on public.ai_recommendations for update to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists ai_action_previews_shop_select
  on public.ai_action_previews;
create policy ai_action_previews_shop_select
  on public.ai_action_previews for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists ai_action_previews_shop_insert
  on public.ai_action_previews;
create policy ai_action_previews_shop_insert
  on public.ai_action_previews for insert to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists ai_action_previews_shop_update
  on public.ai_action_previews;
create policy ai_action_previews_shop_update
  on public.ai_action_previews for update to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists ai_action_approvals_shop_select
  on public.ai_action_approvals;
create policy ai_action_approvals_shop_select
  on public.ai_action_approvals for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists ai_action_approvals_shop_insert
  on public.ai_action_approvals;
create policy ai_action_approvals_shop_insert
  on public.ai_action_approvals for insert to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists ai_action_approvals_shop_update
  on public.ai_action_approvals;
create policy ai_action_approvals_shop_update
  on public.ai_action_approvals for update to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists ai_action_events_shop_select
  on public.ai_action_events;
create policy ai_action_events_shop_select
  on public.ai_action_events for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists ai_action_events_shop_insert
  on public.ai_action_events;
create policy ai_action_events_shop_insert
  on public.ai_action_events for insert to authenticated
  with check (shop_id = public.current_shop_id());

drop trigger if exists trg_ai_recommendations_updated_at
  on public.ai_recommendations;
create trigger trg_ai_recommendations_updated_at
before update on public.ai_recommendations
for each row execute function public.set_updated_at();

drop trigger if exists trg_ai_action_previews_updated_at
  on public.ai_action_previews;
create trigger trg_ai_action_previews_updated_at
before update on public.ai_action_previews
for each row execute function public.set_updated_at();

commit;
