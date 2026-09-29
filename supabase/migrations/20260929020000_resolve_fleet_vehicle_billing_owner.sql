begin;

-- Shop intake blocks converting a Fleet service request into a work order
-- whenever a unit's vehicles.customer_id has drifted from its enrolled
-- Fleet's billing customer_id (see
-- 20260823180000_enforce_fleet_service_request_ownership.sql). Until now the
-- only UI recovery was a dead-end link to a read-only vehicle page with no
-- way to actually fix the mismatch, so Shop staff had no in-app path to
-- resolve it. This adds a narrowly scoped, authorized RPC that realigns
-- vehicles.customer_id to the vehicle's billing customer_id for the exact
-- Fleet that filed the failing request — the same relationship the
-- conversion RPC already requires — without opening a general "reassign to
-- any customer" surface.
--
-- p_fleet_id is required and scopes the fix to that one Fleet's enrollment
-- rather than "whichever Fleet the vehicle happens to be enrolled in right
-- now": a vehicle can be actively enrolled in a different Fleet than the one
-- that filed the request (reassigned since, or the failure is unrelated to
-- billing at all, e.g. malformed request lines), and blindly realigning
-- against "any" active enrollment could bill the wrong customer.
--
-- p_expected_resolved_customer_id and p_expect_previous_customer /
-- p_expected_previous_customer_id let the caller confirm exactly what it
-- diagnosed: when applying (p_apply = true), the mutation is rejected if the
-- current, freshly-locked state no longer matches — closing a
-- confirm-stale-preview race where the vehicle owner or Fleet billing
-- account changed between the GET preview and the POST confirmation.
-- previous_customer_id is nullable (a vehicle can have no prior customer),
-- so a null expected value alone can't distinguish "confirm it's still
-- null" from "don't check this field" — p_expect_previous_customer makes
-- that explicit instead of overloading null.
create function public.resolve_fleet_vehicle_billing_owner(
  p_vehicle_id uuid,
  p_fleet_id uuid,
  p_apply boolean default false,
  p_expected_resolved_customer_id uuid default null,
  p_expect_previous_customer boolean default false,
  p_expected_previous_customer_id uuid default null
)
returns table (
  already_aligned boolean,
  applied boolean,
  vehicle_id uuid,
  fleet_id uuid,
  fleet_name text,
  previous_customer_id uuid,
  previous_customer_name text,
  resolved_customer_id uuid,
  resolved_customer_name text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_actor_role text;
  v_vehicle public.vehicles%rowtype;
  v_fleet_name text;
  v_fleet_customer_id uuid;
  v_previous_customer_name text;
  v_resolved_customer_name text;
  v_already_aligned boolean;
  v_applied boolean := false;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'PFX_FLEET_VEHICLE_UNAVAILABLE';
  end if;

  -- Imported/legacy staff can retain a canonical profiles.id distinct from
  -- their auth subject and link through profiles.user_id instead (the same
  -- two-step resolution features/shared/lib/authenticated-profile.ts uses),
  -- so check both identity shapes rather than only profiles.id.
  select profile.id, profile.role
  into v_profile_id, v_actor_role
  from public.profiles profile
  where profile.id = v_user_id;

  if v_profile_id is null then
    select profile.id, profile.role
    into v_profile_id, v_actor_role
    from public.profiles profile
    where profile.user_id = v_user_id;
  end if;

  if v_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'PFX_FLEET_VEHICLE_UNAVAILABLE';
  end if;

  -- Joining the caller's profile into the vehicle lookup prevents this
  -- SECURITY DEFINER function from disclosing whether a guessed vehicle ID
  -- exists in another tenant. A verified Field operator (a Field
  -- Service-entitled shop's enabled operator, or a standalone Field shop's
  -- canonical owner) is authorized the same way the conversion RPC already
  -- authorizes them for accepting the underlying request; see
  -- 20260905193000_allow_field_operator_fleet_request_intake.sql.
  select vehicle.*
  into v_vehicle
  from public.vehicles vehicle
  join public.profiles profile
    on profile.id = v_profile_id
   and profile.shop_id = vehicle.shop_id
   and (
     profile.role in ('owner', 'admin', 'manager', 'advisor')
     or public.mobile_profile_has_field_service_access(
       vehicle.shop_id,
       profile.id
     )
   )
  where vehicle.id = p_vehicle_id
  for update of vehicle;

  if v_vehicle.id is null then
    raise exception using
      errcode = '42501',
      message = 'PFX_FLEET_VEHICLE_UNAVAILABLE';
  end if;

  select fleet.name, fleet.customer_id
  into v_fleet_name, v_fleet_customer_id
  from public.fleets fleet
  join public.fleet_vehicles enrollment
    on enrollment.fleet_id = fleet.id
   and enrollment.vehicle_id = v_vehicle.id
   and (enrollment.shop_id is null or enrollment.shop_id = v_vehicle.shop_id)
   and coalesce(enrollment.active, true)
  where fleet.id = p_fleet_id
    and fleet.shop_id = v_vehicle.shop_id;

  if v_fleet_name is null then
    raise exception using
      errcode = '23514',
      message = 'PFX_FLEET_VEHICLE_ENROLLMENT_MISSING';
  end if;

  if v_fleet_customer_id is null then
    raise exception using
      errcode = '23514',
      message = 'Fleet billing account is unavailable';
  end if;

  -- Scoped to the vehicle's own shop: this is a SECURITY DEFINER read that
  -- bypasses customer RLS, so it must never resolve a customer name across
  -- tenants even if a caller supplies (or a stale row briefly holds) an ID
  -- belonging to another shop.
  select customer.name into v_previous_customer_name
  from public.customers customer
  where customer.id = v_vehicle.customer_id
    and customer.shop_id = v_vehicle.shop_id;

  select customer.name into v_resolved_customer_name
  from public.customers customer
  where customer.id = v_fleet_customer_id
    and customer.shop_id = v_vehicle.shop_id;

  v_already_aligned := v_vehicle.customer_id is not distinct from v_fleet_customer_id;

  if not v_already_aligned and p_apply then
    if (
      p_expect_previous_customer
      and p_expected_previous_customer_id is distinct from v_vehicle.customer_id
    ) or (
      p_expected_resolved_customer_id is not null
      and p_expected_resolved_customer_id is distinct from v_fleet_customer_id
    ) then
      raise exception using
        errcode = '40001',
        message = 'PFX_FLEET_BILLING_OWNER_STALE';
    end if;

    update public.vehicles
    set customer_id = v_fleet_customer_id
    where id = v_vehicle.id;

    v_applied := true;

    insert into public.operational_events (
      shop_id, event_type, actor_user_id, actor_role, entity_type,
      entity_id, source, metadata
    ) values (
      v_vehicle.shop_id, 'vehicle.billing_owner_reassigned', v_user_id,
      v_actor_role, 'vehicle', v_vehicle.id, 'fleet_service_request_intake',
      jsonb_build_object(
        'fleet_id', p_fleet_id,
        'fleet_name', v_fleet_name,
        'previous_customer_id', v_vehicle.customer_id,
        'previous_customer_name', v_previous_customer_name,
        'resolved_customer_id', v_fleet_customer_id,
        'resolved_customer_name', v_resolved_customer_name
      )
    );
  end if;

  return query select
    v_already_aligned,
    v_applied,
    v_vehicle.id,
    p_fleet_id,
    v_fleet_name,
    v_vehicle.customer_id,
    v_previous_customer_name,
    v_fleet_customer_id,
    v_resolved_customer_name;
end;
$function$;

revoke all on function public.resolve_fleet_vehicle_billing_owner(uuid, uuid, boolean, uuid, boolean, uuid)
  from public, anon;
grant execute on function public.resolve_fleet_vehicle_billing_owner(uuid, uuid, boolean, uuid, boolean, uuid)
  to authenticated, service_role;

commit;
