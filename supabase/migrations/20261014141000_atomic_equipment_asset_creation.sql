-- Atomic Equipment front-door creation and adoption.
--
-- Creation is serialized per shop, evaluates duplicate ownership using the
-- same trimmed/case-normalized unit semantics used by the application, and
-- creates the canonical vehicle + Equipment profile/meter state in one
-- transaction. Adoption locks and revalidates the canonical asset/customer
-- immediately before inserting the Equipment profile. Both RPCs are
-- service-role only; API routes authenticate/authorize callers and verify
-- Equipment entitlement before invocation.

create or replace function public.create_equipment_asset_atomic(
  p_shop_id uuid,
  p_vehicle_id uuid,
  p_customer_id uuid,
  p_unit_number text,
  p_year integer,
  p_make text,
  p_model text,
  p_vin text,
  p_engine_hours integer,
  p_actor_user_id uuid,
  p_profile jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit_normalized text;
begin
  if p_shop_id is null
     or p_vehicle_id is null
     or p_actor_user_id is null
     or p_profile is null
     or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'equipment_create_invalid' using errcode = '22023';
  end if;

  v_unit_normalized := pg_catalog.lower(pg_catalog.btrim(coalesce(p_unit_number, '')));
  if v_unit_normalized = '' then
    raise exception 'equipment_unit_required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('equipment_asset_create:' || p_shop_id::text, 0)
  );

  if p_customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.shop_id = p_shop_id
      and c.active = true
      and c.archived_at is null
      and c.merged_into_customer_id is null
  ) then
    raise exception 'equipment_customer_inactive' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.vehicles v
    where v.shop_id = p_shop_id
      and pg_catalog.lower(pg_catalog.btrim(coalesce(v.unit_number, ''))) = v_unit_normalized
  ) then
    raise exception 'equipment_unit_duplicate' using errcode = '23505';
  end if;

  if p_vin is not null and exists (
    select 1
    from public.vehicles v
    where v.shop_id = p_shop_id
      and pg_catalog.regexp_replace(
        pg_catalog.upper(coalesce(v.vin, '')),
        '[^A-Z0-9]',
        '',
        'g'
      ) = p_vin
  ) then
    raise exception 'equipment_vin_duplicate' using errcode = '23505';
  end if;

  insert into public.vehicles (
    id, shop_id, customer_id, unit_number, year, make, model, vin, engine_hours
  )
  values (
    p_vehicle_id,
    p_shop_id,
    p_customer_id,
    pg_catalog.btrim(p_unit_number),
    p_year,
    p_make,
    p_model,
    p_vin,
    null
  );

  perform public.save_equipment_asset_profile(
    p_shop_id,
    p_vehicle_id,
    p_actor_user_id,
    p_profile,
    p_engine_hours is not null,
    p_engine_hours,
    null,
    false,
    null,
    null
  );

  return p_vehicle_id;
end;
$$;

revoke all on function public.create_equipment_asset_atomic(
  uuid, uuid, uuid, text, integer, text, text, text, integer, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.create_equipment_asset_atomic(
  uuid, uuid, uuid, text, integer, text, text, text, integer, uuid, jsonb
) to service_role;

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

  if pg_catalog.lower(coalesce(v_vehicle.status, '')) in ('archived', 'merged', 'duplicate', 'inactive') then
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
