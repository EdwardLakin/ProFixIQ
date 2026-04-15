-- Shop Boost flagship hardening
-- Additive schema updates for clustering, ignore semantics, graph integrity, and trust-state summaries.

alter table if exists public.shop_boost_row_results
  add column if not exists cluster_key text,
  add column if not exists cluster_confidence numeric(5,4) default 0;

create index if not exists idx_shop_boost_row_results_cluster
  on public.shop_boost_row_results(shop_id, intake_id, cluster_key);

alter table if exists public.shop_boost_review_items
  add column if not exists normalized_payload jsonb not null default '{}'::jsonb,
  add column if not exists target_domain text,
  add column if not exists blocking_reason text,
  add column if not exists dependency_refs jsonb not null default '{}'::jsonb,
  add column if not exists downstream_impact_count integer not null default 0,
  add column if not exists cluster_key text,
  add column if not exists cluster_confidence numeric(5,4) default 0,
  add column if not exists ignore_reason_code text,
  add column if not exists ignore_note text,
  add column if not exists ignored_at timestamptz;

create index if not exists idx_shop_boost_review_items_cluster
  on public.shop_boost_review_items(shop_id, intake_id, cluster_key);

create index if not exists idx_shop_boost_review_items_ignore_reason
  on public.shop_boost_review_items(shop_id, intake_id, ignore_reason_code)
  where status = 'ignored';

alter table if exists public.shop_boost_review_items
  drop constraint if exists shop_boost_review_items_status_check;

alter table if exists public.shop_boost_review_items
  add constraint shop_boost_review_items_status_check
  check (status in ('pending', 'resolved', 'materialized', 'failed_materialization', 'ignored'));

alter table if exists public.shop_boost_review_items
  drop constraint if exists shop_boost_review_items_ignore_reason_check;

alter table if exists public.shop_boost_review_items
  add constraint shop_boost_review_items_ignore_reason_check
  check (
    ignore_reason_code is null
    or ignore_reason_code in (
      'duplicate',
      'obsolete',
      'invalid',
      'test_data',
      'intentionally_skipped',
      'unsupported_format',
      'other'
    )
  );

create table if not exists public.shop_boost_integrity_reports (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  intake_id uuid not null references public.shop_boost_intakes(id) on delete cascade,
  status text not null,
  graph_ready boolean not null default false,
  blocking_issues_count integer not null default 0,
  warnings_count integer not null default 0,
  checks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shop_boost_integrity_reports_lookup
  on public.shop_boost_integrity_reports(shop_id, intake_id, created_at desc);

alter table public.shop_boost_integrity_reports enable row level security;

drop policy if exists "service-role-manage-shop-boost-integrity-reports" on public.shop_boost_integrity_reports;
create policy "service-role-manage-shop-boost-integrity-reports"
  on public.shop_boost_integrity_reports
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "shop-users-read-shop-boost-integrity-reports" on public.shop_boost_integrity_reports;
create policy "shop-users-read-shop-boost-integrity-reports"
  on public.shop_boost_integrity_reports
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_boost_integrity_reports.shop_id
    )
  );
