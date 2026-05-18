-- Property Operations Step 6 manual migration draft
-- Purpose: property maintenance operations only.
-- Review and apply manually in Supabase SQL Editor when ready.
--
-- IMPORTANT:
-- - Draft only; do not auto-apply from this branch.
-- - No rent collection, accounting, lease management, tenant screening, or owner statements.
-- - No existing fleet/shop RLS policies are changed here.
-- - No work-order conversion behavior is changed here.
--
-- Assumptions:
-- - public.profiles.id = auth.uid().
-- - public.profiles.shop_id is the tenant boundary for internal shop users.
-- - public.set_updated_at() exists in the current schema and updates NEW.updated_at.

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.property_portfolios (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_properties (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  portfolio_id uuid references public.property_portfolios(id) on delete set null,
  name text not null,
  property_type text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text default 'CA',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_units (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  property_id uuid not null references public.property_properties(id) on delete cascade,
  unit_label text not null,
  unit_type text,
  occupancy_status text,
  access_notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_assets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  property_id uuid not null references public.property_properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  name text not null,
  asset_type text,
  manufacturer text,
  model text,
  serial_number text,
  install_date date,
  warranty_expires_on date,
  location_note text,
  status text not null default 'active',
  next_service_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_id uuid references public.property_portfolios(id) on delete cascade,
  property_id uuid references public.property_properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now()
);

comment on column public.property_members.role is
  'Expected property operations roles: property_manager, owner_approver, tenant_requester, vendor, viewer.';

create table if not exists public.property_maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  property_id uuid not null references public.property_properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  asset_id uuid references public.property_assets(id) on delete set null,
  requester_profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  summary text not null,
  category text,
  severity text not null default 'routine',
  status text not null default 'open',
  source text not null default 'manual',
  access_notes text,
  preferred_window text,
  photos jsonb not null default '[]'::jsonb,
  ai_triage jsonb not null default '{}'::jsonb,
  work_order_id uuid references public.work_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.property_maintenance_requests.severity is
  'Suggested values: emergency, urgent, routine, recommended.';
comment on column public.property_maintenance_requests.status is
  'Suggested values: open, triaged, approval_required, assigned, scheduled, in_progress, completed, cancelled.';

create table if not exists public.property_inspections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  property_id uuid not null references public.property_properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  performed_by_profile_id uuid references public.profiles(id) on delete set null,
  inspection_type text not null default 'general',
  status text not null default 'draft',
  summary text,
  findings jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_vendors (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  trade text,
  contact_name text,
  email text,
  phone text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_vendor_assignments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  request_id uuid references public.property_maintenance_requests(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  vendor_id uuid not null references public.property_vendors(id) on delete cascade,
  status text not null default 'assigned',
  scheduled_for timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_approval_thresholds (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  portfolio_id uuid references public.property_portfolios(id) on delete cascade,
  property_id uuid references public.property_properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete cascade,
  threshold_cents integer not null default 0,
  requires_owner_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Conservative check constraints
-- -----------------------------------------------------------------------------
-- These are added as NOT VALID so this draft can be applied safely in
-- production-like databases that may already contain imperfect rows. PostgreSQL
-- still enforces NOT VALID CHECK constraints for new/updated rows; validate them
-- later only after auditing/backfilling existing data.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_members_role_check' and conrelid = 'public.property_members'::regclass) then
    alter table public.property_members
      add constraint property_members_role_check
      check (role in ('property_manager', 'owner_approver', 'tenant_requester', 'vendor', 'viewer')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'property_maintenance_requests_severity_check' and conrelid = 'public.property_maintenance_requests'::regclass) then
    alter table public.property_maintenance_requests
      add constraint property_maintenance_requests_severity_check
      check (severity in ('emergency', 'urgent', 'routine', 'recommended')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'property_maintenance_requests_status_check' and conrelid = 'public.property_maintenance_requests'::regclass) then
    alter table public.property_maintenance_requests
      add constraint property_maintenance_requests_status_check
      check (status in ('open', 'triaged', 'approval_required', 'assigned', 'scheduled', 'in_progress', 'completed', 'cancelled')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'property_vendor_assignments_has_parent_check' and conrelid = 'public.property_vendor_assignments'::regclass) then
    alter table public.property_vendor_assignments
      add constraint property_vendor_assignments_has_parent_check
      check (request_id is not null or work_order_id is not null) not valid;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index if not exists idx_property_portfolios_shop_id
  on public.property_portfolios(shop_id);

create index if not exists idx_property_properties_shop_id
  on public.property_properties(shop_id);
create index if not exists idx_property_properties_portfolio_id
  on public.property_properties(portfolio_id);
create index if not exists idx_property_properties_shop_status
  on public.property_properties(shop_id, status);

create index if not exists idx_property_units_shop_id
  on public.property_units(shop_id);
create index if not exists idx_property_units_property_id
  on public.property_units(property_id);
create index if not exists idx_property_units_shop_property
  on public.property_units(shop_id, property_id);

create index if not exists idx_property_assets_shop_id
  on public.property_assets(shop_id);
create index if not exists idx_property_assets_property_id
  on public.property_assets(property_id);
create index if not exists idx_property_assets_unit_id
  on public.property_assets(unit_id);
create index if not exists idx_property_assets_next_service_date
  on public.property_assets(shop_id, next_service_date);

create index if not exists idx_property_members_shop_id
  on public.property_members(shop_id);
create index if not exists idx_property_members_user_id
  on public.property_members(user_id);
create index if not exists idx_property_members_user_shop_role
  on public.property_members(user_id, shop_id, role);
create index if not exists idx_property_members_portfolio_id
  on public.property_members(portfolio_id);
create index if not exists idx_property_members_property_id
  on public.property_members(property_id);
create index if not exists idx_property_members_unit_id
  on public.property_members(unit_id);

create index if not exists idx_property_maintenance_requests_shop_id
  on public.property_maintenance_requests(shop_id);
create index if not exists idx_property_maintenance_requests_property_id
  on public.property_maintenance_requests(property_id);
create index if not exists idx_property_maintenance_requests_unit_id
  on public.property_maintenance_requests(unit_id);
create index if not exists idx_property_maintenance_requests_asset_id
  on public.property_maintenance_requests(asset_id);
create index if not exists idx_property_maintenance_requests_status_severity
  on public.property_maintenance_requests(shop_id, status, severity);
create index if not exists idx_property_maintenance_requests_work_order_id
  on public.property_maintenance_requests(work_order_id);

create index if not exists idx_property_inspections_shop_id
  on public.property_inspections(shop_id);
create index if not exists idx_property_inspections_property_id
  on public.property_inspections(property_id);
create index if not exists idx_property_inspections_unit_id
  on public.property_inspections(unit_id);
create index if not exists idx_property_inspections_shop_status
  on public.property_inspections(shop_id, status);

create index if not exists idx_property_vendors_shop_id
  on public.property_vendors(shop_id);
create index if not exists idx_property_vendors_shop_status
  on public.property_vendors(shop_id, status);
create index if not exists idx_property_vendors_shop_trade
  on public.property_vendors(shop_id, trade);

create index if not exists idx_property_vendor_assignments_shop_id
  on public.property_vendor_assignments(shop_id);
create index if not exists idx_property_vendor_assignments_request_id
  on public.property_vendor_assignments(request_id);
create index if not exists idx_property_vendor_assignments_work_order_id
  on public.property_vendor_assignments(work_order_id);
create index if not exists idx_property_vendor_assignments_vendor_id
  on public.property_vendor_assignments(vendor_id);
create index if not exists idx_property_vendor_assignments_shop_status
  on public.property_vendor_assignments(shop_id, status);

create index if not exists idx_property_approval_thresholds_shop_id
  on public.property_approval_thresholds(shop_id);
create index if not exists idx_property_approval_thresholds_portfolio_id
  on public.property_approval_thresholds(portfolio_id);
create index if not exists idx_property_approval_thresholds_property_id
  on public.property_approval_thresholds(property_id);
create index if not exists idx_property_approval_thresholds_unit_id
  on public.property_approval_thresholds(unit_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- Uses existing public.set_updated_at(). If a target environment does not have
-- that helper, create/review the helper separately before applying this section.
-- -----------------------------------------------------------------------------

drop trigger if exists trg_property_portfolios_updated_at on public.property_portfolios;
create trigger trg_property_portfolios_updated_at
before update on public.property_portfolios
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_properties_updated_at on public.property_properties;
create trigger trg_property_properties_updated_at
before update on public.property_properties
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_units_updated_at on public.property_units;
create trigger trg_property_units_updated_at
before update on public.property_units
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_assets_updated_at on public.property_assets;
create trigger trg_property_assets_updated_at
before update on public.property_assets
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_maintenance_requests_updated_at on public.property_maintenance_requests;
create trigger trg_property_maintenance_requests_updated_at
before update on public.property_maintenance_requests
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_inspections_updated_at on public.property_inspections;
create trigger trg_property_inspections_updated_at
before update on public.property_inspections
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_vendors_updated_at on public.property_vendors;
create trigger trg_property_vendors_updated_at
before update on public.property_vendors
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_vendor_assignments_updated_at on public.property_vendor_assignments;
create trigger trg_property_vendor_assignments_updated_at
before update on public.property_vendor_assignments
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_approval_thresholds_updated_at on public.property_approval_thresholds;
create trigger trg_property_approval_thresholds_updated_at
before update on public.property_approval_thresholds
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tenant consistency validation triggers
-- -----------------------------------------------------------------------------
-- CHECK constraints cannot reference parent tables, so these conservative
-- BEFORE triggers prevent child rows from drifting across shop_id boundaries.
-- They deliberately validate only tenant/scope consistency and do not infer any
-- access rights.

create or replace function public.validate_property_properties_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  parent_shop_id uuid;
begin
  if new.portfolio_id is not null then
    select pp.shop_id into parent_shop_id
    from public.property_portfolios pp
    where pp.id = new.portfolio_id;

    if parent_shop_id is null or parent_shop_id <> new.shop_id then
      raise exception 'property_properties.shop_id must match property_portfolios.shop_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_properties_tenant_consistency on public.property_properties;
create trigger trg_property_properties_tenant_consistency
before insert or update on public.property_properties
for each row execute function public.validate_property_properties_tenant_consistency();

create or replace function public.validate_property_units_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  parent_shop_id uuid;
begin
  select pp.shop_id into parent_shop_id
  from public.property_properties pp
  where pp.id = new.property_id;

  if parent_shop_id is null or parent_shop_id <> new.shop_id then
    raise exception 'property_units.shop_id must match property_properties.shop_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_units_tenant_consistency on public.property_units;
create trigger trg_property_units_tenant_consistency
before insert or update on public.property_units
for each row execute function public.validate_property_units_tenant_consistency();

create or replace function public.validate_property_assets_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  parent_shop_id uuid;
  unit_record record;
begin
  select pp.shop_id into parent_shop_id
  from public.property_properties pp
  where pp.id = new.property_id;

  if parent_shop_id is null or parent_shop_id <> new.shop_id then
    raise exception 'property_assets.shop_id must match property_properties.shop_id'
      using errcode = '23514';
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id into unit_record
    from public.property_units pu
    where pu.id = new.unit_id;

    if unit_record.shop_id is null
      or unit_record.shop_id <> new.shop_id
      or unit_record.property_id <> new.property_id then
      raise exception 'property_assets unit_id must belong to the same shop_id and property_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_assets_tenant_consistency on public.property_assets;
create trigger trg_property_assets_tenant_consistency
before insert or update on public.property_assets
for each row execute function public.validate_property_assets_tenant_consistency();

create or replace function public.validate_property_members_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  portfolio_shop_id uuid;
  property_record record;
  unit_record record;
begin
  if new.portfolio_id is not null then
    select pp.shop_id into portfolio_shop_id
    from public.property_portfolios pp
    where pp.id = new.portfolio_id;

    if portfolio_shop_id is null or portfolio_shop_id <> new.shop_id then
      raise exception 'property_members.shop_id must match property_portfolios.shop_id'
        using errcode = '23514';
    end if;
  end if;

  if new.property_id is not null then
    select pp.shop_id, pp.portfolio_id into property_record
    from public.property_properties pp
    where pp.id = new.property_id;

    if property_record.shop_id is null or property_record.shop_id <> new.shop_id then
      raise exception 'property_members.shop_id must match property_properties.shop_id'
        using errcode = '23514';
    end if;

    if new.portfolio_id is not null and property_record.portfolio_id is distinct from new.portfolio_id then
      raise exception 'property_members.property_id must belong to portfolio_id when both are present'
        using errcode = '23514';
    end if;
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id into unit_record
    from public.property_units pu
    where pu.id = new.unit_id;

    if unit_record.shop_id is null or unit_record.shop_id <> new.shop_id then
      raise exception 'property_members.shop_id must match property_units.shop_id'
        using errcode = '23514';
    end if;

    if new.property_id is not null and unit_record.property_id <> new.property_id then
      raise exception 'property_members.unit_id must belong to property_id when both are present'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_members_tenant_consistency on public.property_members;
create trigger trg_property_members_tenant_consistency
before insert or update on public.property_members
for each row execute function public.validate_property_members_tenant_consistency();

create or replace function public.validate_property_maintenance_requests_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  parent_shop_id uuid;
  unit_record record;
  asset_record record;
  work_order_shop_id uuid;
begin
  select pp.shop_id into parent_shop_id
  from public.property_properties pp
  where pp.id = new.property_id;

  if parent_shop_id is null or parent_shop_id <> new.shop_id then
    raise exception 'property_maintenance_requests.shop_id must match property_properties.shop_id'
      using errcode = '23514';
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id into unit_record
    from public.property_units pu
    where pu.id = new.unit_id;

    if unit_record.shop_id is null
      or unit_record.shop_id <> new.shop_id
      or unit_record.property_id <> new.property_id then
      raise exception 'property_maintenance_requests unit_id must belong to the same shop_id and property_id'
        using errcode = '23514';
    end if;
  end if;

  if new.asset_id is not null then
    select pa.shop_id, pa.property_id, pa.unit_id into asset_record
    from public.property_assets pa
    where pa.id = new.asset_id;

    if asset_record.shop_id is null
      or asset_record.shop_id <> new.shop_id
      or asset_record.property_id <> new.property_id
      or (asset_record.unit_id is not null and asset_record.unit_id is distinct from new.unit_id) then
      raise exception 'property_maintenance_requests asset_id must belong to the same shop_id, property_id, and unit_id scope'
        using errcode = '23514';
    end if;
  end if;

  if new.work_order_id is not null then
    select wo.shop_id into work_order_shop_id
    from public.work_orders wo
    where wo.id = new.work_order_id;

    if work_order_shop_id is null or work_order_shop_id <> new.shop_id then
      raise exception 'property_maintenance_requests.shop_id must match work_orders.shop_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_maintenance_requests_tenant_consistency on public.property_maintenance_requests;
create trigger trg_property_maintenance_requests_tenant_consistency
before insert or update on public.property_maintenance_requests
for each row execute function public.validate_property_maintenance_requests_tenant_consistency();

create or replace function public.validate_property_inspections_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  parent_shop_id uuid;
  unit_record record;
begin
  select pp.shop_id into parent_shop_id
  from public.property_properties pp
  where pp.id = new.property_id;

  if parent_shop_id is null or parent_shop_id <> new.shop_id then
    raise exception 'property_inspections.shop_id must match property_properties.shop_id'
      using errcode = '23514';
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id into unit_record
    from public.property_units pu
    where pu.id = new.unit_id;

    if unit_record.shop_id is null
      or unit_record.shop_id <> new.shop_id
      or unit_record.property_id <> new.property_id then
      raise exception 'property_inspections unit_id must belong to the same shop_id and property_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_inspections_tenant_consistency on public.property_inspections;
create trigger trg_property_inspections_tenant_consistency
before insert or update on public.property_inspections
for each row execute function public.validate_property_inspections_tenant_consistency();

create or replace function public.validate_property_vendor_assignments_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  request_shop_id uuid;
  work_order_shop_id uuid;
  vendor_shop_id uuid;
begin
  select pv.shop_id into vendor_shop_id
  from public.property_vendors pv
  where pv.id = new.vendor_id;

  if vendor_shop_id is null or vendor_shop_id <> new.shop_id then
    raise exception 'property_vendor_assignments.shop_id must match property_vendors.shop_id'
      using errcode = '23514';
  end if;

  if new.request_id is not null then
    select pmr.shop_id into request_shop_id
    from public.property_maintenance_requests pmr
    where pmr.id = new.request_id;

    if request_shop_id is null or request_shop_id <> new.shop_id then
      raise exception 'property_vendor_assignments.shop_id must match property_maintenance_requests.shop_id'
        using errcode = '23514';
    end if;
  end if;

  if new.work_order_id is not null then
    select wo.shop_id into work_order_shop_id
    from public.work_orders wo
    where wo.id = new.work_order_id;

    if work_order_shop_id is null or work_order_shop_id <> new.shop_id then
      raise exception 'property_vendor_assignments.shop_id must match work_orders.shop_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_vendor_assignments_tenant_consistency on public.property_vendor_assignments;
create trigger trg_property_vendor_assignments_tenant_consistency
before insert or update on public.property_vendor_assignments
for each row execute function public.validate_property_vendor_assignments_tenant_consistency();

create or replace function public.validate_property_approval_thresholds_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  portfolio_shop_id uuid;
  property_record record;
  unit_record record;
begin
  if new.portfolio_id is not null then
    select pp.shop_id into portfolio_shop_id
    from public.property_portfolios pp
    where pp.id = new.portfolio_id;

    if portfolio_shop_id is null or portfolio_shop_id <> new.shop_id then
      raise exception 'property_approval_thresholds.shop_id must match property_portfolios.shop_id'
        using errcode = '23514';
    end if;
  end if;

  if new.property_id is not null then
    select pp.shop_id, pp.portfolio_id into property_record
    from public.property_properties pp
    where pp.id = new.property_id;

    if property_record.shop_id is null or property_record.shop_id <> new.shop_id then
      raise exception 'property_approval_thresholds.shop_id must match property_properties.shop_id'
        using errcode = '23514';
    end if;

    if new.portfolio_id is not null and property_record.portfolio_id is distinct from new.portfolio_id then
      raise exception 'property_approval_thresholds.property_id must belong to portfolio_id when both are present'
        using errcode = '23514';
    end if;
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id, pp.portfolio_id into unit_record
    from public.property_units pu
    join public.property_properties pp on pp.id = pu.property_id
    where pu.id = new.unit_id;

    if unit_record.shop_id is null or unit_record.shop_id <> new.shop_id then
      raise exception 'property_approval_thresholds.shop_id must match property_units.shop_id'
        using errcode = '23514';
    end if;

    if new.property_id is not null and unit_record.property_id <> new.property_id then
      raise exception 'property_approval_thresholds.unit_id must belong to property_id when both are present'
        using errcode = '23514';
    end if;

    if new.portfolio_id is not null and unit_record.portfolio_id is distinct from new.portfolio_id then
      raise exception 'property_approval_thresholds.unit_id must belong to portfolio_id when both are present'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_approval_thresholds_tenant_consistency on public.property_approval_thresholds;
create trigger trg_property_approval_thresholds_tenant_consistency
before insert or update on public.property_approval_thresholds
for each row execute function public.validate_property_approval_thresholds_tenant_consistency();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.property_portfolios enable row level security;
alter table public.property_properties enable row level security;
alter table public.property_units enable row level security;
alter table public.property_assets enable row level security;
alter table public.property_members enable row level security;
alter table public.property_maintenance_requests enable row level security;
alter table public.property_inspections enable row level security;
alter table public.property_vendors enable row level security;
alter table public.property_vendor_assignments enable row level security;
alter table public.property_approval_thresholds enable row level security;

-- Internal shop staff policies. These rely on profiles.shop_id and do not infer
-- any access from existing fleet/shop tables.

drop policy if exists property_portfolios_internal_staff_select on public.property_portfolios;
create policy property_portfolios_internal_staff_select
on public.property_portfolios for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_portfolios.shop_id));
drop policy if exists property_portfolios_internal_staff_insert on public.property_portfolios;
create policy property_portfolios_internal_staff_insert
on public.property_portfolios for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_portfolios.shop_id));
drop policy if exists property_portfolios_internal_staff_update on public.property_portfolios;
create policy property_portfolios_internal_staff_update
on public.property_portfolios for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_portfolios.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_portfolios.shop_id));
drop policy if exists property_portfolios_internal_staff_delete on public.property_portfolios;
create policy property_portfolios_internal_staff_delete
on public.property_portfolios for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_portfolios.shop_id));

