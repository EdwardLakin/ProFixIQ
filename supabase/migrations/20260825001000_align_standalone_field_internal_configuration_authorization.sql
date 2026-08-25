begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- The public configuration wrappers now authorize standalone Field from the
-- canonical shops.owner_id identity. Align their private executor with that
-- same decision while preserving the Shop-linked owner/admin contract and the
-- existing Mobile V1 mutation behavior.
create or replace function private.mobile_configure_service_v1_atomic_internal_v1(
  p_shop_id uuid,
  p_service_model text,
  p_solo_mode boolean,
  p_dispatch_enabled boolean,
  p_service_vehicles_enabled boolean,
  p_truck_inventory_enabled boolean,
  p_default_visit_minutes integer,
  p_field_operator_count_target integer,
  p_enable_current_actor_field_operator boolean,
  p_service_vehicle_name text,
  p_service_vehicle_unit_number text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_subscription_package text;
  v_owner_id uuid;
  v_model text := lower(coalesce(p_service_model, 'mobile'));
  v_vehicle_id uuid;
  v_stock_location_id uuid;
  v_stock_code text;
  v_unit_number text := nullif(trim(coalesce(p_service_vehicle_unit_number, '')), '');
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'Workspace access is required.';
  end if;

  select workspace.subscription_package, workspace.owner_id
    into v_subscription_package, v_owner_id
  from public.shops workspace
  where workspace.id = p_shop_id;

  if not found then
    raise exception using errcode = '42501', message = 'Workspace access is required.';
  end if;

  if v_subscription_package = 'field_service' then
    if v_owner_id is distinct from v_profile.id
      and v_owner_id is distinct from v_profile.user_id then
      raise exception using
        errcode = '42501',
        message = 'Standalone Field owner access is required.';
    end if;
  elsif lower(coalesce(v_profile.role, '')) not in ('owner','admin') then
    raise exception using errcode = '42501', message = 'Owner or admin access is required.';
  end if;

  if v_model not in ('shop','mobile','both') then
    raise exception using errcode = '22023', message = 'Invalid service model.';
  end if;
  if coalesce(p_default_visit_minutes, 0) not between 5 and 720 then
    raise exception using errcode = '22023', message = 'Default visit length must be between 5 and 720 minutes.';
  end if;
  if coalesce(p_field_operator_count_target, 0) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Field operator target is invalid.';
  end if;

  insert into public.mobile_service_settings(
    shop_id, service_model, solo_mode, dispatch_enabled,
    service_vehicles_enabled, truck_inventory_enabled,
    default_visit_minutes, field_operator_count_target,
    onboarding_completed_at, configured_by, updated_at
  ) values (
    p_shop_id, v_model, coalesce(p_solo_mode, false), coalesce(p_dispatch_enabled, true),
    coalesce(p_service_vehicles_enabled, false), coalesce(p_truck_inventory_enabled, false),
    p_default_visit_minutes, p_field_operator_count_target,
    now(), v_profile.id, now()
  ) on conflict (shop_id) do update set
    service_model = excluded.service_model,
    solo_mode = excluded.solo_mode,
    dispatch_enabled = excluded.dispatch_enabled,
    service_vehicles_enabled = excluded.service_vehicles_enabled,
    truck_inventory_enabled = excluded.truck_inventory_enabled,
    default_visit_minutes = excluded.default_visit_minutes,
    field_operator_count_target = excluded.field_operator_count_target,
    onboarding_completed_at = coalesce(public.mobile_service_settings.onboarding_completed_at, now()),
    configured_by = excluded.configured_by,
    updated_at = now();

  insert into public.mobile_field_operators(shop_id, profile_id, enabled, created_by, updated_at)
  values (p_shop_id, v_profile.id, coalesce(p_enable_current_actor_field_operator, false), v_profile.id, now())
  on conflict (shop_id, profile_id) do update set
    enabled = excluded.enabled,
    updated_at = now();

  if coalesce(p_service_vehicles_enabled, false) then
    select sv.id, sv.stock_location_id
      into v_vehicle_id, v_stock_location_id
    from public.service_vehicles sv
    where sv.shop_id = p_shop_id
      and sv.primary_user_id = v_profile.id
      and coalesce(sv.capabilities, '{}'::jsonb) @> '{"mobile_v1":true}'::jsonb
    order by sv.created_at
    limit 1
    for update;

    if v_unit_number is not null and exists (
      select 1
      from public.service_vehicles sv
      where sv.shop_id = p_shop_id
        and lower(trim(coalesce(sv.unit_number, ''))) = lower(v_unit_number)
        and (v_vehicle_id is null or sv.id <> v_vehicle_id)
    ) then
      raise exception using errcode = '23505', message = 'Service vehicle unit number is already in use.';
    end if;

    if coalesce(p_truck_inventory_enabled, false) and v_stock_location_id is null then
      v_stock_code := 'TRUCK-' || upper(substr(replace(v_profile.id::text, '-', ''), 1, 8));
      insert into public.stock_locations(shop_id, code, name)
      values (
        p_shop_id,
        v_stock_code,
        coalesce(nullif(trim(p_service_vehicle_name), ''), 'Service Truck') || ' Inventory'
      )
      on conflict (shop_id, code) do update set name = excluded.name
      returning id into v_stock_location_id;
    elsif not coalesce(p_truck_inventory_enabled, false) then
      v_stock_location_id := null;
    end if;

    if v_vehicle_id is null then
      insert into public.service_vehicles(
        shop_id, name, unit_number, primary_user_id, stock_location_id,
        active, capabilities, created_by, updated_at
      ) values (
        p_shop_id,
        coalesce(nullif(trim(p_service_vehicle_name), ''), 'Service Truck'),
        v_unit_number,
        v_profile.id,
        v_stock_location_id,
        true,
        jsonb_build_object('mobile_v1', true),
        v_profile.id,
        now()
      ) returning id into v_vehicle_id;
    else
      update public.service_vehicles
      set name = coalesce(nullif(trim(p_service_vehicle_name), ''), name),
          unit_number = v_unit_number,
          stock_location_id = v_stock_location_id,
          active = true,
          capabilities = coalesce(capabilities, '{}'::jsonb) || jsonb_build_object('mobile_v1', true),
          updated_at = now()
      where id = v_vehicle_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'shopId', p_shop_id,
    'profileId', v_profile.id,
    'fieldOperator', coalesce(p_enable_current_actor_field_operator, false),
    'serviceVehicleId', v_vehicle_id,
    'stockLocationId', v_stock_location_id
  );
