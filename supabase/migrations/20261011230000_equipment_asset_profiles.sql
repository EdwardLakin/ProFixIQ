-- Equipment asset profile foundation.
--
-- Isolated addition: an optional 1:1 Equipment profile on the canonical
-- public.vehicles asset record. The vehicles table, its policies, grants,
-- triggers and constraints are unchanged. Identity that already lives on
-- vehicles (make/model/year, VIN, unit number, engine hours, odometer,
-- customer ownership) stays canonical there; this table only adds what an
-- off-road/equipment asset needs beyond it.
--
-- Access model: no Data API access for anon/authenticated. All reads and
-- writes go through the authenticated server route, which enforces shop
-- scope, role, mechanic work-order assignment and the Equipment add-on
-- entitlement before using the service role. Writes use one atomic RPC.
--
-- Rollback boundary (no existing object depends on these):
--   drop function if exists public.save_equipment_asset_profile(uuid, uuid, uuid, jsonb, boolean, integer, integer, boolean, text, text);
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
  'Optional Equipment profile for a canonical vehicles asset. Accessed only through the Equipment-entitled server route.';

create index if not exists equipment_asset_profiles_shop_class_idx
  on public.equipment_asset_profiles (shop_id, equipment_class);

create index if not exists equipment_asset_profiles_mounted_on_idx
  on public.equipment_asset_profiles (mounted_on_vehicle_id)
  where mounted_on_vehicle_id is not null;

-- Tenant and mount integrity, enforced on this new table only:
-- the profile, its asset and any host asset share one shop, and two assets
-- can never be mounted on each other. Mount changes are serialized per shop
-- so concurrent reciprocal mounts cannot both pass the check.
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
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('equipment_asset_mount:' || new.shop_id::text, 0)
    );

    select v.shop_id into v_host_shop
    from public.vehicles v
    where v.id = new.mounted_on_vehicle_id;

    if v_host_shop is null or v_host_shop <> new.shop_id then
      raise exception 'Equipment host asset must belong to the same shop'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.equipment_asset_profiles host
      where host.vehicle_id = new.mounted_on_vehicle_id
        and host.mounted_on_vehicle_id = new.vehicle_id
    ) then
      raise exception 'Two assets cannot be mounted on each other'
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

-- RLS on with no client policies: anon/authenticated have no access at all.
alter table public.equipment_asset_profiles enable row level security;

revoke all on table public.equipment_asset_profiles from public, anon, authenticated;
grant all on table public.equipment_asset_profiles to service_role;

-- Atomic profile + canonical meter save. Called only by the server route
-- (service role) after it has authenticated the actor, authorized the
-- asset, and verified the Equipment entitlement.
--
-- Meters are optimistic: a meter is written only when p_set_* is true, and
-- only if the current value still equals the caller's expected value, so a
-- stale form can never revert a newer reading (SQLSTATE 40001).
create or replace function public.save_equipment_asset_profile(
  p_shop_id uuid,
  p_vehicle_id uuid,
  p_actor_user_id uuid,
  p_profile jsonb,
  p_set_engine_hours boolean default false,
  p_engine_hours integer default null,
  p_expected_engine_hours integer default null,
  p_set_odometer boolean default false,
  p_odometer text default null,
  p_expected_odometer text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_existing public.equipment_asset_profiles%rowtype;
  v_meters_changed boolean := false;
  v_cycles bigint;
begin
  if p_shop_id is null or p_vehicle_id is null or p_profile is null
     or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Equipment profile input is invalid' using errcode = '22023';
  end if;

  select * into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id
  for update;

  if not found or v_vehicle.shop_id is distinct from p_shop_id then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.equipment_asset_profiles e
  where e.vehicle_id = p_vehicle_id
  for update;

  if p_set_engine_hours then
    if v_vehicle.engine_hours is distinct from p_expected_engine_hours then
      raise exception 'Engine hours changed since this form was opened'
        using errcode = '40001';
    end if;
    if p_engine_hours is not null and p_engine_hours < 0 then
      raise exception 'Engine hours must be non-negative' using errcode = '22023';
    end if;
    if v_vehicle.engine_hours is distinct from p_engine_hours then
      update public.vehicles
      set engine_hours = p_engine_hours
      where id = p_vehicle_id;
      v_meters_changed := true;
    end if;
  end if;

  if p_set_odometer then
    if v_vehicle.mileage is distinct from p_expected_odometer then
      raise exception 'Odometer changed since this form was opened'
        using errcode = '40001';
    end if;
    if v_vehicle.mileage is distinct from p_odometer then
      update public.vehicles
      set mileage = p_odometer
      where id = p_vehicle_id;
      v_meters_changed := true;
    end if;
  end if;

  v_cycles := nullif(p_profile ->> 'current_cycles', '')::bigint;
  if v_cycles is distinct from v_existing.current_cycles then
    v_meters_changed := true;
  end if;

  insert into public.equipment_asset_profiles as e (
    vehicle_id, shop_id, equipment_class, equipment_family,
    serial_number, pin, engine_make, engine_model, engine_serial,
    primary_meter, current_cycles, meters_updated_at, site_name,
    operating_status, mounted_on_vehicle_id, attributes,
    created_by, updated_by
  )
  values (
    p_vehicle_id,
    p_shop_id,
    p_profile ->> 'equipment_class',
    p_profile ->> 'equipment_family',
    p_profile ->> 'serial_number',
    p_profile ->> 'pin',
    p_profile ->> 'engine_make',
    p_profile ->> 'engine_model',
    p_profile ->> 'engine_serial',
    coalesce(p_profile ->> 'primary_meter', 'hours'),
    v_cycles,
    case when v_meters_changed then now() else v_existing.meters_updated_at end,
    p_profile ->> 'site_name',
    coalesce(p_profile ->> 'operating_status', 'operational'),
    nullif(p_profile ->> 'mounted_on_vehicle_id', '')::uuid,
    coalesce(p_profile -> 'attributes', '{}'::jsonb),
    p_actor_user_id,
    p_actor_user_id
  )
  on conflict (vehicle_id) do update
  set equipment_class = excluded.equipment_class,
      equipment_family = excluded.equipment_family,
      serial_number = excluded.serial_number,
      pin = excluded.pin,
      engine_make = excluded.engine_make,
      engine_model = excluded.engine_model,
      engine_serial = excluded.engine_serial,
      primary_meter = excluded.primary_meter,
      current_cycles = excluded.current_cycles,
      meters_updated_at = excluded.meters_updated_at,
      site_name = excluded.site_name,
      operating_status = excluded.operating_status,
      mounted_on_vehicle_id = excluded.mounted_on_vehicle_id,
      attributes = excluded.attributes,
      updated_by = excluded.updated_by
  where e.shop_id = p_shop_id;
end;
$$;

revoke all on function public.save_equipment_asset_profile(
  uuid, uuid, uuid, jsonb, boolean, integer, integer, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.save_equipment_asset_profile(
  uuid, uuid, uuid, jsonb, boolean, integer, integer, boolean, text, text
) to service_role;