drop policy if exists property_properties_internal_staff_select on public.property_properties;
create policy property_properties_internal_staff_select
on public.property_properties for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_properties.shop_id));
drop policy if exists property_properties_internal_staff_insert on public.property_properties;
create policy property_properties_internal_staff_insert
on public.property_properties for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_properties.shop_id));
drop policy if exists property_properties_internal_staff_update on public.property_properties;
create policy property_properties_internal_staff_update
on public.property_properties for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_properties.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_properties.shop_id));
drop policy if exists property_properties_internal_staff_delete on public.property_properties;
create policy property_properties_internal_staff_delete
on public.property_properties for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_properties.shop_id));

drop policy if exists property_units_internal_staff_select on public.property_units;
create policy property_units_internal_staff_select
on public.property_units for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_units.shop_id));
drop policy if exists property_units_internal_staff_insert on public.property_units;
create policy property_units_internal_staff_insert
on public.property_units for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_units.shop_id));
drop policy if exists property_units_internal_staff_update on public.property_units;
create policy property_units_internal_staff_update
on public.property_units for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_units.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_units.shop_id));
drop policy if exists property_units_internal_staff_delete on public.property_units;
create policy property_units_internal_staff_delete
on public.property_units for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_units.shop_id));

drop policy if exists property_assets_internal_staff_select on public.property_assets;
create policy property_assets_internal_staff_select
on public.property_assets for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_assets.shop_id));
drop policy if exists property_assets_internal_staff_insert on public.property_assets;
create policy property_assets_internal_staff_insert
on public.property_assets for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_assets.shop_id));
drop policy if exists property_assets_internal_staff_update on public.property_assets;
create policy property_assets_internal_staff_update
on public.property_assets for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_assets.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_assets.shop_id));
drop policy if exists property_assets_internal_staff_delete on public.property_assets;
create policy property_assets_internal_staff_delete
on public.property_assets for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_assets.shop_id));

