-- Onboarding Agent foundation (staging-first, additive, shop-scoped)
-- Uploaded files remain staged information until a future explicit activation phase.

begin;

create table if not exists public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in (
    'draft','files_uploaded','analyzing','analysis_ready','review_required','activation_ready','activating','activated','blocked','cancelled'
  )),
  source text null,
  title text null,
  notes text null,
  summary jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  analyzed_at timestamptz null,
  activated_at timestamptz null
);

create index if not exists onboarding_sessions_shop_created_idx on public.onboarding_sessions(shop_id, created_at desc);
create index if not exists onboarding_sessions_shop_status_idx on public.onboarding_sessions(shop_id, status);

create table if not exists public.onboarding_files (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text null,
  detected_domain text null,
  declared_domain text null,
  mime_type text null,
  file_size_bytes bigint null,
  header_row jsonb not null default '[]'::jsonb,
  parse_status text not null default 'pending' check (parse_status in ('pending','parsed','failed','ignored')),
  parse_error text null,
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, session_id, storage_path)
);

create index if not exists onboarding_files_shop_session_idx on public.onboarding_files(shop_id, session_id);
create index if not exists onboarding_files_shop_domain_idx on public.onboarding_files(shop_id, detected_domain);

create table if not exists public.onboarding_raw_rows (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  file_id uuid not null references public.onboarding_files(id) on delete cascade,
  source_row_index integer not null,
  raw jsonb not null default '{}'::jsonb,
  normalized_preview jsonb not null default '{}'::jsonb,
  detected_domain text null,
  row_hash text null,
  parse_status text not null default 'parsed' check (parse_status in ('parsed','skipped','failed')),
  error_reason text null,
  created_at timestamptz not null default now(),
  unique (shop_id, file_id, source_row_index)
);

create index if not exists onboarding_raw_rows_shop_session_idx on public.onboarding_raw_rows(shop_id, session_id);
create index if not exists onboarding_raw_rows_shop_file_idx on public.onboarding_raw_rows(shop_id, file_id);
create index if not exists onboarding_raw_rows_shop_domain_idx on public.onboarding_raw_rows(shop_id, detected_domain);

