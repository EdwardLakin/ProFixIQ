begin;

-- convert_owned_fleet_service_request_to_work_order_atomic raises the same
-- PFX_FLEET_HANDOFF_UNAVAILABLE for unrelated causes: the unit's
-- vehicles.customer_id drifted from the Fleet's billing customer, the unit is
-- not actively enrolled in the requesting Fleet, the Fleet has no billing
-- account, or the request has no / mismatched service lines. The Shop inbox
-- could therefore not tell staff which problem they had and offered the
-- billing-owner recovery for all of them.
--
-- This is a read-only companion: it applies the same caller authorization as
-- the conversion RPC, evaluates the same conditions in the same order without
-- changing any row, and reports which one applies plus the account names
-- needed to show an actionable message. It changes no existing function.
create function public.diagnose_fleet_service_request_handoff(
  p_service_request_id uuid
)
returns table (
  cause text,
  vehicle_id uuid,
  unit_label text,
  fleet_id uuid,
  fleet_name text,
  vehicle_customer_id uuid,
  vehicle_customer_name text,
  fleet_customer_id uuid,
  fleet_customer_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.fleet_service_requests%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_fleet public.fleets%rowtype;
  v_enrolled boolean;
  v_cause text;
  v_vehicle_customer_name text;
  v_fleet_customer_name text;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Fleet service request is unavailable.';
  end if;

  -- Same tenant/role join as the conversion RPC, so a guessed request ID in
  -- another shop is indistinguishable from a missing one.
  select request.*
  into v_request
  from public.fleet_service_requests request
  join public.profiles profile
    on profile.id = v_user_id
   and profile.shop_id = request.shop_id
   and (
     profile.role in ('owner', 'admin', 'manager', 'advisor')
     or public.mobile_profile_has_field_service_access(
       request.shop_id,
       profile.id
     )
   )
  where request.id = p_service_request_id;

  if v_request.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Fleet service request is unavailable.';
  end if;

  select vehicle.* into v_vehicle
  from public.vehicles vehicle
  where vehicle.id = v_request.vehicle_id
    and vehicle.shop_id = v_request.shop_id;

  select fleet.* into v_fleet
  from public.fleets fleet
  where fleet.id = v_request.fleet_id
    and fleet.shop_id = v_request.shop_id;

  select exists (
    select 1
    from public.fleet_vehicles enrollment
    where enrollment.fleet_id = v_request.fleet_id
      and enrollment.vehicle_id = v_request.vehicle_id
      and (enrollment.shop_id is null or enrollment.shop_id = v_request.shop_id)
      and coalesce(enrollment.active, true)
  ) into v_enrolled;

  -- Customer names are scoped to the request's shop: this is a SECURITY
  -- DEFINER read that bypasses customer RLS.
  select customer.name into v_vehicle_customer_name
  from public.customers customer
  where customer.id = v_vehicle.customer_id
    and customer.shop_id = v_request.shop_id;

  select customer.name into v_fleet_customer_name
  from public.customers customer
  where customer.id = v_fleet.customer_id
    and customer.shop_id = v_request.shop_id;

  if v_vehicle.id is null or v_fleet.id is null then
    v_cause := 'vehicle_unavailable';
  elsif not v_enrolled then
    v_cause := 'enrollment_missing';
  elsif v_fleet.customer_id is null then
    v_cause := 'billing_unavailable';
  elsif v_vehicle.customer_id is distinct from v_fleet.customer_id then
    v_cause := 'ownership_mismatch';
  elsif v_request.work_order_id is not null then
    v_cause := 'already_converted';
  elsif not exists (
    select 1
    from public.fleet_service_request_lines line
    where line.service_request_id = v_request.id
  ) or exists (
    select 1
    from public.fleet_service_request_lines line
    where line.service_request_id = v_request.id
      and (
        line.shop_id <> v_request.shop_id
        or line.fleet_id <> v_request.fleet_id
        or line.vehicle_id <> v_request.vehicle_id
      )
  ) then
    v_cause := 'lines_invalid';
  else
    v_cause := 'ready';
  end if;

  return query select
    v_cause,
    v_vehicle.id,
    v_vehicle.unit_number,
    v_fleet.id,
    v_fleet.name,
    v_vehicle.customer_id,
    v_vehicle_customer_name,
    v_fleet.customer_id,
    v_fleet_customer_name;
end;
$function$;

revoke all on function public.diagnose_fleet_service_request_handoff(uuid)
  from public, anon;
grant execute on function public.diagnose_fleet_service_request_handoff(uuid)
  to authenticated, service_role;

commit;