drop policy if exists property_members_internal_staff_select on public.property_members;
create policy property_members_internal_staff_select
on public.property_members for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_members.shop_id));
drop policy if exists property_members_internal_staff_insert on public.property_members;
create policy property_members_internal_staff_insert
on public.property_members for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_members.shop_id));
drop policy if exists property_members_internal_staff_update on public.property_members;
create policy property_members_internal_staff_update
on public.property_members for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_members.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_members.shop_id));
drop policy if exists property_members_internal_staff_delete on public.property_members;
create policy property_members_internal_staff_delete
on public.property_members for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_members.shop_id));

drop policy if exists property_maintenance_requests_internal_staff_select on public.property_maintenance_requests;
create policy property_maintenance_requests_internal_staff_select
on public.property_maintenance_requests for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_maintenance_requests.shop_id));
drop policy if exists property_maintenance_requests_internal_staff_insert on public.property_maintenance_requests;
create policy property_maintenance_requests_internal_staff_insert
on public.property_maintenance_requests for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_maintenance_requests.shop_id));
drop policy if exists property_maintenance_requests_internal_staff_update on public.property_maintenance_requests;
create policy property_maintenance_requests_internal_staff_update
on public.property_maintenance_requests for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_maintenance_requests.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_maintenance_requests.shop_id));
drop policy if exists property_maintenance_requests_internal_staff_delete on public.property_maintenance_requests;
create policy property_maintenance_requests_internal_staff_delete
on public.property_maintenance_requests for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_maintenance_requests.shop_id));

