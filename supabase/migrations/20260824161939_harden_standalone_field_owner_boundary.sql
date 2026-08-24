begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Keep the mature Mobile V1 implementation behind a non-exposed boundary.
-- The public command below preserves the Shop-linked contract while enforcing
-- standalone Field invariants for every direct PostgREST caller.
alter function public.mobile_configure_service_v1_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) rename to mobile_configure_service_v1_atomic_internal_v1;

alter function public.mobile_configure_service_v1_atomic_internal_v1(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) set schema private;

revoke all on function private.mobile_configure_service_v1_atomic_internal_v1(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) from public, anon, authenticated, service_role;

create function public.mobile_configure_service_v1_atomic(
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
    if lower(coalesce(v_profile.role, '')) <> 'owner'
      or (
        v_owner_id is distinct from v_profile.id
        and v_owner_id is distinct from v_profile.user_id
      ) then
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

  -- Serialize configuration before the internal command can observe or create
  -- a Mobile V1 vehicle. Existing assignment commands use the same profile /
  -- vehicle lock order.
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

-- Acquire the owner lock before invoking Mobile setup so concurrent first-time
-- standalone requests cannot create two trucks and race the assignment.
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
    and lower(coalesce(profile.role, '')) = 'owner'
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

-- Standalone assignments are setup-owned. Preserve the Shop-linked team
-- command, but prevent direct RPC callers from replacing the owner's truck.
create or replace function public.field_assign_service_vehicle(
  p_shop_id uuid,
  p_service_vehicle_id uuid,
  p_profile_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vehicle public.service_vehicles%rowtype;
  v_actor_profile_id uuid;
  v_subscription_package text;
begin
  select actor.id
    into v_actor_profile_id
  from public.profiles actor
  where actor.shop_id = p_shop_id
    and (actor.id = auth.uid() or actor.user_id = auth.uid())
    and lower(coalesce(actor.role, '')) in ('owner','admin')
  order by (actor.id = auth.uid()) desc, actor.id
  limit 1;

  if v_actor_profile_id is null then
    raise exception 'Field truck assignment requires owner or admin access.'
      using errcode = '42501';
  end if;

  select workspace.subscription_package
    into v_subscription_package
  from public.shops workspace
  where workspace.id = p_shop_id;

  if v_subscription_package = 'field_service' then
    raise exception
      'Standalone Field assigns My Truck through owner setup.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.mobile_field_operators operator
      on operator.shop_id = profile.shop_id
     and operator.profile_id = profile.id
     and operator.enabled
    where profile.id = p_profile_id
      and profile.shop_id = p_shop_id
  ) then
    raise exception 'The selected profile is not an enabled Field operator.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'field-truck-profile:' || p_shop_id::text || ':' || p_profile_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'field-truck-vehicle:' || p_shop_id::text || ':' ||
        p_service_vehicle_id::text,
      0
    )
  );

  select *
    into v_vehicle
  from public.service_vehicles
  where id = p_service_vehicle_id
    and shop_id = p_shop_id
    and active
    and capabilities @> '{"mobile_v1":true}'::jsonb
  for update;

  if not found then
    raise exception 'The selected Field truck is unavailable.'
      using errcode = '22023';
  end if;

  delete from public.field_service_vehicle_assignments assignment
  where assignment.shop_id = p_shop_id
    and (
      assignment.profile_id = p_profile_id
      or assignment.service_vehicle_id = p_service_vehicle_id
    );

  insert into public.field_service_vehicle_assignments (
    shop_id, service_vehicle_id, profile_id, assigned_by_profile_id
  ) values (
    p_shop_id, p_service_vehicle_id, p_profile_id, v_actor_profile_id
  );

  return jsonb_build_object(
    'serviceVehicleId', p_service_vehicle_id,
    'profileId', p_profile_id
  );
end;
$$;

