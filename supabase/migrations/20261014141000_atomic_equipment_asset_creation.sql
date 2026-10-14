-- Atomic Equipment front-door asset creation.
--
-- Serializes Equipment creation per shop, evaluates duplicate ownership using
-- the same trimmed/case-normalized unit semantics used by the application,
-- and creates the canonical vehicle + Equipment profile/meter state in one
-- transaction. Service-role only; the API authenticates/authorizes callers
-- and verifies the Equipment entitlement before invoking this RPC.

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

  -- One Equipment create per shop at a time. This deliberately favors a
  -- simple, durable correctness boundary over parallelism for a rare setup
  -- operation, and closes the check/insert race even when no duplicate row
  -- exists yet to lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('equipment_asset_create:' || p_shop_id::text, 0)
  );

  -- Recheck customer lifecycle inside the same transaction so an account
  -- archived/merged between the API precheck and this RPC cannot be assigned.
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
    id,
    shop_id,
    customer_id,
    unit_number,
    year,
    make,
    model,
    vin,
    engine_hours
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
