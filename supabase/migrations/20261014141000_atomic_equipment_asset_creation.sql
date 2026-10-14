-- Atomic Equipment front-door creation and adoption.
--
-- New canonical vehicle inserts are serialized per shop at the vehicles table
-- boundary, so Equipment creation and every other canonical vehicle creator
-- share the same duplicate-protection mechanism. Existing authoritative-ID
-- update/import semantics remain unchanged. Equipment creation then creates the
-- canonical vehicle + Equipment profile/meter state in one transaction.
-- Adoption locks and revalidates the canonical asset and owning customer
-- immediately before inserting the Equipment profile.

create or replace function public.vehicles_enforce_normalized_identity_unique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit_normalized text;
  v_vin_normalized text;
begin
  if new.shop_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('canonical_vehicle_identity:' || new.shop_id::text, 0)
  );

  v_unit_normalized := pg_catalog.lower(pg_catalog.btrim(coalesce(new.unit_number, '')));
  if v_unit_normalized <> '' and exists (
    select 1
    from public.vehicles v
    where v.shop_id = new.shop_id
      and v.id <> new.id
      and pg_catalog.lower(pg_catalog.btrim(coalesce(v.unit_number, ''))) = v_unit_normalized
  ) then
    raise exception 'vehicle_unit_duplicate' using errcode = '23505';
  end if;

  v_vin_normalized := pg_catalog.regexp_replace(
    pg_catalog.upper(coalesce(new.vin, '')),
    '[^A-Z0-9]',
    '',
    'g'
  );
  if v_vin_normalized <> '' and exists (
    select 1
    from public.vehicles v
    where v.shop_id = new.shop_id
      and v.id <> new.id
      and pg_catalog.regexp_replace(
        pg_catalog.upper(coalesce(v.vin, '')),
        '[^A-Z0-9]',
        '',
        'g'
      ) = v_vin_normalized
  ) then
    raise exception 'vehicle_vin_duplicate' using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function public.vehicles_enforce_normalized_identity_unique()
  from public, anon, authenticated;

drop trigger if exists vehicles_normalized_identity_unique on public.vehicles;
create trigger vehicles_normalized_identity_unique
before insert
on public.vehicles
for each row
execute function public.vehicles_enforce_normalized_identity_unique();

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

  -- Use the same lock as the vehicles insert trigger so Equipment creation
  -- serializes with every canonical vehicle creator, not only Equipment calls.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('canonical_vehicle_identity:' || p_shop_id::text, 0)
  );

  -- p_vehicle_id is also the durable operation identity. If the first request
  -- committed but its response was lost, the same retry returns the completed
  -- asset instead of reporting a false duplicate.
  select * into v_existing
  from public.vehicles v
  where v.id = p_vehicle_id;

  if found then
    if v_existing.shop_id is distinct from p_shop_id
       or pg_catalog.lower(pg_catalog.btrim(coalesce(v_existing.unit_number, ''))) <> v_unit_normalized
       or coalesce(
         pg_catalog.regexp_replace(pg_catalog.upper(coalesce(v_existing.vin, '')), '[^A-Z0-9]', '', 'g'),
         ''
       ) <> coalesce(v_vin, '') then
      raise exception 'equipment_operation_conflict' using errcode = '23505';
    end if;

    if exists (
      select 1
      from public.equipment_asset_profiles e
      where e.vehicle_id = p_vehicle_id
        and e.shop_id = p_shop_id
    ) then
      return p_vehicle_id;
    end if;

    raise exception 'equipment_operation_incomplete' using errcode = '23514';
  end if;

  -- Lock the lifecycle row using the same row lock that customer merges must
  -- acquire. A concurrent merge therefore finishes before we validate/insert,
  -- preventing a new vehicle from being stranded on the retired source account.
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
begin
  if p_shop_id is null
     or p_vehicle_id is null
     or p_actor_user_id is null
     or p_profile is null
     or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'equipment_adoption_invalid' using errcode = '22023';
  end if;

  select * into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id
  for update;

  if not found or v_vehicle.shop_id is distinct from p_shop_id then
    raise exception 'equipment_asset_not_found' using errcode = 'P0002';
  end if;

  if pg_catalog.lower(pg_catalog.btrim(coalesce(v_vehicle.status, ''))) in ('archived', 'merged', 'duplicate', 'inactive') then
    raise exception 'equipment_asset_retired' using errcode = '23514';
  end if;

  if v_vehicle.customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = v_vehicle.customer_id
      and c.shop_id = p_shop_id
      and c.active = true
      and c.archived_at is null
      and c.merged_into_customer_id is null
  ) then
    raise exception 'equipment_customer_inactive' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.equipment_asset_profiles e
    where e.vehicle_id = p_vehicle_id
  ) then
    raise exception 'equipment_profile_exists' using errcode = '23505';
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
