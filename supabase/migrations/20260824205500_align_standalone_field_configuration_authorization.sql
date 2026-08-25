begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Standalone Field configuration authorization follows canonical workspace
-- ownership, not a historical profile role label. Preserve the public signature,
-- actor binding, lock order, Shop-linked role contract, and internal command.
create or replace function public.mobile_configure_service_v1_atomic(
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
set search_path = public, private, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_subscription_package text;
  v_owner_id uuid;
  v_existing_vehicle_count integer;
  v_existing_vehicle_id uuid;
  v_service_model text := p_service_model;
  v_solo_mode boolean := p_solo_mode;
  v_dispatch_enabled boolean := p_dispatch_enabled;
  v_service_vehicles_enabled boolean := p_service_vehicles_enabled;
  v_field_operator_count_target integer := p_field_operator_count_target;
  v_enable_current_actor_field_operator boolean :=
    p_enable_current_actor_field_operator;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Authenticated actor mismatch.';
  end if;

  select *
    into v_profile
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (
      profile.id = p_actor_user_id
      or profile.user_id = p_actor_user_id
    )
  order by (profile.id = p_actor_user_id) desc, profile.id
  limit 1;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Workspace access is required.';
  end if;

  select workspace.subscription_package, workspace.owner_id
    into v_subscription_package, v_owner_id
  from public.shops workspace
  where workspace.id = p_shop_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Workspace access is required.';
  end if;

  if v_subscription_package = 'field_service' then
    if v_owner_id is distinct from v_profile.id
      and v_owner_id is distinct from v_profile.user_id then
      raise exception using
        errcode = '42501',
        message = 'Standalone Field owner access is required.';
    end if;

    v_service_model := 'mobile';
    v_solo_mode := true;
    v_dispatch_enabled := false;
    v_service_vehicles_enabled := true;
    v_field_operator_count_target := 1;
    v_enable_current_actor_field_operator := true;
  elsif lower(coalesce(v_profile.role, '')) not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Owner or admin access is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'field-truck-profile:' || p_shop_id::text || ':' || v_profile.id::text,
      0
    )
  );

  if v_subscription_package = 'field_service' then
    select count(*)
      into v_existing_vehicle_count
    from public.service_vehicles vehicle
    where vehicle.shop_id = p_shop_id
      and vehicle.primary_user_id = v_profile.id
      and coalesce(vehicle.capabilities, '{}'::jsonb)
        @> '{"mobile_v1":true}'::jsonb;

    if v_existing_vehicle_count > 1 then
      raise exception using
        errcode = '23514',
        message = 'Standalone Field has multiple eligible My Truck vehicles and requires explicit repair.';
    end if;
  end if;

  select vehicle.id
    into v_existing_vehicle_id
  from public.service_vehicles vehicle
  where vehicle.shop_id = p_shop_id
    and vehicle.primary_user_id = v_profile.id
    and coalesce(vehicle.capabilities, '{}'::jsonb)
      @> '{"mobile_v1":true}'::jsonb
  order by vehicle.created_at, vehicle.id
  limit 1;

  if v_existing_vehicle_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'field-truck-vehicle:' || p_shop_id::text || ':' ||
          v_existing_vehicle_id::text,
        0
      )
    );
  end if;

  return private.mobile_configure_service_v1_atomic_internal_v1(
    p_shop_id,
    v_service_model,
    v_solo_mode,
    v_dispatch_enabled,
    v_service_vehicles_enabled,
    p_truck_inventory_enabled,
    p_default_visit_minutes,
    v_field_operator_count_target,
    v_enable_current_actor_field_operator,
    p_service_vehicle_name,
    p_service_vehicle_unit_number,
    p_actor_user_id
  );
end;
$$;

revoke all on function public.mobile_configure_service_v1_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) from public, anon;
grant execute on function public.mobile_configure_service_v1_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) to authenticated, service_role;

create or replace function public.field_configure_standalone_owner_atomic(
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
  v_profile_id uuid;
  v_result jsonb;
  v_vehicle_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Authenticated actor mismatch.';
  end if;

  select profile.id
    into v_profile_id
  from public.profiles profile
  join public.shops workspace
    on workspace.id = profile.shop_id
   and workspace.id = p_shop_id
   and workspace.subscription_package = 'field_service'
   and workspace.owner_id in (profile.id, profile.user_id)
  where (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by (profile.id = p_actor_user_id) desc, profile.id
  limit 1;

  if v_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'Standalone Field owner access is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'field-truck-profile:' || p_shop_id::text || ':' || v_profile_id::text,
      0
    )
  );

  v_result := public.mobile_configure_service_v1_atomic(
    p_shop_id,
    'mobile',
    true,
    false,
    true,
    coalesce(p_truck_inventory_enabled, false),
    p_default_visit_minutes,
    1,
    true,
    p_service_vehicle_name,
    p_service_vehicle_unit_number,
    p_actor_user_id
  );

  v_vehicle_id := nullif(v_result ->> 'serviceVehicleId', '')::uuid;
  if v_vehicle_id is null then
    raise exception using
      errcode = '23514',
      message = 'Standalone Field setup requires My Truck.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'field-truck-vehicle:' || p_shop_id::text || ':' || v_vehicle_id::text,
      0
    )
  );

  delete from public.field_service_vehicle_assignments assignment
  where assignment.shop_id = p_shop_id
    and (
      assignment.profile_id = v_profile_id
      or assignment.service_vehicle_id = v_vehicle_id
    );

  insert into public.field_service_vehicle_assignments (
    shop_id,
    service_vehicle_id,
    profile_id,
    assigned_by_profile_id
  ) values (
    p_shop_id,
    v_vehicle_id,
    v_profile_id,
    v_profile_id
  );

  return v_result || jsonb_build_object(
    'standaloneFieldWorkspace', true,
    'fieldOwnerProfileId', v_profile_id,
    'serviceVehicleId', v_vehicle_id
  );
end;
$$;

revoke all on function public.field_configure_standalone_owner_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) from public, anon;
grant execute on function public.field_configure_standalone_owner_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) to authenticated, service_role;

comment on function public.mobile_configure_service_v1_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) is
  'Configures Mobile V1 atomically; standalone Field authorization follows canonical workspace ownership.';
comment on function public.field_configure_standalone_owner_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) is
  'Configures standalone Field for the canonical workspace owner, independent of historical profile role labels.';

do $postcheck$
declare
  v_mobile_definition text;
  v_owner_definition text;
begin
  select pg_get_functiondef(
    'public.mobile_configure_service_v1_atomic(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)'::regprocedure
  ) into v_mobile_definition;

  select pg_get_functiondef(
    'public.field_configure_standalone_owner_atomic(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)'::regprocedure
  ) into v_owner_definition;

  if position(
    $role_gate$if lower(coalesce(v_profile.role, '')) <> 'owner'$role_gate$
    in lower(v_mobile_definition)
  ) > 0 then
    raise exception 'mobile_configure_service_v1_atomic still requires the standalone owner role label';
  end if;

  if position(
    $role_gate$and lower(coalesce(profile.role, '')) = 'owner'$role_gate$
    in lower(v_owner_definition)
  ) > 0 then
    raise exception 'field_configure_standalone_owner_atomic still requires the standalone owner role label';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.mobile_configure_service_v1_atomic(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.mobile_configure_service_v1_atomic(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.mobile_configure_service_v1_atomic(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.field_configure_standalone_owner_atomic(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.field_configure_standalone_owner_atomic(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.field_configure_standalone_owner_atomic(uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Standalone Field configuration ACL mismatch';
  end if;
end;
$postcheck$;

notify pgrst, 'reload schema';

commit;
