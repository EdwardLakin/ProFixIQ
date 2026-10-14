-- Atomic Equipment front-door creation and adoption.
--
-- This migration deliberately does not attach triggers or constraints to the
-- pre-existing vehicles table. Equipment creation serializes its own canonical
-- vehicle insert against concurrent vehicle writes with a transaction-scoped
-- table lock, then creates the canonical vehicle + Equipment profile/meter state
-- in one transaction. Customer lifecycle rows are locked before vehicle locks so
-- these operations compose safely with archive/merge flows.

create or replace function public.create_equipment_asset_atomic(
  p_shop_id uuid,
  p_vehicle_id uuid,
  p_actor_user_id uuid,
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_customer_active boolean;
  v_customer_archived_at timestamptz;
  v_customer_merged_into uuid;
  v_unit_number text;
  v_unit_normalized text;
  v_year integer;
  v_make text;
  v_model text;
  v_vin text;
  v_engine_hours integer;
  v_profile jsonb;
  v_existing public.vehicles%rowtype;
  v_existing_profile public.equipment_asset_profiles%rowtype;
begin
  if p_shop_id is null
     or p_vehicle_id is null
     or p_actor_user_id is null
     or p_input is null
     or jsonb_typeof(p_input) <> 'object' then
    raise exception 'equipment_create_invalid' using errcode = '22023';
  end if;

  begin
    v_customer_id := nullif(p_input ->> 'customer_id', '')::uuid;
    v_year := nullif(p_input ->> 'year', '')::integer;
    v_engine_hours := nullif(p_input ->> 'engine_hours', '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'equipment_create_invalid' using errcode = '22023';
  end;

  v_unit_number := pg_catalog.btrim(coalesce(p_input ->> 'unit_number', ''));
  v_unit_normalized := pg_catalog.lower(v_unit_number);
  v_make := nullif(pg_catalog.btrim(coalesce(p_input ->> 'make', '')), '');
  v_model := nullif(pg_catalog.btrim(coalesce(p_input ->> 'model', '')), '');
  v_vin := nullif(pg_catalog.btrim(coalesce(p_input ->> 'vin', '')), '');
  v_profile := p_input -> 'profile';

  if v_unit_normalized = ''
     or v_profile is null
     or jsonb_typeof(v_profile) <> 'object'
     or (v_engine_hours is not null and v_engine_hours < 0) then
    raise exception 'equipment_create_invalid' using errcode = '22023';
  end if;

  -- Lock customer lifecycle state first, matching merge/archive lock order. This
  -- avoids a customer-row -> vehicles-table / vehicles-table -> customer-row
  -- deadlock cycle while still preventing creation against a retiring account.
  if v_customer_id is not null then
    select c.active, c.archived_at, c.merged_into_customer_id
      into v_customer_active, v_customer_archived_at, v_customer_merged_into
    from public.customers c
    where c.id = v_customer_id
      and c.shop_id = p_shop_id
    for update;

    if not found
       or v_customer_active is distinct from true
       or v_customer_archived_at is not null
       or v_customer_merged_into is not null then
      raise exception 'equipment_customer_inactive' using errcode = '23514';
    end if;
  end if;

  -- Equipment creation is rare and correctness-sensitive. SHARE ROW EXCLUSIVE
  -- conflicts with ordinary vehicle INSERT/UPDATE/DELETE RowExclusive locks, so
  -- duplicate selection and this insert cannot race any existing canonical
  -- vehicle writer. No behavior is injected into those existing writers.
  lock table public.vehicles in share row exclusive mode;

  -- p_vehicle_id is also the durable operation identity. A replay must describe
  -- the same complete normalized operation; otherwise return a conflict rather
  -- than silently reporting success with the first request's semantics.
  select * into v_existing
  from public.vehicles v
  where v.id = p_vehicle_id;

  if found then
    select * into v_existing_profile
    from public.equipment_asset_profiles e
    where e.vehicle_id = p_vehicle_id
      and e.shop_id = p_shop_id;

    if v_existing.shop_id is distinct from p_shop_id
       or v_existing.customer_id is distinct from v_customer_id
       or pg_catalog.lower(pg_catalog.btrim(coalesce(v_existing.unit_number, ''))) <> v_unit_normalized
       or v_existing.year is distinct from v_year
       or nullif(pg_catalog.btrim(coalesce(v_existing.make, '')), '') is distinct from v_make
       or nullif(pg_catalog.btrim(coalesce(v_existing.model, '')), '') is distinct from v_model
       or pg_catalog.regexp_replace(pg_catalog.upper(coalesce(v_existing.vin, '')), '[^A-Z0-9]', '', 'g')
            is distinct from coalesce(v_vin, '')
       or v_existing.engine_hours is distinct from v_engine_hours
       or v_existing_profile.vehicle_id is null
       or v_existing_profile.equipment_class is distinct from (v_profile ->> 'equipment_class')
       or v_existing_profile.equipment_family is distinct from (v_profile ->> 'equipment_family')
       or v_existing_profile.serial_number is distinct from nullif(v_profile ->> 'serial_number', '')
       or v_existing_profile.pin is distinct from nullif(v_profile ->> 'pin', '')
       or v_existing_profile.engine_make is distinct from nullif(v_profile ->> 'engine_make', '')
       or v_existing_profile.engine_model is distinct from nullif(v_profile ->> 'engine_model', '')
       or v_existing_profile.engine_serial is distinct from nullif(v_profile ->> 'engine_serial', '')
       or v_existing_profile.primary_meter is distinct from coalesce(v_profile ->> 'primary_meter', 'hours')
       or v_existing_profile.current_cycles is distinct from nullif(v_profile ->> 'current_cycles', '')::bigint
       or v_existing_profile.site_name is distinct from nullif(v_profile ->> 'site_name', '')
       or v_existing_profile.operating_status is distinct from coalesce(v_profile ->> 'operating_status', 'operational')
       or v_existing_profile.mounted_on_vehicle_id is distinct from nullif(v_profile ->> 'mounted_on_vehicle_id', '')::uuid
       or coalesce(v_existing_profile.attributes, '{}'::jsonb) is distinct from coalesce(v_profile -> 'attributes', '{}'::jsonb) then
      raise exception 'equipment_operation_conflict' using errcode = '23505';
    end if;

    return p_vehicle_id;
  end if;

  if exists (
    select 1
    from public.vehicles v
    where v.shop_id = p_shop_id
      and pg_catalog.lower(pg_catalog.btrim(coalesce(v.unit_number, ''))) = v_unit_normalized
  ) then
    raise exception 'equipment_unit_duplicate' using errcode = '23505';
  end if;

  if v_vin is not null and exists (
    select 1
    from public.vehicles v
    where v.shop_id = p_shop_id
      and pg_catalog.regexp_replace(
        pg_catalog.upper(coalesce(v.vin, '')),
        '[^A-Z0-9]',
        '',
        'g'
      ) = v_vin
  ) then
    raise exception 'equipment_vin_duplicate' using errcode = '23505';
  end if;

  insert into public.vehicles (
    id, shop_id, customer_id, unit_number, year, make, model, vin, engine_hours
  )
  values (
    p_vehicle_id,
    p_shop_id,
    v_customer_id,
    v_unit_number,
    v_year,
    v_make,
    v_model,
    v_vin,
    null
  );

  perform public.save_equipment_asset_profile(
    p_shop_id,
    p_vehicle_id,
    p_actor_user_id,
    v_profile,
    v_engine_hours is not null,
    v_engine_hours,
    null,
    false,
    null,
    null
  );

  return p_vehicle_id;
end;
$$;

revoke all on function public.create_equipment_asset_atomic(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_equipment_asset_atomic(uuid, uuid, uuid, jsonb)
  to service_role;

create or replace function public.adopt_equipment_asset_atomic(
  p_shop_id uuid,
  p_vehicle_id uuid,
  p_actor_user_id uuid,
  p_profile jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_existing_profile public.equipment_asset_profiles%rowtype;
  v_initial_customer_id uuid;
  v_customer_active boolean;
  v_customer_archived_at timestamptz;
  v_customer_merged_into uuid;
begin
  if p_shop_id is null
     or p_vehicle_id is null
     or p_actor_user_id is null
     or p_profile is null
     or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'equipment_adoption_invalid' using errcode = '22023';
  end if;

  -- Read ownership first so we can lock customer lifecycle state before the
  -- vehicle row. If ownership changes before the vehicle lock is acquired, fail
  -- with a retryable conflict rather than validating the wrong customer.
  select v.customer_id into v_initial_customer_id
  from public.vehicles v
  where v.id = p_vehicle_id
    and v.shop_id = p_shop_id;

  if not found then
    raise exception 'equipment_asset_not_found' using errcode = 'P0002';
  end if;

  if v_initial_customer_id is not null then
    select c.active, c.archived_at, c.merged_into_customer_id
      into v_customer_active, v_customer_archived_at, v_customer_merged_into
    from public.customers c
    where c.id = v_initial_customer_id
      and c.shop_id = p_shop_id
    for update;

    if not found
       or v_customer_active is distinct from true
       or v_customer_archived_at is not null
       or v_customer_merged_into is not null then
      raise exception 'equipment_customer_inactive' using errcode = '23514';
    end if;
  end if;

  select * into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id
  for update;

  if not found or v_vehicle.shop_id is distinct from p_shop_id then
    raise exception 'equipment_asset_not_found' using errcode = 'P0002';
  end if;

  if v_vehicle.customer_id is distinct from v_initial_customer_id then
    raise exception 'equipment_asset_changed' using errcode = '40001';
  end if;

  if pg_catalog.lower(pg_catalog.btrim(coalesce(v_vehicle.status, ''))) in ('archived', 'merged', 'duplicate', 'inactive') then
    raise exception 'equipment_asset_retired' using errcode = '23514';
  end if;

  -- A lost successful HTTP response may cause the exact same adoption to be
  -- retried. Treat a semantically identical existing profile as success; reject
  -- a changed retry instead of overwriting the completed profile.
  select * into v_existing_profile
  from public.equipment_asset_profiles e
  where e.vehicle_id = p_vehicle_id
    and e.shop_id = p_shop_id;

  if found then
    if v_existing_profile.equipment_class is distinct from (p_profile ->> 'equipment_class')
       or v_existing_profile.equipment_family is distinct from (p_profile ->> 'equipment_family')
       or v_existing_profile.serial_number is distinct from nullif(p_profile ->> 'serial_number', '')
       or v_existing_profile.pin is distinct from nullif(p_profile ->> 'pin', '')
       or v_existing_profile.engine_make is distinct from nullif(p_profile ->> 'engine_make', '')
       or v_existing_profile.engine_model is distinct from nullif(p_profile ->> 'engine_model', '')
       or v_existing_profile.engine_serial is distinct from nullif(p_profile ->> 'engine_serial', '')
       or v_existing_profile.primary_meter is distinct from coalesce(p_profile ->> 'primary_meter', 'hours')
       or v_existing_profile.current_cycles is distinct from nullif(p_profile ->> 'current_cycles', '')::bigint
       or v_existing_profile.site_name is distinct from nullif(p_profile ->> 'site_name', '')
       or v_existing_profile.operating_status is distinct from coalesce(p_profile ->> 'operating_status', 'operational')
       or v_existing_profile.mounted_on_vehicle_id is distinct from nullif(p_profile ->> 'mounted_on_vehicle_id', '')::uuid
       or coalesce(v_existing_profile.attributes, '{}'::jsonb) is distinct from coalesce(p_profile -> 'attributes', '{}'::jsonb) then
      raise exception 'equipment_adoption_conflict' using errcode = '23505';
    end if;

    return;
  end if;

  insert into public.equipment_asset_profiles (
    vehicle_id,
    shop_id,
    equipment_class,
    equipment_family,
    serial_number,
    pin,
    engine_make,
    engine_model,
    engine_serial,
    primary_meter,
    current_cycles,
    site_name,
    operating_status,
    mounted_on_vehicle_id,
    attributes,
    created_by,
    updated_by
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
    null,
    p_profile ->> 'site_name',
    coalesce(p_profile ->> 'operating_status', 'operational'),
    null,
    coalesce(p_profile -> 'attributes', '{}'::jsonb),
    p_actor_user_id,
    p_actor_user_id
  );
end;
$$;

revoke all on function public.adopt_equipment_asset_atomic(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.adopt_equipment_asset_atomic(uuid, uuid, uuid, jsonb)
  to service_role;