drop policy if exists property_inspections_internal_staff_select on public.property_inspections;
create policy property_inspections_internal_staff_select
on public.property_inspections for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_inspections.shop_id));
drop policy if exists property_inspections_internal_staff_insert on public.property_inspections;
create policy property_inspections_internal_staff_insert
on public.property_inspections for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_inspections.shop_id));
drop policy if exists property_inspections_internal_staff_update on public.property_inspections;
create policy property_inspections_internal_staff_update
on public.property_inspections for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_inspections.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_inspections.shop_id));
drop policy if exists property_inspections_internal_staff_delete on public.property_inspections;
create policy property_inspections_internal_staff_delete
on public.property_inspections for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_inspections.shop_id));

drop policy if exists property_vendors_internal_staff_select on public.property_vendors;
create policy property_vendors_internal_staff_select
on public.property_vendors for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendors.shop_id));
drop policy if exists property_vendors_internal_staff_insert on public.property_vendors;
create policy property_vendors_internal_staff_insert
on public.property_vendors for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendors.shop_id));
drop policy if exists property_vendors_internal_staff_update on public.property_vendors;
create policy property_vendors_internal_staff_update
on public.property_vendors for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendors.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendors.shop_id));
drop policy if exists property_vendors_internal_staff_delete on public.property_vendors;
create policy property_vendors_internal_staff_delete
on public.property_vendors for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendors.shop_id));

