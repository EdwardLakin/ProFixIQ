begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';
set local check_function_bodies = false;

create or replace function public.dispatch_visit_snapshot(p_visit_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', sv.id,
    'shopId', sv.shop_id,
    'bookingId', sv.booking_id,
    'workOrderId', sv.work_order_id,
    'workOrderNumber', wo.custom_id,
    'mode', sv.mode,
    'status', sv.status,
    'version', sv.version,
    'scheduledStart', sv.scheduled_start,
    'scheduledEnd', sv.scheduled_end,
    'dispatchNotes', sv.dispatch_notes,
    'estimatedTravelMinutes', sv.estimated_travel_minutes,
    'actualTravelMinutes', sv.actual_travel_minutes,
    'estimatedDistanceKm', sv.estimated_distance_km,
    'actualDistanceKm', sv.actual_distance_km,
    'dispatchedAt', sv.dispatched_at,
    'travelStartedAt', sv.travel_started_at,
    'arrivedAt', sv.arrived_at,
    'workStartedAt', sv.work_started_at,
    'pausedAt', sv.paused_at,
    'completedAt', sv.completed_at,
    'cancelledAt', sv.cancelled_at,
    'lastStatusAt', sv.last_status_at,
    'createdAt', sv.created_at,
    'updatedAt', sv.updated_at,
    'assignmentState', case
      when sv.assigned_user_id is null
           and (sv.mode <> 'mobile' or coalesce(sv.service_vehicle_id, sr.service_vehicle_id) is null)
        then 'unassigned'
      when sv.assigned_user_id is null then 'vehicle_only'
      when sv.mode = 'mobile' and coalesce(sv.service_vehicle_id, sr.service_vehicle_id) is null
        then 'technician_only'
      else 'assigned'
    end,
    'customer', case when c.id is null then null else jsonb_build_object(
      'id', c.id,
      'name', coalesce(
        nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
        c.email,
        'Customer'
      ),
      'phone', c.phone
    ) end,
    'vehicle', case when v.id is null then null else jsonb_build_object(
      'id', v.id,
      'label', nullif(trim(concat_ws(' ', v.year::text, v.make, v.model)), ''),
      'plate', v.license_plate,
      'vin', v.vin
    ) end,
    'serviceAddress', case when sa.id is null then null else jsonb_build_object(
      'id', sa.id,
      'label', sa.label,
      'addressLine1', sa.address_line1,
      'addressLine2', sa.address_line2,
      'city', sa.city,
      'provinceState', sa.province_state,
      'postalCode', sa.postal_code,
      'latitude', sa.latitude,
      'longitude', sa.longitude,
      'accessNotes', sa.access_notes
    ) end,
    'assignedTechnician', case when tech.id is null then null else jsonb_build_object(
      'id', tech.id,
      'name', coalesce(nullif(trim(tech.full_name), ''), tech.email, 'Technician'),
      'role', tech.role
    ) end,
    'serviceVehicle', case when truck.id is null then null else jsonb_build_object(
      'id', truck.id,
      'name', truck.name,
      'unitNumber', truck.unit_number,
      'stockLocationId', truck.stock_location_id
    ) end,
    'resource', case when sr.id is null then null else jsonb_build_object(
      'id', sr.id,
      'name', sr.name,
      'resourceType', sr.resource_type
    ) end,
    'allowedTransitions', case sv.status
      when 'scheduled' then jsonb_build_array('dispatched','cancelled')
      when 'dispatched' then jsonb_build_array('en_route','cancelled')
      when 'en_route' then jsonb_build_array('arrived','cancelled')
      when 'arrived' then jsonb_build_array('working','cancelled')
      when 'working' then jsonb_build_array('paused','completed')
      when 'paused' then jsonb_build_array('working','completed','cancelled')
      else '[]'::jsonb
    end
  ))
  from public.service_visits sv
  left join public.work_orders wo on wo.id = sv.work_order_id
  left join public.bookings b on b.id = sv.booking_id
  left join public.customers c on c.id = coalesce(wo.customer_id, b.customer_id)
  left join public.vehicles v on v.id = coalesce(wo.vehicle_id, b.vehicle_id)
  left join public.service_addresses sa on sa.id = sv.service_address_id
  left join public.profiles tech on tech.id = sv.assigned_user_id
  left join public.scheduling_events se on se.service_visit_id = sv.id
  left join public.scheduling_reservations spr
    on spr.event_id = se.id and spr.reservation_role = 'primary'
  left join public.scheduling_resources sr on sr.id = spr.resource_id
  left join public.service_vehicles truck
    on truck.id = coalesce(sv.service_vehicle_id, sr.service_vehicle_id)
  where sv.id = p_visit_id;
$$;

revoke all on function public.dispatch_visit_snapshot(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
