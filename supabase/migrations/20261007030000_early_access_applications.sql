set local lock_timeout = '5s';
set local statement_timeout = '5min';

create table if not exists public.early_access_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  company_name text not null,
  location text,
  product_package text not null check (product_package in ('shop_operations', 'complete_operations', 'field_service', 'fleet_maintenance')),
  operation_type text not null check (operation_type in ('automotive', 'heavy_duty', 'fleet', 'field_service', 'mixed', 'other')),
  location_count integer not null default 1 check (location_count > 0 and location_count <= 500),
  technician_count integer check (technician_count is null or (technician_count >= 0 and technician_count <= 10000)),
  team_size integer check (team_size is null or (team_size >= 1 and team_size <= 25000)),
  fleet_asset_count integer check (fleet_asset_count is null or (fleet_asset_count >= 0 and fleet_asset_count <= 1000000)),
  current_software text,
  primary_challenge text not null,
  interested_surfaces text[] not null default '{}',
  purchase_timeline text check (purchase_timeline is null or purchase_timeline in ('now', '30_days', '90_days', '6_months', 'researching')),
  feedback_commitment boolean not null default false,
  offer_terms_accepted boolean not null default false,
  offer_terms_version text not null,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.early_access_applications enable row level security;

create index if not exists early_access_applications_status_created_idx
  on public.early_access_applications (status, created_at desc);

create index if not exists early_access_applications_reviewed_by_idx
  on public.early_access_applications (reviewed_by)
  where reviewed_by is not null;

create unique index if not exists early_access_applications_one_pending_per_email_idx
  on public.early_access_applications (lower(email))
  where status = 'pending';

comment on table public.early_access_applications is
  'Public early-access campaign applications. Writes occur only through the server service role; no direct client RLS policies are granted.';