drop policy if exists property_vendor_assignments_internal_staff_select on public.property_vendor_assignments;
create policy property_vendor_assignments_internal_staff_select
on public.property_vendor_assignments for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendor_assignments.shop_id));
drop policy if exists property_vendor_assignments_internal_staff_insert on public.property_vendor_assignments;
create policy property_vendor_assignments_internal_staff_insert
on public.property_vendor_assignments for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendor_assignments.shop_id));
drop policy if exists property_vendor_assignments_internal_staff_update on public.property_vendor_assignments;
create policy property_vendor_assignments_internal_staff_update
on public.property_vendor_assignments for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendor_assignments.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendor_assignments.shop_id));
drop policy if exists property_vendor_assignments_internal_staff_delete on public.property_vendor_assignments;
create policy property_vendor_assignments_internal_staff_delete
on public.property_vendor_assignments for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_vendor_assignments.shop_id));

drop policy if exists property_approval_thresholds_internal_staff_select on public.property_approval_thresholds;
create policy property_approval_thresholds_internal_staff_select
on public.property_approval_thresholds for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_approval_thresholds.shop_id));
drop policy if exists property_approval_thresholds_internal_staff_insert on public.property_approval_thresholds;
create policy property_approval_thresholds_internal_staff_insert
on public.property_approval_thresholds for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_approval_thresholds.shop_id));
drop policy if exists property_approval_thresholds_internal_staff_update on public.property_approval_thresholds;
create policy property_approval_thresholds_internal_staff_update
on public.property_approval_thresholds for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_approval_thresholds.shop_id))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_approval_thresholds.shop_id));
drop policy if exists property_approval_thresholds_internal_staff_delete on public.property_approval_thresholds;
create policy property_approval_thresholds_internal_staff_delete
on public.property_approval_thresholds for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = property_approval_thresholds.shop_id));

