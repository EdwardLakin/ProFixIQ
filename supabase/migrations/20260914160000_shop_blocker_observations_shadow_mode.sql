-- Phase 3 of the dashboard assistant plan: a scheduled, shop-wide blocker
-- observer that persists durable, deduplicated findings for later
-- evaluation. This table is intentionally internal-only ("shadow mode"):
-- no application role can read, write, or is granted access to it yet, and
-- nothing in this migration surfaces it to any existing assistant/dashboard
-- read path. Only the service-role cron job (features/operations/server/
-- syncShopBlockerObservations.ts) touches it. It does not mutate any shop
-- workflow state.

create table if not exists public.shop_blocker_observations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fingerprint text not null,
  code text not null,
  level text not null,
  title text not null,
  message text not null,
  href text,
  entity_type text,
  entity_id text,
  -- The specific rule inputs that fired this finding (thresholds, counts,
  -- ages, etc.), so a later false-positive review does not have to
  -- reconstruct "why" from the title/message strings alone.
  reason jsonb not null default '{}'::jsonb,
  status text not null default 'active'::text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Left null until a human reviews this finding for accuracy. No UI writes
  -- these columns yet; they exist so that capability can be added later
  -- without another migration.
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  is_false_positive boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_blocker_observations_shop_fingerprint_key
    unique (shop_id, fingerprint),
  constraint shop_blocker_observations_code_chk
    check (length(btrim(code)) > 0),
  constraint shop_blocker_observations_level_chk
    check (level = any (array['info'::text, 'warning'::text, 'critical'::text])),
  constraint shop_blocker_observations_title_chk
    check (length(btrim(title)) > 0),
  constraint shop_blocker_observations_message_chk
    check (length(btrim(message)) > 0),
  constraint shop_blocker_observations_status_chk
    check (status = any (array['active'::text, 'resolved'::text])),
  constraint shop_blocker_observations_resolved_requires_timestamp_chk
    check (status <> 'resolved'::text or resolved_at is not null),
  constraint shop_blocker_observations_review_requires_timestamp_chk
    check (is_false_positive is null or reviewed_at is not null)
);

create index if not exists shop_blocker_observations_shop_status_idx
  on public.shop_blocker_observations (shop_id, status, last_seen_at desc);

create index if not exists shop_blocker_observations_unreviewed_idx
  on public.shop_blocker_observations (shop_id, status)
  where reviewed_at is null;

-- Reuse the existing generic updated_at trigger helper rather than defining
-- another copy of the same logic.
drop trigger if exists shop_blocker_observations_set_updated_at
  on public.shop_blocker_observations;
create trigger shop_blocker_observations_set_updated_at
before update on public.shop_blocker_observations
for each row execute function public.shop_assistant_set_updated_at();

alter table public.shop_blocker_observations enable row level security;
revoke all on table public.shop_blocker_observations from anon, authenticated;
grant all on table public.shop_blocker_observations to service_role;
