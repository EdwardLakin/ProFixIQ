-- Equipment asset profile foundation.
--
-- Isolated addition: an optional 1:1 Equipment profile on the canonical
-- public.vehicles asset record. The vehicles table, its policies, grants,
-- triggers and constraints are unchanged. Identity that already lives on
-- vehicles (make/model/year, VIN, unit number, engine hours, odometer,
-- customer ownership) stays canonical there; this table only adds what an
-- off-road/equipment asset needs beyond it.
--
-- Writes go exclusively through the authenticated, tenant-scoped and
-- Equipment-entitled server route (service role). Authenticated Data API
-- clients may read their own shop's profiles only.
--
-- Rollback boundary (no existing object depends on this table):
--   drop table if exists public.equipment_asset_profiles;
--   drop function if exists public.equipment_asset_profiles_enforce_scope();

create table if not exists public.equipment_asset_profiles (
  vehicle_id uuid primary key
    references public.vehicles (id) on delete cascade,
  shop_id uuid not null
    references public.shops (id) on delete cascade,
  equipment_class text not null,
  equipment_family text not null,
  serial_number text,
  pin text,
  engine_make text,
  engine_model text,
  engine_serial text,
  primary_meter text not null default 'hours',
  current_cycles bigint,
  meters_updated_at timestamptz,
  site_name text,
  operating_status text not null default 'operational',
  mounted_on_vehicle_id uuid
    references public.vehicles (id) on delete set null,
  attributes jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint equipment_asset_profiles_class_format
    check (equipment_class ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint equipment_asset_profiles_family_format
    check (equipment_family ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint equipment_asset_profiles_primary_meter
    check (primary_meter in ('hours', 'odometer', 'cycles', 'none')),
  constraint equipment_asset_profiles_operating_status
    check (
      operating_status in (
        'operational',
        'limited',
        'down',
        'standby',
        'out_of_service',
        'retired'
      )
    ),
  constraint equipment_asset_profiles_cycles_non_negative
    check (current_cycles is null or current_cycles >= 0),
  constraint equipment_asset_profiles_not_mounted_on_self
    check (mounted_on_vehicle_id is null or mounted_on_vehicle_id <> vehicle_id),
  constraint equipment_asset_profiles_attributes_object
    check (jsonb_typeof(attributes) = 'object'),
  constraint equipment_asset_profiles_text_lengths
    check (
      coalesce(length(serial_number), 0) <= 120
      and coalesce(length(pin), 0) <= 120
      and coalesce(length(engine_make), 0) <= 120
      and coalesce(length(engine_model), 0) <= 120
      and coalesce(length(engine_serial), 0) <= 120
      and coalesce(length(site_name), 0) <= 200
    )
);

comment on table public.equipment_asset_profiles is
  'Optional Equipment profile for a canonical vehicles asset. Written only by the Equipment-entitled server route.';

create index if not exists equipment_asset_profiles_shop_class_idx
  on public.equipment_asset_profiles (shop_id, equipment_class);

create index if not exists equipment_asset_profiles_mounted_on_idx
  on public.equipment_asset_profiles (mounted_on_vehicle_id)
  where mounted_on_vehicle_id is not null;

-- Tenant integrity: the profile, its asset and any host asset it is mounted on
-- must all belong to the same shop. Enforced on this new table only.
create or replace function public.equipment_asset_profiles_enforce_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle_shop uuid;
  v_host_shop uuid;
begin
  select v.shop_id into v_vehicle_shop
  from public.vehicles v
  where v.id = new.vehicle_id;

  if v_vehicle_shop is null or v_vehicle_shop <> new.shop_id then
    raise exception 'Equipment profile shop must match its asset shop'
      using errcode = '23514';
  end if;

  if new.mounted_on_vehicle_id is not null then
    select v.shop_id into v_host_shop
    from public.vehicles v
    where v.id = new.mounted_on_vehicle_id;

    if v_host_shop is null or v_host_shop <> new.shop_id then
      raise exception 'Equipment host asset must belong to the same shop'
        using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.equipment_asset_profiles_enforce_scope()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_asset_profiles_enforce_scope
  on public.equipment_asset_profiles;
create trigger trg_equipment_asset_profiles_enforce_scope
before insert or update on public.equipment_asset_profiles
for each row execute function public.equipment_asset_profiles_enforce_scope();

alter table public.equipment_asset_profiles enable row level security;

revoke all on table public.equipment_asset_profiles from public, anon, authenticated;
grant select on table public.equipment_asset_profiles to authenticated;
grant all on table public.equipment_asset_profiles to service_role;

drop policy if exists equipment_asset_profiles_select
  on public.equipment_asset_profiles;
create policy equipment_asset_profiles_select
on public.equipment_asset_profiles
for select
to authenticated
using (
  shop_id in (
    select p.shop_id
    from public.profiles p
    where (
      p.id = (select auth.uid())
      or p.user_id = (select auth.uid())
    )
      and p.shop_id is not null
  )
);