-- Property member read policies. A member may see rows within their explicit
-- portfolio/property/unit scope. Narrower unit membership only unlocks that unit
-- and directly attached assets/requests/inspections.
--
-- RLS recursion review: this repo does not currently include a reusable
-- SECURITY DEFINER property-membership helper pattern. The property_members
-- policies below intentionally avoid querying property_members from a
-- property_members policy; other member-scoped SELECT policies query
-- property_members only to check the current auth.uid() row. If future write
-- policies need richer member/role checks, add a reviewed helper function first
-- rather than nesting broader property_members lookups inside its own RLS.

drop policy if exists property_members_self_select on public.property_members;
create policy property_members_self_select
on public.property_members for select to authenticated
using (user_id = auth.uid());

drop policy if exists property_portfolios_member_select on public.property_portfolios;
create policy property_portfolios_member_select
on public.property_portfolios for select to authenticated
using (exists (
  select 1 from public.property_members pm
  where pm.user_id = auth.uid()
    and pm.shop_id = property_portfolios.shop_id
    and pm.portfolio_id = property_portfolios.id
));

drop policy if exists property_properties_member_select on public.property_properties;
create policy property_properties_member_select
on public.property_properties for select to authenticated
using (exists (
  select 1 from public.property_members pm
  where pm.user_id = auth.uid()
    and pm.shop_id = property_properties.shop_id
    and (
      pm.property_id = property_properties.id
      or (pm.portfolio_id is not null and pm.portfolio_id = property_properties.portfolio_id)
    )
));

