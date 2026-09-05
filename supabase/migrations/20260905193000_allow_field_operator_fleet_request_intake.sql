begin;

-- A verified Field operator (a Field Service-entitled shop's enabled field
-- operator, or a standalone Field shop's canonical owner) can now accept a
-- Fleet service request into a Shop work order themselves, alongside the
-- existing owner/admin/manager/advisor intake roles. Field is a full
-- operations workspace for a mobile-mechanic business, which has no
-- separate advisor/manager to hand this off to.
--
-- public.mobile_profile_has_field_service_access already encodes the exact
-- same Field-access boundary used everywhere else (product entitlement,
-- enabled operator flag, completed onboarding, mobile/both service model,
-- and the standalone-owner restriction for a field_service-only shop), so
-- this reuses it rather than re-deriving it. It is granted to service_role
-- only, which is fine here: this function runs security definer, so the
-- inner call executes with the definer's own privileges regardless of the
-- caller's role grants.
create or replace function public.convert_owned_fleet_service_request_to_work_order_atomic(
  p_service_request_id uuid
)
returns table(work_order_id uuid, conversion_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.fleet_service_requests%rowtype;
  v_customer_id uuid;
  v_customer_name text;
  v_work_order_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Fleet service request is unavailable.';
  end if;

  -- Joining the caller's profile into the first lookup prevents this
  -- SECURITY DEFINER function from disclosing whether a guessed request ID
  -- exists in another tenant.
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
  where request.id = p_service_request_id
  for update of request;

  if v_request.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Fleet service request is unavailable.';
  end if;

  select fleet.customer_id, fleet.name
  into v_customer_id, v_customer_name
    from public.fleets fleet
    join public.vehicles vehicle
      on vehicle.id = v_request.vehicle_id
     and vehicle.shop_id = v_request.shop_id
     and vehicle.customer_id = fleet.customer_id
    join public.fleet_vehicles enrollment
      on enrollment.fleet_id = fleet.id
     and enrollment.vehicle_id = vehicle.id
     and (enrollment.shop_id is null or enrollment.shop_id = v_request.shop_id)
     and coalesce(enrollment.active, true)
    where fleet.id = v_request.fleet_id
      and fleet.shop_id = v_request.shop_id
      and fleet.customer_id is not null;

  if v_customer_id is null then
    raise exception using
      errcode = '23514',
      message = 'PFX_FLEET_HANDOFF_UNAVAILABLE';
  end if;

  if v_request.work_order_id is not null then
    return query select v_request.work_order_id, 'already_linked'::text;
    return;
  end if;

  if not exists (
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
    raise exception using
      errcode = '23514',
      message = 'PFX_FLEET_HANDOFF_UNAVAILABLE';
  end if;

  insert into public.work_orders (
    shop_id,
    customer_id,
    customer_name,
    vehicle_id,
    status,
    approval_state,
    source_fleet_service_request_id,
    created_by,
    notes
  ) values (
    v_request.shop_id,
    v_customer_id,
    v_customer_name,
    v_request.vehicle_id,
    'awaiting_approval',
    'pending',
    v_request.id,
    v_user_id,
    concat('Fleet request: ', v_request.title, E'\n', v_request.summary)
  ) returning id into v_work_order_id;

  insert into public.work_order_lines (
    work_order_id,
    shop_id,
    vehicle_id,
    description,
    complaint,
    notes,
    labor_time,
    job_type,
    status,
    approval_state,
    menu_item_id,
    inspection_template_id,
    price_estimate,
    line_type,
    source_fleet_service_request_line_id
  )
  select
    v_work_order_id,
    line.shop_id,
    line.vehicle_id,
    line.description,
    case
      when line.line_kind = 'diagnostic' then line.description
      else null
    end,
    line.notes,
    line.requested_labor_hours,
    case
      when line.line_kind = 'diagnostic' then 'diagnosis'
      when line.line_kind in ('inspection', 'pm_package') then 'maintenance'
      else 'repair'
    end,
    'awaiting',
    'pending',
    line.source_menu_item_id,
    line.source_inspection_template_id,
    case
      when line.unit_price_snapshot is null then null
      else line.unit_price_snapshot * line.quantity
    end,
    'job',
    line.id
  from public.fleet_service_request_lines line
  where line.service_request_id = v_request.id
  order by line.created_at, line.id;

  update public.fleet_service_request_lines source_line
  set work_order_line_id = work_order_line.id,
      updated_at = now()
  from public.work_order_lines work_order_line
  where work_order_line.work_order_id = v_work_order_id
    and work_order_line.source_fleet_service_request_line_id = source_line.id;

  update public.fleet_service_requests
  set work_order_id = v_work_order_id,
      status = 'scheduled',
      updated_at = now()
  where id = v_request.id;

  update public.fleet_pm_due_events
  set service_request_id = v_request.id,
      status = 'converted',
      updated_at = now()
  where id = v_request.source_pm_due_event_id;

  return query select v_work_order_id, 'converted'::text;
end;
$function$;

revoke all on function public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)
  from public, anon;
grant execute on function public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)
  to authenticated, service_role;

do $field_operator_intake_postcheck$
begin
  if to_regprocedure(
    'public.mobile_profile_has_field_service_access(uuid, uuid)'
  ) is null then
    raise exception 'Field service access resolver is missing from migration replay';
  end if;

  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)'::pg_catalog.regprocedure
    ),
    $$public.mobile_profile_has_field_service_access($$
  ) = 0 then
    raise exception 'Fleet conversion does not authorize verified Field operators';
  end if;

  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)'::pg_catalog.regprocedure
    ),
    $$profile.role in ('owner', 'admin', 'manager', 'advisor')$$
  ) = 0 then
    raise exception 'Fleet conversion lost its existing Shop intake roles';
  end if;

  if has_function_privilege(
    'anon',
    'public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous Fleet conversion access is unsafe';
  end if;
end;
$field_operator_intake_postcheck$;

commit;
