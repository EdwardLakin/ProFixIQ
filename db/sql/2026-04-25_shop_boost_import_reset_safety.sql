-- Safe Shop Boost reset support:
-- 1) Provenance rows for import-created records (future-safe deletion)
-- 2) Audit events for preview/execute reset actions

create table if not exists public.shop_boost_import_provenance (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  intake_id uuid not null references public.shop_boost_intakes(id) on delete cascade,
  domain text not null check (domain in ('customer', 'vehicle', 'work_order', 'work_order_line', 'invoice')),
  record_id uuid not null,
  created_at timestamptz not null default now(),
  unique (shop_id, intake_id, domain, record_id)
);

create index if not exists idx_shop_boost_import_provenance_scope
  on public.shop_boost_import_provenance(shop_id, intake_id, domain, created_at desc);

create table if not exists public.shop_boost_import_reset_audit_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  intake_id uuid references public.shop_boost_intakes(id) on delete set null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  scope text not null check (scope in ('intake', 'shop')),
  mode text not null check (mode in ('preview', 'execute')),
  confirmation_text text not null,
  preview_counts jsonb not null default '{}'::jsonb,
  deleted_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shop_boost_import_reset_audit_scope
  on public.shop_boost_import_reset_audit_events(shop_id, intake_id, created_at desc);

alter table public.shop_boost_import_provenance enable row level security;
alter table public.shop_boost_import_reset_audit_events enable row level security;

drop policy if exists "service-role-manage-shop-boost-import-provenance" on public.shop_boost_import_provenance;
create policy "service-role-manage-shop-boost-import-provenance"
  on public.shop_boost_import_provenance
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "shop-users-read-shop-boost-import-provenance" on public.shop_boost_import_provenance;
create policy "shop-users-read-shop-boost-import-provenance"
  on public.shop_boost_import_provenance
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_boost_import_provenance.shop_id
    )
  );

drop policy if exists "service-role-manage-shop-boost-import-reset-audit-events" on public.shop_boost_import_reset_audit_events;
create policy "service-role-manage-shop-boost-import-reset-audit-events"
  on public.shop_boost_import_reset_audit_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "shop-users-read-shop-boost-import-reset-audit-events" on public.shop_boost_import_reset_audit_events;
create policy "shop-users-read-shop-boost-import-reset-audit-events"
  on public.shop_boost_import_reset_audit_events
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_boost_import_reset_audit_events.shop_id
    )
  );