drop policy if exists property_units_member_select on public.property_units;
create policy property_units_member_select
on public.property_units for select to authenticated
using (exists (
  select 1 from public.property_members pm
  join public.property_properties pp on pp.id = property_units.property_id
  where pm.user_id = auth.uid()
    and pm.shop_id = property_units.shop_id
    and (
      pm.unit_id = property_units.id
      or pm.property_id = property_units.property_id
      or (pm.portfolio_id is not null and pm.portfolio_id = pp.portfolio_id)
    )
));

drop policy if exists property_assets_member_select on public.property_assets;
create policy property_assets_member_select
on public.property_assets for select to authenticated
using (exists (
  select 1 from public.property_members pm
  join public.property_properties pp on pp.id = property_assets.property_id
  where pm.user_id = auth.uid()
    and pm.shop_id = property_assets.shop_id
    and (
      pm.unit_id = property_assets.unit_id
      or pm.property_id = property_assets.property_id
      or (pm.portfolio_id is not null and pm.portfolio_id = pp.portfolio_id)
    )
));

drop policy if exists property_maintenance_requests_member_select on public.property_maintenance_requests;
create policy property_maintenance_requests_member_select
on public.property_maintenance_requests for select to authenticated
using (exists (
  select 1 from public.property_members pm
  join public.property_properties pp on pp.id = property_maintenance_requests.property_id
  where pm.user_id = auth.uid()
    and pm.shop_id = property_maintenance_requests.shop_id
    and (
      pm.unit_id = property_maintenance_requests.unit_id
      or pm.property_id = property_maintenance_requests.property_id
      or (pm.portfolio_id is not null and pm.portfolio_id = pp.portfolio_id)
    )
));

