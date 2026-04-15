-- Shop Boost reliability hardening: row-level tracking + review queue.

create table if not exists public.shop_boost_row_results (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  intake_id uuid not null references public.shop_boost_intakes(id) on delete cascade,
  source_file text not null,
  source_row_index integer not null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  target_domain text not null,
  match_status text not null,
  match_confidence numeric(5,4) not null default 0,
  match_details jsonb not null default '{}'::jsonb,
  error_reason text,
  review_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shop_boost_row_results_intake on public.shop_boost_row_results(intake_id);
create index if not exists idx_shop_boost_row_results_shop_domain on public.shop_boost_row_results(shop_id, target_domain);
create index if not exists idx_shop_boost_row_results_review on public.shop_boost_row_results(shop_id, review_required);

create table if not exists public.shop_boost_review_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  intake_id uuid not null references public.shop_boost_intakes(id) on delete cascade,
  domain text not null,
  issue_type text not null,
  summary text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  suggested_matches jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  resolution_action text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shop_boost_review_items_intake on public.shop_boost_review_items(intake_id);
create index if not exists idx_shop_boost_review_items_shop_status on public.shop_boost_review_items(shop_id, status);
create index if not exists idx_shop_boost_review_items_domain on public.shop_boost_review_items(shop_id, domain);

alter table public.shop_boost_row_results enable row level security;
alter table public.shop_boost_review_items enable row level security;

drop policy if exists "service-role-manage-shop-boost-row-results" on public.shop_boost_row_results;
create policy "service-role-manage-shop-boost-row-results"
  on public.shop_boost_row_results
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service-role-manage-shop-boost-review-items" on public.shop_boost_review_items;
create policy "service-role-manage-shop-boost-review-items"
  on public.shop_boost_review_items
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "shop-users-read-shop-boost-row-results" on public.shop_boost_row_results;
create policy "shop-users-read-shop-boost-row-results"
  on public.shop_boost_row_results
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_boost_row_results.shop_id
    )
  );

drop policy if exists "shop-users-read-shop-boost-review-items" on public.shop_boost_review_items;
create policy "shop-users-read-shop-boost-review-items"
  on public.shop_boost_review_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_boost_review_items.shop_id
    )
  );
