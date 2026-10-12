-- Equipment asset profile: server-only access and atomic saves.
--
-- Forward repair of 20261011230000_equipment_asset_profiles (already applied
-- in production; never edited). Review of that migration found that the
-- shop-scoped SELECT policy let any authenticated same-shop user read
-- profiles directly through the Data API, bypassing the route's reader-role,
-- mechanic-assignment and Equipment-entitlement checks. This migration:
--
--   1. removes all client access to equipment_asset_profiles (RLS stays on
--      with no client policies; reads go through the authorized route);
--   2. replaces the new table's own trigger function so mount changes are
--      serialized per shop and reciprocal mounts are rejected;
--   3. adds the service-role-only save_equipment_asset_profile RPC, which
--      writes the profile and any deliberately edited canonical meters in one
--      transaction with optimistic meter baselines.
--
-- Only objects created by 20261011230000 are touched. No pre-existing
-- ProFixIQ table, policy, grant, trigger or function changes.
--
-- Rollback boundary:
--   drop function if exists public.save_equipment_asset_profile(uuid, uuid, uuid, jsonb, boolean, integer, integer, boolean, text, text);
--   (re-granting client SELECT is intentionally not part of rollback)

drop policy if exists equipment_asset_profiles_select
  on public.equipment_asset_profiles;

alter table public.equipment_asset_profiles enable row level security;

revoke all on table public.equipment_asset_profiles from public, anon, authenticated;
grant all on table public.equipment_asset_profiles to service_role;

comment on table public.equipment_asset_profiles is
  'Optional Equipment profile for a canonical vehicles asset. Accessed only through the Equipment-entitled server route.';

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