drop policy if exists property_inspections_member_select on public.property_inspections;
create policy property_inspections_member_select
on public.property_inspections for select to authenticated
using (exists (
  select 1 from public.property_members pm
  join public.property_properties pp on pp.id = property_inspections.property_id
  where pm.user_id = auth.uid()
    and pm.shop_id = property_inspections.shop_id
    and (
      pm.unit_id = property_inspections.unit_id
      or pm.property_id = property_inspections.property_id
      or (pm.portfolio_id is not null and pm.portfolio_id = pp.portfolio_id)
    )
));

-- Tenant requester policy. Tenant requesters may create maintenance requests
-- only inside their membership scope and only for themselves or with a null
-- requester_profile_id for later server-side normalization.

drop policy if exists property_maintenance_requests_tenant_requester_insert on public.property_maintenance_requests;
create policy property_maintenance_requests_tenant_requester_insert
on public.property_maintenance_requests for insert to authenticated
with check (
  (requester_profile_id is null or requester_profile_id = auth.uid())
  and exists (
    select 1 from public.property_members pm
    join public.property_properties pp on pp.id = property_maintenance_requests.property_id
    where pm.user_id = auth.uid()
      and pm.shop_id = property_maintenance_requests.shop_id
      and pm.role = 'tenant_requester'
      and (
        pm.unit_id = property_maintenance_requests.unit_id
        or (pm.unit_id is null and pm.property_id = property_maintenance_requests.property_id)
        or (pm.unit_id is null and pm.property_id is null and pm.portfolio_id = pp.portfolio_id)
      )
  )
);

-- Vendor RLS TODO:
-- A safe vendor SELECT policy needs an explicit user-to-vendor linkage, e.g.
-- property_vendor_users(vendor_id, user_id, shop_id), before vendors can see
-- assigned requests/work orders through property_vendor_assignments. This draft
-- intentionally does not infer vendor access from contact email/phone or the
-- property_members vendor role to avoid cross-shop leakage or ambiguous access.

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on public.property_portfolios to authenticated;
grant select, insert, update, delete on public.property_properties to authenticated;
grant select, insert, update, delete on public.property_units to authenticated;
grant select, insert, update, delete on public.property_assets to authenticated;
grant select, insert, update, delete on public.property_members to authenticated;
grant select, insert, update, delete on public.property_maintenance_requests to authenticated;
grant select, insert, update, delete on public.property_inspections to authenticated;
grant select, insert, update, delete on public.property_vendors to authenticated;
grant select, insert, update, delete on public.property_vendor_assignments to authenticated;
grant select, insert, update, delete on public.property_approval_thresholds to authenticated;

grant all on public.property_portfolios to service_role;
grant all on public.property_properties to service_role;
grant all on public.property_units to service_role;
grant all on public.property_assets to service_role;
grant all on public.property_members to service_role;
grant all on public.property_maintenance_requests to service_role;
grant all on public.property_inspections to service_role;
grant all on public.property_vendors to service_role;
grant all on public.property_vendor_assignments to service_role;
grant all on public.property_approval_thresholds to service_role;

-- -----------------------------------------------------------------------------
-- Optional future work_orders source context (do not apply automatically)
-- -----------------------------------------------------------------------------

-- Optional future work_orders source context:
-- alter table public.work_orders add column if not exists source_vertical text;
-- alter table public.work_orders add column if not exists source_request_type text;
-- alter table public.work_orders add column if not exists source_property_maintenance_request_id uuid references public.property_maintenance_requests(id) on delete set null;
-- create index if not exists idx_work_orders_source_property_maintenance_request_id
--   on public.work_orders(source_property_maintenance_request_id);
-- create index if not exists idx_work_orders_shop_source_vertical
--   on public.work_orders(shop_id, source_vertical);