end;
$$;


revoke all on function private.mobile_configure_service_v1_atomic_internal_v1(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) from public, anon, authenticated, service_role;

comment on function private.mobile_configure_service_v1_atomic_internal_v1(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) is
  'Executes canonical Mobile V1 configuration behind protected public wrappers; standalone Field authorization follows canonical workspace ownership.';

do $postcheck$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'private.mobile_configure_service_v1_atomic_internal_v1(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)'::regprocedure
  ) into v_definition;

  if position(
    $standalone_branch$if v_subscription_package = 'field_service' then$standalone_branch$
    in v_definition
  ) = 0
    or position(
      $profile_owner$v_owner_id is distinct from v_profile.id$profile_owner$
      in v_definition
    ) = 0
    or position(
      $user_owner$v_owner_id is distinct from v_profile.user_id$user_owner$
      in v_definition
    ) = 0 then
    raise exception 'Private Mobile configuration authorization is not aligned to canonical standalone ownership';
  end if;

  if position(
    $legacy_gate$if not found or lower(coalesce(v_profile.role, '')) not in ('owner','admin')$legacy_gate$
    in lower(v_definition)
  ) > 0 then
    raise exception 'Private Mobile configuration still uses the legacy role-only gate';
  end if;

  if has_function_privilege(
    'anon',
    'private.mobile_configure_service_v1_atomic_internal_v1(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.mobile_configure_service_v1_atomic_internal_v1(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.mobile_configure_service_v1_atomic_internal_v1(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Private Mobile configuration executor must remain non-callable';
  end if;
end;
$postcheck$;

notify pgrst, 'reload schema';

commit;