revoke all on function public.field_assign_service_vehicle(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.field_assign_service_vehicle(uuid, uuid, uuid)
  to authenticated, service_role;

-- Make the canonical Field entitlement helper package-aware so every
-- SECURITY DEFINER command that already delegates through it rejects
-- historical standalone team operators. Shop-linked Field keeps the existing
-- explicit enabled-operator contract.
create or replace function public.mobile_profile_has_field_service_access(
  p_shop_id uuid,
  p_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.profixiq_shop_has_product_access(
      p_shop_id,
      'field_service'
    )
    and exists (
      select 1
      from public.mobile_service_settings settings
      join public.mobile_field_operators operator
        on operator.shop_id = settings.shop_id
       and operator.profile_id = p_profile_id
       and operator.enabled
      join public.profiles profile
        on profile.id = operator.profile_id
       and profile.shop_id = settings.shop_id
      join public.shops workspace
        on workspace.id = settings.shop_id
      where settings.shop_id = p_shop_id
        and settings.onboarding_completed_at is not null
        and settings.service_model in ('mobile', 'both')
        and (
          workspace.subscription_package is distinct from 'field_service'
          or (
            lower(coalesce(profile.role, '')) = 'owner'
            and workspace.owner_id in (profile.id, profile.user_id)
            and (
              select count(*)
              from public.service_vehicles candidate
              where candidate.shop_id = workspace.id
                and candidate.primary_user_id = profile.id
                and candidate.active
                and coalesce(candidate.capabilities, '{}'::jsonb)
                  @> '{"mobile_v1":true}'::jsonb
            ) = 1
          )
        )
    );
$$;

revoke all on function public.mobile_profile_has_field_service_access(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mobile_profile_has_field_service_access(uuid, uuid)
  to service_role;

-- Every truck policy and command delegates through this helper. Standalone
-- subscriptions require the canonical workspace owner; Shop-linked Field
-- keeps its existing enabled-operator plus explicit-assignment behavior.
create or replace function public.field_actor_can_access_service_vehicle(
  p_shop_id uuid,
  p_service_vehicle_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.field_service_vehicle_assignments assignment
    join public.profiles profile
      on profile.id = assignment.profile_id
     and profile.shop_id = assignment.shop_id
    join public.shops workspace
      on workspace.id = assignment.shop_id
    join public.service_vehicles vehicle
      on vehicle.id = assignment.service_vehicle_id
     and vehicle.shop_id = assignment.shop_id
     and vehicle.active
     and coalesce(vehicle.capabilities, '{}'::jsonb)
       @> '{"mobile_v1":true}'::jsonb
    where assignment.shop_id = p_shop_id
      and assignment.service_vehicle_id = p_service_vehicle_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
      and public.mobile_profile_has_field_service_access(
        profile.shop_id,
        profile.id
      )
      and (
        workspace.subscription_package is distinct from 'field_service'
        or (
          lower(coalesce(profile.role, '')) = 'owner'
          and workspace.owner_id in (profile.id, profile.user_id)
        )
      )
  );
$$;

revoke all on function public.field_actor_can_access_service_vehicle(uuid, uuid)
  from public, anon;
grant execute on function public.field_actor_can_access_service_vehicle(uuid, uuid)
  to authenticated, service_role;

-- Normalize persisted standalone settings without deleting historical team
-- rows. Those rows become inert because the database access predicate above
-- admits only the canonical owner for a field_service subscription.
update public.mobile_service_settings settings
set service_model = 'mobile',
    solo_mode = true,
    dispatch_enabled = false,
    service_vehicles_enabled = true,
    field_operator_count_target = 1,
    updated_at = now()
from public.shops workspace
where workspace.id = settings.shop_id
  and workspace.subscription_package = 'field_service'
  and (
    settings.service_model is distinct from 'mobile'
    or settings.solo_mode is distinct from true
    or settings.dispatch_enabled is distinct from false
    or settings.service_vehicles_enabled is distinct from true
    or settings.field_operator_count_target is distinct from 1
  );

insert into public.mobile_field_operators (
  shop_id,
  profile_id,
  enabled,
  created_by,
  updated_at
)
select
  workspace.id,
  owner_profile.id,
  true,
  owner_profile.id,
  now()
from public.shops workspace
join public.profiles owner_profile
  on owner_profile.shop_id = workspace.id
 and lower(coalesce(owner_profile.role, '')) = 'owner'
 and workspace.owner_id in (owner_profile.id, owner_profile.user_id)
where workspace.subscription_package = 'field_service'
on conflict (shop_id, profile_id) do update
set enabled = true,
    updated_at = now();

-- Forward-repair only unambiguous owners with exactly one eligible truck.
-- Multi-truck relationships and any existing assignment conflict remain
-- untouched for explicit operator review.
with unambiguous_owner_trucks as (
  select
    workspace.id as shop_id,
    owner_profile.id as profile_id,
    vehicle.id as service_vehicle_id
  from public.shops workspace
  join public.profiles owner_profile
    on owner_profile.shop_id = workspace.id
   and lower(coalesce(owner_profile.role, '')) = 'owner'
   and workspace.owner_id in (owner_profile.id, owner_profile.user_id)
  join public.service_vehicles vehicle
    on vehicle.shop_id = workspace.id
   and vehicle.primary_user_id = owner_profile.id
   and vehicle.active
   and coalesce(vehicle.capabilities, '{}'::jsonb)
     @> '{"mobile_v1":true}'::jsonb
  join public.mobile_service_settings settings
    on settings.shop_id = workspace.id
   and settings.onboarding_completed_at is not null
   and settings.service_model = 'mobile'
  join public.mobile_field_operators operator
    on operator.shop_id = workspace.id
   and operator.profile_id = owner_profile.id
   and operator.enabled
  where workspace.subscription_package = 'field_service'
    and (
      select count(*)
      from public.service_vehicles candidate
      where candidate.shop_id = workspace.id
        and candidate.primary_user_id = owner_profile.id
        and candidate.active
        and coalesce(candidate.capabilities, '{}'::jsonb)
          @> '{"mobile_v1":true}'::jsonb
    ) = 1
)
insert into public.field_service_vehicle_assignments (
  shop_id,
  service_vehicle_id,
  profile_id,
  assigned_by_profile_id
)
select
  candidate.shop_id,
  candidate.service_vehicle_id,
  candidate.profile_id,
  candidate.profile_id
from unambiguous_owner_trucks candidate
where not exists (
  select 1
  from public.field_service_vehicle_assignments assignment
  where assignment.shop_id = candidate.shop_id
    and (
      assignment.profile_id = candidate.profile_id
      or assignment.service_vehicle_id = candidate.service_vehicle_id
    )
)
on conflict do nothing;

comment on function public.mobile_configure_service_v1_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) is
  'Configures Shop-linked Mobile V1 or enforces the canonical standalone Field owner invariants for field_service subscriptions.';

notify pgrst, 'reload schema';

commit;