create table if not exists public.onboarding_entities (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  entity_type text not null,
  source_file_id uuid null references public.onboarding_files(id) on delete set null,
  source_row_id uuid null references public.onboarding_raw_rows(id) on delete set null,
  source_row_index integer null,
  source_external_id text null,
  canonical_fingerprint text null,
  display_name text null,
  normalized jsonb not null default '{}'::jsonb,
  confidence numeric null,
  status text not null default 'staged' check (status in (
    'staged','duplicate_candidate','needs_review','ready','accepted','rejected','activated','failed'
  )),
  review_reason text null,
  canonical_table text null,
  canonical_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_entities_shop_type_idx on public.onboarding_entities(shop_id, session_id, entity_type);
create index if not exists onboarding_entities_shop_status_idx on public.onboarding_entities(shop_id, session_id, status);
create index if not exists onboarding_entities_shop_canonical_idx on public.onboarding_entities(shop_id, canonical_table, canonical_id);
create index if not exists onboarding_entities_shop_fingerprint_idx on public.onboarding_entities(shop_id, canonical_fingerprint);

create table if not exists public.onboarding_entity_links (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  from_entity_id uuid not null references public.onboarding_entities(id) on delete cascade,
  to_entity_id uuid not null references public.onboarding_entities(id) on delete cascade,
  link_type text not null,
  confidence numeric null,
  status text not null default 'staged' check (status in ('staged','needs_review','accepted','rejected','activated','failed')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_entity_links_shop_session_idx on public.onboarding_entity_links(shop_id, session_id);
create index if not exists onboarding_entity_links_shop_link_type_idx on public.onboarding_entity_links(shop_id, link_type);
create index if not exists onboarding_entity_links_shop_status_idx on public.onboarding_entity_links(shop_id, status);

create table if not exists public.onboarding_review_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  entity_id uuid null references public.onboarding_entities(id) on delete cascade,
  link_id uuid null references public.onboarding_entity_links(id) on delete cascade,
  severity text not null default 'medium' check (severity in ('low','medium','high','blocking')),
  domain text null,
  issue_type text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  recommended_action text null,
  status text not null default 'pending' check (status in ('pending','resolved','ignored','accepted','rejected')),
  resolved_by uuid null references auth.users(id) on delete set null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_review_items_shop_status_idx on public.onboarding_review_items(shop_id, session_id, status);
create index if not exists onboarding_review_items_shop_severity_idx on public.onboarding_review_items(shop_id, severity);
create index if not exists onboarding_review_items_shop_domain_idx on public.onboarding_review_items(shop_id, domain);

create table if not exists public.onboarding_activation_plans (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','ready','approved','running','completed','failed','cancelled')),
  plan jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  risk_flags jsonb not null default '{}'::jsonb,
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_activation_plans_shop_session_idx on public.onboarding_activation_plans(shop_id, session_id);
create index if not exists onboarding_activation_plans_shop_status_idx on public.onboarding_activation_plans(shop_id, status);

create table if not exists public.onboarding_activation_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  plan_id uuid null references public.onboarding_activation_plans(id) on delete set null,
  entity_id uuid null references public.onboarding_entities(id) on delete set null,
  event_type text not null,
  canonical_table text null,
  canonical_id uuid null,
  status text not null default 'recorded',
  message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_activation_events_shop_session_idx on public.onboarding_activation_events(shop_id, session_id);
create index if not exists onboarding_activation_events_shop_event_type_idx on public.onboarding_activation_events(shop_id, event_type);
create index if not exists onboarding_activation_events_shop_canonical_idx on public.onboarding_activation_events(shop_id, canonical_table, canonical_id);

-- updated_at triggers
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT unnest(array[
    'onboarding_sessions','onboarding_files','onboarding_entities','onboarding_review_items','onboarding_activation_plans'
  ]) as tbl
  LOOP
    EXECUTE format('drop trigger if exists trg_%I_updated_at on public.%I', t.tbl, t.tbl);
    EXECUTE format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t.tbl, t.tbl);
  END LOOP;
END $$;

-- RLS
alter table public.onboarding_sessions enable row level security;
alter table public.onboarding_files enable row level security;
alter table public.onboarding_raw_rows enable row level security;
alter table public.onboarding_entities enable row level security;
alter table public.onboarding_entity_links enable row level security;
alter table public.onboarding_review_items enable row level security;
alter table public.onboarding_activation_plans enable row level security;
alter table public.onboarding_activation_events enable row level security;

-- service role full access
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'onboarding_sessions','onboarding_files','onboarding_raw_rows','onboarding_entities','onboarding_entity_links','onboarding_review_items','onboarding_activation_plans','onboarding_activation_events'
  ]
  LOOP
    EXECUTE format('drop policy if exists service_role_manage_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy service_role_manage_%I on public.%I to service_role using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', tbl, tbl);
    EXECUTE format('grant all on public.%I to service_role', tbl);
  END LOOP;
END $$;

-- authenticated scoped shop access (owner/admin only)
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'onboarding_sessions','onboarding_files','onboarding_raw_rows','onboarding_entities','onboarding_entity_links','onboarding_review_items','onboarding_activation_plans','onboarding_activation_events'
  ]
  LOOP
    EXECUTE format('drop policy if exists onboarding_owner_admin_select_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy onboarding_owner_admin_select_%I on public.%I for select to authenticated using (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'',''admin'')))', tbl, tbl, tbl);

    EXECUTE format('drop policy if exists onboarding_owner_admin_insert_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy onboarding_owner_admin_insert_%I on public.%I for insert to authenticated with check (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'',''admin'')))', tbl, tbl, tbl);

    EXECUTE format('drop policy if exists onboarding_owner_admin_update_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy onboarding_owner_admin_update_%I on public.%I for update to authenticated using (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'',''admin''))) with check (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'',''admin'')))', tbl, tbl, tbl, tbl);

    EXECUTE format('drop policy if exists onboarding_owner_admin_delete_%I on public.%I', tbl, tbl);
    EXECUTE format('create policy onboarding_owner_admin_delete_%I on public.%I for delete to authenticated using (shop_id = public.current_shop_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = %I.shop_id and lower(coalesce(p.role, '''')) in (''owner'',''admin'')))', tbl, tbl, tbl);

    EXECUTE format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  END LOOP;
END $$;

commit;
