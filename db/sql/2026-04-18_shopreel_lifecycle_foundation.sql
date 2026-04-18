-- Canonical ShopReel lifecycle foundation: source ingestion -> opportunities -> drafts.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shopreel_opportunity_status') THEN
    CREATE TYPE public.shopreel_opportunity_status AS ENUM ('new', 'accepted', 'dismissed', 'generated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shopreel_opportunity_action') THEN
    CREATE TYPE public.shopreel_opportunity_action AS ENUM ('accepted', 'dismissed', 'generated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shopreel_draft_status') THEN
    CREATE TYPE public.shopreel_draft_status AS ENUM ('draft', 'in_review', 'approved');
  END IF;
END $$;

create table if not exists public.shopreel_story_sources (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  ingest_status text not null default 'ingested',
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, event_key)
);

create index if not exists idx_shopreel_story_sources_shop_ingested
  on public.shopreel_story_sources(shop_id, ingested_at desc);
create index if not exists idx_shopreel_story_sources_event_type
  on public.shopreel_story_sources(shop_id, event_type);

create table if not exists public.shopreel_opportunities (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  story_source_id uuid not null references public.shopreel_story_sources(id) on delete cascade,
  status public.shopreel_opportunity_status not null default 'new',
  title text not null,
  angle text,
  summary text,
  event_type text not null,
  source_occurred_at timestamptz not null,
  first_generated_at timestamptz,
  dismissed_at timestamptz,
  accepted_at timestamptz,
  generated_at timestamptz,
  acted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_source_id)
);

create index if not exists idx_shopreel_opportunities_shop_status
  on public.shopreel_opportunities(shop_id, status, created_at desc);

create table if not exists public.shopreel_opportunity_status_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  opportunity_id uuid not null references public.shopreel_opportunities(id) on delete cascade,
  previous_status public.shopreel_opportunity_status,
  next_status public.shopreel_opportunity_status not null,
  action public.shopreel_opportunity_action,
  note text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_shopreel_opportunity_history_shop
  on public.shopreel_opportunity_status_history(shop_id, changed_at desc);

create table if not exists public.shopreel_drafts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  opportunity_id uuid not null references public.shopreel_opportunities(id) on delete cascade,
  status public.shopreel_draft_status not null default 'draft',
  title text not null,
  angle text,
  script text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);

create index if not exists idx_shopreel_drafts_shop_status
  on public.shopreel_drafts(shop_id, status, updated_at desc);

alter table public.shopreel_story_sources enable row level security;
alter table public.shopreel_opportunities enable row level security;
alter table public.shopreel_opportunity_status_history enable row level security;
alter table public.shopreel_drafts enable row level security;

-- Service role management policies.
DROP POLICY IF EXISTS "service-role-manage-shopreel-story-sources" ON public.shopreel_story_sources;
CREATE POLICY "service-role-manage-shopreel-story-sources"
  ON public.shopreel_story_sources
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service-role-manage-shopreel-opportunities" ON public.shopreel_opportunities;
CREATE POLICY "service-role-manage-shopreel-opportunities"
  ON public.shopreel_opportunities
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service-role-manage-shopreel-opportunity-history" ON public.shopreel_opportunity_status_history;
CREATE POLICY "service-role-manage-shopreel-opportunity-history"
  ON public.shopreel_opportunity_status_history
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service-role-manage-shopreel-drafts" ON public.shopreel_drafts;
CREATE POLICY "service-role-manage-shopreel-drafts"
  ON public.shopreel_drafts
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Owner read/write policies for canonical lifecycle UI + APIs.
DROP POLICY IF EXISTS "owner-read-shopreel-story-sources" ON public.shopreel_story_sources;
CREATE POLICY "owner-read-shopreel-story-sources"
  ON public.shopreel_story_sources
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_story_sources.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "owner-read-shopreel-opportunities" ON public.shopreel_opportunities;
CREATE POLICY "owner-read-shopreel-opportunities"
  ON public.shopreel_opportunities
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_opportunities.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "owner-update-shopreel-opportunities" ON public.shopreel_opportunities;
CREATE POLICY "owner-update-shopreel-opportunities"
  ON public.shopreel_opportunities
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_opportunities.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_opportunities.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "owner-read-shopreel-opportunity-history" ON public.shopreel_opportunity_status_history;
CREATE POLICY "owner-read-shopreel-opportunity-history"
  ON public.shopreel_opportunity_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_opportunity_status_history.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "owner-insert-shopreel-opportunity-history" ON public.shopreel_opportunity_status_history;
CREATE POLICY "owner-insert-shopreel-opportunity-history"
  ON public.shopreel_opportunity_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_opportunity_status_history.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "owner-read-shopreel-drafts" ON public.shopreel_drafts;
CREATE POLICY "owner-read-shopreel-drafts"
  ON public.shopreel_drafts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_drafts.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "owner-insert-shopreel-drafts" ON public.shopreel_drafts;
CREATE POLICY "owner-insert-shopreel-drafts"
  ON public.shopreel_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_drafts.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "owner-update-shopreel-drafts" ON public.shopreel_drafts;
CREATE POLICY "owner-update-shopreel-drafts"
  ON public.shopreel_drafts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_drafts.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shop_members sm
      WHERE sm.shop_id = shopreel_drafts.shop_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );
