-- Shop Boost parts import staged pipeline (additive, non-breaking)
-- Goal: keep messy competitor exports in raw/staging layers and only promote high-confidence matches.

-- 1) Strengthen intake session metadata for import traceability.
alter table public.shop_boost_intakes
  add column if not exists source_system_guess text,
  add column if not exists upload_status text,
  add column if not exists import_counts jsonb default '{}'::jsonb,
  add column if not exists parse_summary jsonb default '{}'::jsonb;

-- 2) Extend raw source row storage without breaking existing readers.
alter table public.shop_import_rows
  add column if not exists shop_id uuid,
  add column if not exists original_headers jsonb default '[]'::jsonb,
  add column if not exists raw_payload jsonb default '{}'::jsonb,
  add column if not exists parse_status text default 'pending',
  add column if not exists parse_warnings jsonb default '[]'::jsonb;

create index if not exists idx_shop_import_rows_shop_id on public.shop_import_rows(shop_id);
create index if not exists idx_shop_import_rows_parse_status on public.shop_import_rows(parse_status);

alter table public.shop_import_rows
  drop constraint if exists shop_import_rows_shop_id_fkey;

alter table public.shop_import_rows
  add constraint shop_import_rows_shop_id_fkey
  foreign key (shop_id)
  references public.shops(id)
  on delete cascade;

-- Backfill shop_id from intake for older rows.
update public.shop_import_rows r
set shop_id = i.shop_id
from public.shop_boost_intakes i
where r.intake_id = i.id
  and r.shop_id is null;

-- 3) Normalized parts staging layer.
create table if not exists public.shop_parts_import_staging (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.shop_boost_intakes(id) on delete cascade,
  raw_row_id uuid references public.shop_import_rows(id) on delete set null,
  shop_id uuid not null references public.shops(id) on delete cascade,
  source_system text,
  normalized_name text,
  normalized_name_key text,
  normalized_sku text,
  normalized_part_number text,
  normalized_brand text,
  normalized_vendor text,
  mapped_category text,
  quantity_on_hand numeric(12,2),
  cost numeric(12,2),
  price numeric(12,2),
  unit_of_measure text,
  pack_info text,
  source_confidence numeric(5,4),
  status text not null default 'pending',
  warnings jsonb not null default '[]'::jsonb,
  raw_echo jsonb not null default '{}'::jsonb,
  suggested_action text,
  matched_part_id uuid references public.parts(id) on delete set null,
  match_reason text,
  auto_promote boolean not null default false,
  promoted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shop_parts_import_staging_intake on public.shop_parts_import_staging(intake_id);
create index if not exists idx_shop_parts_import_staging_shop_status on public.shop_parts_import_staging(shop_id, status);
create index if not exists idx_shop_parts_import_staging_part_number on public.shop_parts_import_staging(shop_id, normalized_part_number);
create index if not exists idx_shop_parts_import_staging_sku on public.shop_parts_import_staging(shop_id, normalized_sku);

-- 4) Candidate match layer for review queue.
create table if not exists public.shop_parts_import_match_candidates (
  id uuid primary key default gen_random_uuid(),
  staging_row_id uuid not null references public.shop_parts_import_staging(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  candidate_part_id uuid references public.parts(id) on delete cascade,
  confidence numeric(5,4) not null,
  reason text,
  rank integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shop_parts_import_match_candidates_staging on public.shop_parts_import_match_candidates(staging_row_id);
create index if not exists idx_shop_parts_import_match_candidates_shop on public.shop_parts_import_match_candidates(shop_id);

-- 5) Source alias/reference layer to preserve legacy identifiers.
create table if not exists public.shop_parts_source_aliases (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  intake_id uuid references public.shop_boost_intakes(id) on delete set null,
  raw_row_id uuid references public.shop_import_rows(id) on delete set null,
  staging_row_id uuid references public.shop_parts_import_staging(id) on delete set null,
  part_id uuid not null references public.parts(id) on delete cascade,
  source_system text,
  legacy_sku text,
  legacy_part_number text,
  legacy_label text,
  vendor_alias text,
  alias_type text not null default 'legacy_import',
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, part_id, source_hash)
);

create index if not exists idx_shop_parts_source_aliases_shop_part on public.shop_parts_source_aliases(shop_id, part_id);
create index if not exists idx_shop_parts_source_aliases_lookup on public.shop_parts_source_aliases(shop_id, legacy_part_number, legacy_sku);

-- 6) RLS + scoped read access for shop users.
alter table public.shop_parts_import_staging enable row level security;
alter table public.shop_parts_import_match_candidates enable row level security;
alter table public.shop_parts_source_aliases enable row level security;

drop policy if exists "service-role-manage-shop-parts-import-staging" on public.shop_parts_import_staging;
create policy "service-role-manage-shop-parts-import-staging"
  on public.shop_parts_import_staging
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service-role-manage-shop-parts-import-match-candidates" on public.shop_parts_import_match_candidates;
create policy "service-role-manage-shop-parts-import-match-candidates"
  on public.shop_parts_import_match_candidates
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service-role-manage-shop-parts-source-aliases" on public.shop_parts_source_aliases;
create policy "service-role-manage-shop-parts-source-aliases"
  on public.shop_parts_source_aliases
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "shop-users-read-shop-parts-import-staging" on public.shop_parts_import_staging;
create policy "shop-users-read-shop-parts-import-staging"
  on public.shop_parts_import_staging
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_parts_import_staging.shop_id
    )
  );

drop policy if exists "shop-users-read-shop-parts-import-candidates" on public.shop_parts_import_match_candidates;
create policy "shop-users-read-shop-parts-import-candidates"
  on public.shop_parts_import_match_candidates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_parts_import_match_candidates.shop_id
    )
  );

drop policy if exists "shop-users-read-shop-parts-source-aliases" on public.shop_parts_source_aliases;
create policy "shop-users-read-shop-parts-source-aliases"
  on public.shop_parts_source_aliases
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_parts_source_aliases.shop_id
    )
  );
