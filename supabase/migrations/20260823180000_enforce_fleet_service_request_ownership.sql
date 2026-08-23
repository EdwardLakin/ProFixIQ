begin;

-- Clean migration replay is missing the resolver used by the pre-existing
-- Fleet fill triggers. Production already has it, so create it only when it is
-- absent and leave the live shared contract untouched. A replayed database
-- fails closed when a vehicle has zero or multiple active Fleet enrollments.
do $fleet_resolver_history$
begin
  if to_regprocedure('public.resolve_fleet_id_from_vehicle(uuid)') is null then
    execute $resolver$
      create function public.resolve_fleet_id_from_vehicle(
        p_vehicle_id uuid
      )
      returns uuid
      language plpgsql
      stable
      security invoker
      set search_path = ''
      as $function$
      declare
        v_fleet_id uuid;
        v_active_fleet_count integer;
      begin
        select (array_agg(distinct fv.fleet_id))[1],
               count(distinct fv.fleet_id)::integer
        into v_fleet_id, v_active_fleet_count
        from public.fleet_vehicles fv
        where fv.vehicle_id = p_vehicle_id
          and coalesce(fv.active, true);

        if v_active_fleet_count <> 1 then
          raise exception using
            errcode = '23514',
            message = 'PFX_FLEET_UNIT_ENROLLMENT_UNAVAILABLE';
        end if;

        return v_fleet_id;
      end;
      $function$
    $resolver$;

    revoke all on function public.resolve_fleet_id_from_vehicle(uuid)
      from public, anon;
    grant execute on function public.resolve_fleet_id_from_vehicle(uuid)
      to authenticated, service_role;
  end if;
end;
$fleet_resolver_history$;

-- Keep the established conversion RPC unchanged. The Shop intake route uses
-- this narrowly scoped wrapper to authorize the caller before privileged
-- reads, validate the Fleet/customer/vehicle relationship atomically, and
-- translate Fleet's `diagnostic` vocabulary to Shop's `diagnosis` vocabulary.
create function public.convert_owned_fleet_service_request_to_work_order_atomic(
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
  v_work_order_id uuid;
  v_conversion_status text;
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
   and profile.role in ('owner', 'admin', 'manager', 'advisor')
  where request.id = p_service_request_id
  for update of request;

  if v_request.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Fleet service request is unavailable.';
  end if;

  if not exists (
    select 1
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
      and fleet.customer_id is not null
  ) then
    raise exception using
      errcode = '23514',
      message = 'PFX_FLEET_HANDOFF_UNAVAILABLE';
  end if;

  select converted.work_order_id, converted.conversion_status
  into v_work_order_id, v_conversion_status
  from public.convert_fleet_service_request_to_work_order_atomic(
    p_service_request_id
  ) converted;

  if v_work_order_id is null then
    raise exception using
      errcode = '55000',
      message = 'PFX_FLEET_HANDOFF_UNAVAILABLE';
  end if;

  update public.work_order_lines line
  set job_type = 'diagnosis',
      updated_at = now()
  from public.fleet_service_request_lines source_line
  where line.work_order_id = v_work_order_id
    and line.source_fleet_service_request_line_id = source_line.id
    and source_line.service_request_id = p_service_request_id
    and source_line.line_kind = 'diagnostic'
    and line.job_type is distinct from 'diagnosis';

  return query select v_work_order_id, v_conversion_status;
end;
$function$;

revoke all on function public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)
  from public, anon;
grant execute on function public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)
  to authenticated, service_role;

do $fleet_handoff_postcheck$
begin
  if to_regprocedure(
    'public.resolve_fleet_id_from_vehicle(uuid)'
  ) is null then
    raise exception 'Fleet vehicle resolver is missing from migration replay';
  end if;

  if to_regprocedure(
    'public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)'
  ) is null then
    raise exception 'Owned Fleet request conversion wrapper is missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous Fleet conversion access is unsafe';
  end if;

  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)'::pg_catalog.regprocedure
    ),
    $$profile.shop_id = request.shop_id$$
  ) = 0 then
    raise exception 'Fleet conversion caller authorization is missing';
  end if;
end;
$fleet_handoff_postcheck$;

commit;
