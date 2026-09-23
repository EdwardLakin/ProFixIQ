-- Keep Fleet-authored maintenance inspection templates private to their
-- owning Fleet while preserving Shop-wide inspection templates for every Fleet
-- connected to the Shop.
--
-- This is a compatibility repair for create_fleet_service_request_atomic:
-- signature, replay semantics, request creation, and Shop handoff remain
-- unchanged. Only inspection-template authorization is narrowed.

create or replace function public.create_fleet_service_request_atomic(
  p_fleet_id uuid,
  p_vehicle_id uuid,
  p_title text,
  p_summary text,
  p_requested_for_date date,
  p_lines jsonb,
  p_operation_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_request_id uuid;
  v_existing_fingerprint text;
  v_request_fingerprint text;
  v_line jsonb;
  v_line_kind text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_operation_key is null
     or length(btrim(p_operation_key)) < 8
     or length(btrim(p_operation_key)) > 200 then
    raise exception 'A valid operation key is required';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one structured request line is required';
  end if;

  select f.shop_id into v_shop_id
  from public.fleets f
  where f.id = p_fleet_id;

  if v_shop_id is null then
    raise exception 'Fleet not found';
  end if;

  if not exists (
    select 1 from public.fleet_vehicles fv
    where fv.fleet_id = p_fleet_id
      and fv.vehicle_id = p_vehicle_id
      and coalesce(fv.active, true)
  ) then
    raise exception 'Unit is not active in this fleet';
  end if;

  if not (
    exists (
      select 1 from public.profiles p
      where p.id = v_user_id
        and p.shop_id = v_shop_id
        and p.role in ('owner', 'admin', 'manager')
    )
    or exists (
      select 1 from public.fleet_members m
      where m.user_id = v_user_id
        and m.fleet_id = p_fleet_id
        and m.role in (
          'owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver'
        )
    )
  ) then
    raise exception 'Fleet management access required';
  end if;

  v_request_fingerprint := md5(
    jsonb_build_object(
      'fleetId', p_fleet_id,
      'vehicleId', p_vehicle_id,
      'title', left(coalesce(nullif(btrim(p_title), ''), 'Fleet service request'), 160),
      'summary', left(coalesce(nullif(btrim(p_summary), ''), 'Structured fleet request'), 4000),
      'requestedForDate', p_requested_for_date,
      'lines', p_lines
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_shop_id::text || ':' || btrim(p_operation_key),
      0
    )
  );

  select sr.id, sr.request_fingerprint
    into v_request_id, v_existing_fingerprint
  from public.fleet_service_requests sr
  where sr.shop_id = v_shop_id
    and sr.operation_key = btrim(p_operation_key);

  if v_request_id is not null then
    if v_existing_fingerprint is null then
      update public.fleet_service_requests
      set request_fingerprint = v_request_fingerprint,
          updated_at = now()
      where id = v_request_id;
    elsif v_existing_fingerprint <> v_request_fingerprint then
      raise exception 'Operation key was already used for a different Fleet request payload';
    end if;
    return v_request_id;
  end if;

  insert into public.fleet_service_requests (
    shop_id, fleet_id, vehicle_id, title, summary, severity, status,
    requested_for_date, submitted_at, created_by_profile_id, operation_key,
    request_fingerprint
  )
  values (
    v_shop_id, p_fleet_id, p_vehicle_id,
    left(coalesce(nullif(btrim(p_title), ''), 'Fleet service request'), 160),
    left(coalesce(nullif(btrim(p_summary), ''), 'Structured fleet request'), 4000),
    'recommend', 'open', p_requested_for_date, now(), v_user_id,
    btrim(p_operation_key), v_request_fingerprint
  )
  returning id into v_request_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_kind := coalesce(v_line ->> 'lineKind', 'custom');
    if v_line_kind not in (
      'menu', 'diagnostic', 'inspection', 'pm_package', 'custom'
    ) then
      raise exception 'Unsupported request line kind: %', v_line_kind;
    end if;

    if nullif(v_line ->> 'sourceMenuItemId', '') is not null
      and not exists (
        select 1 from public.menu_items mi
        where mi.id = (v_line ->> 'sourceMenuItemId')::uuid
          and mi.shop_id = v_shop_id
          and mi.is_active
      )
    then
      raise exception 'Menu item is not available to this fleet';
    end if;

    if nullif(v_line ->> 'sourceInspectionTemplateId', '') is not null
      and not exists (
        select 1 from public.inspection_templates it
        where it.id = (v_line ->> 'sourceInspectionTemplateId')::uuid
          and it.shop_id = v_shop_id
          and (
            not (
              coalesce(it.tags, '{}'::text[])
              && array['fleet-maintenance', 'fleet-authored']::text[]
            )
            or coalesce(it.tags, '{}'::text[])
              @> array['fleet:' || p_fleet_id::text]::text[]
          )
      )
    then
      raise exception 'Inspection template is not available to this fleet';
    end if;

    if nullif(v_line ->> 'sourceFleetProgramId', '') is not null
      and not exists (
        select 1 from public.fleet_programs fp
        where fp.id = (v_line ->> 'sourceFleetProgramId')::uuid
          and fp.fleet_id = p_fleet_id
      )
    then
      raise exception 'PM package is not available to this fleet';
    end if;

    insert into public.fleet_service_request_lines (
      shop_id, fleet_id, service_request_id, vehicle_id, line_kind,
      source_menu_item_id, source_inspection_template_id,
      source_fleet_program_id, description, notes, quantity,
      requested_labor_hours, unit_price_snapshot, price_status,
      source_snapshot, created_by
    )
    values (
      v_shop_id, p_fleet_id, v_request_id, p_vehicle_id, v_line_kind,
      nullif(v_line ->> 'sourceMenuItemId', '')::uuid,
      nullif(v_line ->> 'sourceInspectionTemplateId', '')::uuid,
      nullif(v_line ->> 'sourceFleetProgramId', '')::uuid,
      left(
        coalesce(nullif(btrim(v_line ->> 'description'), ''), 'Requested service'),
        1000
      ),
      nullif(left(coalesce(v_line ->> 'notes', ''), 4000), ''),
      greatest(coalesce((v_line ->> 'quantity')::numeric, 1), 0.01),
      nullif(v_line ->> 'requestedLaborHours', '')::numeric,
      nullif(v_line ->> 'unitPriceSnapshot', '')::numeric,
      case
        when v_line_kind = 'menu'
          and nullif(v_line ->> 'unitPriceSnapshot', '') is not null
          then 'priced'
        else 'advisor_pending'
      end,
      coalesce(v_line -> 'sourceSnapshot', '{}'::jsonb),
      v_user_id
    );
  end loop;

  return v_request_id;
end;
$function$;

revoke all on function public.create_fleet_service_request_atomic(
  uuid, uuid, text, text, date, jsonb, text
) from public, anon;
grant execute on function public.create_fleet_service_request_atomic(
  uuid, uuid, text, text, date, jsonb, text
) to authenticated, service_role;
