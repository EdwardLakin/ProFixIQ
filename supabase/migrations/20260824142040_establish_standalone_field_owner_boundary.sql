begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- A standalone Field subscription owns its workspace directly. Keep the
-- existing Shop-linked setup command unchanged and wrap it with the stricter
-- solo-owner invariants required by a field_service-only subscription.
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

  -- Standalone Field starts as one owner/operator with one required My Truck.
  -- Caller-supplied team/shop mode flags are deliberately ignored here.
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
      'field-truck-profile:' || p_shop_id::text || ':' || v_profile_id::text,
      0
    )
  );
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

-- Repair standalone owners created after the original one-time My Truck
-- backfill. Ambiguous/conflicting historical relationships remain untouched.
with standalone_owner_trucks as (
  select
    workspace.id as shop_id,
    owner_profile.id as profile_id,
    vehicle.id as service_vehicle_id,
    row_number() over (
      partition by workspace.id, owner_profile.id
      order by vehicle.created_at, vehicle.id
    ) as candidate_rank
  from public.shops workspace
  join public.profiles owner_profile
    on owner_profile.shop_id = workspace.id
   and lower(coalesce(owner_profile.role, '')) = 'owner'
   and workspace.owner_id in (owner_profile.id, owner_profile.user_id)
  join public.mobile_service_settings settings
    on settings.shop_id = workspace.id
   and settings.onboarding_completed_at is not null
   and settings.service_model in ('mobile', 'both')
  join public.mobile_field_operators operator
    on operator.shop_id = workspace.id
   and operator.profile_id = owner_profile.id
   and operator.enabled
  join public.service_vehicles vehicle
    on vehicle.shop_id = workspace.id
   and vehicle.primary_user_id = owner_profile.id
   and vehicle.active
   and coalesce(vehicle.capabilities, '{}'::jsonb)
     @> '{"mobile_v1":true}'::jsonb
  where workspace.subscription_package = 'field_service'
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
from standalone_owner_trucks candidate
where candidate.candidate_rank = 1
  and not exists (
    select 1
    from public.field_service_vehicle_assignments assignment
    where assignment.shop_id = candidate.shop_id
      and (
        assignment.profile_id = candidate.profile_id
        or assignment.service_vehicle_id = candidate.service_vehicle_id
      )
  )
on conflict do nothing;

-- The helper used by this policy is intentionally not executable by ordinary
-- clients. Delegate the check through the protected, authenticated-safe truck
-- access function instead of weakening that helper's grants.
drop policy if exists field_service_vehicle_assignments_self_select
  on public.field_service_vehicle_assignments;
create policy field_service_vehicle_assignments_self_select
on public.field_service_vehicle_assignments
for select
to authenticated
using (
  public.field_actor_can_access_service_vehicle(
    field_service_vehicle_assignments.shop_id,
    field_service_vehicle_assignments.service_vehicle_id
  )
);

comment on function public.field_configure_standalone_owner_atomic(
  uuid, text, boolean, boolean, boolean, boolean,
  integer, integer, boolean, text, text, uuid
) is
  'Configures a field_service-only workspace as one owner/operator with a required, self-assigned My Truck.';

notify pgrst, 'reload schema';

commit;
