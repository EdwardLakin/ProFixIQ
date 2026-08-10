begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';
set local check_function_bodies = false;

-- ===========================================================================
-- MOBILE DISPATCH + SERVICE VISIT OPERATIONS
--
-- work_orders remain repair/commercial truth.
-- scheduling_events/reservations remain time/capacity truth.
-- service_visits become command-owned physical dispatch/execution truth.
-- ===========================================================================

alter table public.service_visits
  add column if not exists dispatched_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_status_at timestamptz,
  add column if not exists last_status_by uuid references public.profiles(id) on delete set null,
  add column if not exists version integer not null default 1;

alter table public.service_visits
  drop constraint if exists service_visits_version_check;
alter table public.service_visits
  add constraint service_visits_version_check check (version > 0);

create table if not exists public.service_visit_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_visit_id uuid not null references public.service_visits(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  service_vehicle_id uuid references public.service_vehicles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint service_visit_events_type_check
    check (event_type in ('created','updated','rescheduled','assigned','transitioned'))
);

create index if not exists service_visit_events_visit_time_idx
  on public.service_visit_events(service_visit_id, occurred_at desc);
create index if not exists service_visit_events_shop_time_idx
  on public.service_visit_events(shop_id, occurred_at desc);
create index if not exists service_visits_mobile_active_idx
  on public.service_visits(shop_id, assigned_user_id, status, scheduled_start)
  where mode = 'mobile' and status in ('scheduled','dispatched','en_route','arrived','working','paused');

alter table public.service_visit_events enable row level security;

revoke all on table public.service_visit_events from public, anon;
grant select on table public.service_visit_events to authenticated;
grant all on table public.service_visit_events to service_role;

-- Service visits are now command-owned. Existing read access remains intact,
-- while authenticated writes are forced through the dispatch RPCs below.
revoke insert, update, delete on table public.service_visits from authenticated;
drop policy if exists service_visits_shop_member_insert on public.service_visits;
drop policy if exists service_visits_shop_member_update on public.service_visits;
drop policy if exists service_visits_shop_manager_delete on public.service_visits;

drop policy if exists service_visit_events_shop_select on public.service_visit_events;
create policy service_visit_events_shop_select
on public.service_visit_events
for select
to authenticated
using (public.scheduler_same_shop(service_visit_events.shop_id));

-- Lead hands and foremen can own a physical service visit, so ensure they have
-- technician scheduling resources just like mechanics do. This does not change
-- work-order-line technician ownership semantics.
insert into public.scheduling_resources(
  shop_id, code, name, resource_type, mode, profile_id,
  public_bookable, is_fallback, active, sort_order
)
select
  p.shop_id,
  'tech:' || p.id::text,
  coalesce(nullif(trim(p.full_name), ''), 'Technician'),
  'technician', 'both', p.id,
  false, false, true, 200
from public.profiles p
where p.shop_id is not null
  and lower(coalesce(p.role, '')) in ('mechanic','technician','tech','lead_hand','leadhand','foreman')
on conflict do nothing;

create or replace function public.sync_profile_scheduling_resource()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.id is not null then
    update public.scheduling_resources
    set active = false, updated_at = now()
    where profile_id = old.id
      and resource_type = 'technician'
      and (
        new.shop_id is null
        or shop_id <> new.shop_id
        or lower(coalesce(new.role, '')) not in (
          'mechanic','technician','tech','lead_hand','leadhand','foreman'
        )
      );
  end if;

  if new.shop_id is not null
     and lower(coalesce(new.role, '')) in (
       'mechanic','technician','tech','lead_hand','leadhand','foreman'
     ) then
    insert into public.scheduling_resources(
      shop_id, code, name, resource_type, mode, profile_id,
      public_bookable, is_fallback, active, sort_order
    ) values (
      new.shop_id,
      'tech:' || new.id::text,
      coalesce(nullif(trim(new.full_name), ''), 'Technician'),
      'technician', 'both', new.id,
      false, false, true, 200
    ) on conflict do nothing;

    update public.scheduling_resources
    set name = coalesce(nullif(trim(new.full_name), ''), 'Technician'),
        active = true,
        updated_at = now()
    where shop_id = new.shop_id
      and profile_id = new.id
      and resource_type = 'technician';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_scheduling_resource()
  from public, anon, authenticated, service_role;

create or replace function public.dispatch_actor_profile_id(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;
$$;

create or replace function public.dispatch_can_manage(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.shop_id = p_shop_id
      and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and lower(coalesce(p.role, '')) in (
        'owner','admin','manager','advisor','lead_hand','leadhand','foreman'
      )
  );
$$;

create or replace function public.dispatch_can_execute(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_visit_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.dispatch_can_manage(p_shop_id, p_actor_user_id)
    or exists (
      select 1
      from public.service_visits sv
      join public.profiles p on p.id = sv.assigned_user_id
      where sv.id = p_visit_id
        and sv.shop_id = p_shop_id
        and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
        and lower(coalesce(p.role, '')) in (
          'mechanic','technician','tech','lead_hand','leadhand','foreman'
        )
    );
$$;

revoke all on function public.dispatch_actor_profile_id(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.dispatch_can_manage(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.dispatch_can_execute(uuid,uuid,uuid)
  from public, anon, authenticated;

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
      when sv.assigned_user_id is null and (sv.mode <> 'mobile' or sv.service_vehicle_id is null)
        then 'unassigned'
      when sv.assigned_user_id is null then 'vehicle_only'
      when sv.mode = 'mobile' and sv.service_vehicle_id is null then 'technician_only'
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
  left join public.service_vehicles truck on truck.id = sv.service_vehicle_id
  left join public.scheduling_events se on se.service_visit_id = sv.id
  left join public.scheduling_reservations spr
    on spr.event_id = se.id and spr.reservation_role = 'primary'
  left join public.scheduling_resources sr on sr.id = spr.resource_id
  where sv.id = p_visit_id;
$$;

revoke all on function public.dispatch_visit_snapshot(uuid)
  from public, anon, authenticated;

create or replace function public.dispatch_record_visit_event(
  p_visit_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_from_status text default null,
  p_to_status text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_actor_profile_id uuid;
begin
  select * into v_visit from public.service_visits where id = p_visit_id;
  if not found then return; end if;

  v_actor_profile_id := public.dispatch_actor_profile_id(v_visit.shop_id, p_actor_user_id);

  insert into public.service_visit_events(
    shop_id, service_visit_id, event_type, from_status, to_status,
    actor_user_id, assigned_user_id, service_vehicle_id, metadata
  ) values (
    v_visit.shop_id, v_visit.id, p_event_type, p_from_status, p_to_status,
    v_actor_profile_id, v_visit.assigned_user_id, v_visit.service_vehicle_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  insert into public.activity_logs(
    action, user_id, timestamp, target_table, target_id, context
  ) values (
    'dispatch_visit_' || p_event_type,
    v_actor_profile_id,
    now(),
    'service_visits',
    v_visit.id,
    jsonb_build_object('shop_id', v_visit.shop_id)
      || coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.dispatch_record_visit_event(uuid,text,uuid,text,text,jsonb)
  from public, anon, authenticated;

create or replace function public.dispatch_sync_primary_resource(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_event public.scheduling_events%rowtype;
  v_reservation public.scheduling_reservations%rowtype;
  v_resource_id uuid;
begin
  select * into v_visit from public.service_visits where id = p_visit_id;
  if not found or v_visit.scheduled_start is null or v_visit.scheduled_end is null then
    return;
  end if;

  select * into v_event
  from public.scheduling_events e
  where e.service_visit_id = v_visit.id
  order by e.created_at
  limit 1
  for update;
  if not found then return; end if;

  if v_visit.service_vehicle_id is not null then
    if v_visit.mode <> 'mobile' then
      raise exception using errcode = 'P0001', message = 'Service vehicles can only be assigned to mobile visits.';
    end if;
    select r.id into v_resource_id
    from public.scheduling_resources r
    where r.shop_id = v_visit.shop_id
      and r.service_vehicle_id = v_visit.service_vehicle_id
      and r.resource_type = 'service_vehicle'
      and r.active = true
    limit 1;
    if v_resource_id is null then
      raise exception using errcode = 'P0001', message = 'Assigned service vehicle has no active scheduling resource.';
    end if;
  else
    v_resource_id := public.scheduler_pick_resource(
      v_visit.shop_id,
      v_visit.scheduled_start,
      v_visit.scheduled_end,
      v_visit.mode,
      false,
      null,
      v_event.id
    );
  end if;

  if v_visit.service_vehicle_id is not null then
    perform public.scheduler_pick_resource(
      v_visit.shop_id,
      v_visit.scheduled_start,
      v_visit.scheduled_end,
      v_visit.mode,
      false,
      v_resource_id,
      v_event.id
    );
  end if;

  select * into v_reservation
  from public.scheduling_reservations r
  where r.event_id = v_event.id and r.reservation_role = 'primary'
  for update;

  if not found then
    insert into public.scheduling_reservations(
      shop_id, event_id, resource_id, reservation_role,
      starts_at, ends_at, status
    ) values (
      v_visit.shop_id, v_event.id, v_resource_id, 'primary',
      v_visit.scheduled_start, v_visit.scheduled_end,
      case when v_visit.status = 'completed' then 'completed'
           when v_visit.status = 'cancelled' then 'cancelled'
           else 'active' end
    );
  else
    update public.scheduling_reservations
    set resource_id = v_resource_id,
        starts_at = v_visit.scheduled_start,
        ends_at = v_visit.scheduled_end,
        status = case when v_visit.status = 'completed' then 'completed'
                      when v_visit.status = 'cancelled' then 'cancelled'
                      else 'active' end,
        updated_at = now()
    where id = v_reservation.id;
  end if;

  if v_event.booking_id is not null then
    update public.bookings
    set lifecycle_metadata = case
          when v_visit.service_vehicle_id is null
            then coalesce(lifecycle_metadata, '{}'::jsonb) - 'scheduler_requested_resource_id'
          else coalesce(lifecycle_metadata, '{}'::jsonb)
            || jsonb_build_object('scheduler_requested_resource_id', v_resource_id)
        end,
        updated_at = now()
    where id = v_event.booking_id;
  end if;
end;
$$;

revoke all on function public.dispatch_sync_primary_resource(uuid)
  from public, anon, authenticated;

create or replace function public.dispatch_sync_technician_reservation(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_event public.scheduling_events%rowtype;
  v_existing public.scheduling_reservations%rowtype;
  v_resource_id uuid;
  v_status text;
begin
  select * into v_visit from public.service_visits where id = p_visit_id;
  if not found then return; end if;

  select * into v_event
  from public.scheduling_events e
  where e.service_visit_id = v_visit.id
  order by e.created_at
  limit 1
  for update;

  select * into v_existing
  from public.scheduling_reservations r
  where r.event_id = v_event.id and r.reservation_role = 'technician'
  for update;

  if v_event.id is null
     or v_visit.assigned_user_id is null
     or v_visit.scheduled_start is null
     or v_visit.scheduled_end is null then
    if v_existing.id is not null then
      update public.scheduling_reservations
      set status = 'cancelled', updated_at = now()
      where id = v_existing.id;
    end if;
    return;
  end if;

  select r.id into v_resource_id
  from public.scheduling_resources r
  where r.shop_id = v_visit.shop_id
    and r.profile_id = v_visit.assigned_user_id
    and r.resource_type = 'technician'
    and r.active = true
  limit 1;
  if v_resource_id is null then
    raise exception using errcode = 'P0001', message = 'Assigned technician has no active scheduling resource.';
  end if;

  v_status := case
    when v_visit.status = 'completed' then 'completed'
    when v_visit.status = 'cancelled' then 'cancelled'
    else 'active'
  end;

  if v_existing.id is null then
    insert into public.scheduling_reservations(
      shop_id, event_id, resource_id, reservation_role,
      starts_at, ends_at, status
    ) values (
      v_visit.shop_id, v_event.id, v_resource_id, 'technician',
      v_visit.scheduled_start, v_visit.scheduled_end, v_status
    );
  else
    update public.scheduling_reservations
    set resource_id = v_resource_id,
        starts_at = v_visit.scheduled_start,
        ends_at = v_visit.scheduled_end,
        status = v_status,
        updated_at = now()
    where id = v_existing.id;
  end if;
end;
$$;

revoke all on function public.dispatch_sync_technician_reservation(uuid)
  from public, anon, authenticated;

create or replace function public.dispatch_sync_event_status(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_event_status text;
  v_reservation_status text;
begin
  select * into v_visit from public.service_visits where id = p_visit_id;
  if not found then return; end if;

  v_event_status := case
    when v_visit.status = 'completed' then 'completed'
    when v_visit.status = 'cancelled' then 'cancelled'
    when v_visit.status in ('dispatched','en_route','arrived','working','paused') then 'active'
    else 'confirmed'
  end;
  v_reservation_status := case
    when v_event_status = 'completed' then 'completed'
    when v_event_status = 'cancelled' then 'cancelled'
    else 'active'
  end;

  update public.scheduling_events
  set status = v_event_status, updated_at = now()
  where service_visit_id = v_visit.id;

  update public.scheduling_reservations r
  set status = v_reservation_status, updated_at = now()
  where r.event_id in (
    select e.id from public.scheduling_events e where e.service_visit_id = v_visit.id
  );
end;
$$;

revoke all on function public.dispatch_sync_event_status(uuid)
  from public, anon, authenticated;

create or replace function public.dispatch_create_service_visit_atomic(
  p_shop_id uuid,
  p_booking_id uuid,
  p_work_order_id uuid,
  p_mode text,
  p_service_address_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_assigned_user_id uuid,
  p_service_vehicle_id uuid,
  p_dispatch_notes text,
  p_estimated_travel_minutes integer,
  p_estimated_distance_km numeric,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_manage(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Dispatch visit creation denied.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if p_booking_id is null and p_work_order_id is null then
    raise exception using errcode = 'P0001', message = 'A booking or work order is required.';
  end if;
  if lower(coalesce(p_mode, '')) not in ('shop','mobile') then
    raise exception using errcode = 'P0001', message = 'Service visit mode must be shop or mobile.';
  end if;

  select result into v_existing
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = 'dispatch_visit_create'
    and k.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  if p_booking_id is not null and not exists (
    select 1 from public.bookings b where b.id = p_booking_id and b.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Booking is not available in this shop.';
  end if;
  if p_work_order_id is not null and not exists (
    select 1 from public.work_orders wo where wo.id = p_work_order_id and wo.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Work order is not available in this shop.';
  end if;
  if p_service_address_id is not null and not exists (
    select 1 from public.service_addresses sa where sa.id = p_service_address_id and sa.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Service address is not available in this shop.';
  end if;
  if p_assigned_user_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_assigned_user_id and p.shop_id = p_shop_id
      and lower(coalesce(p.role, '')) in ('mechanic','technician','tech','lead_hand','leadhand','foreman')
  ) then
    raise exception using errcode = 'P0001', message = 'Assigned technician is not eligible for dispatch.';
  end if;
  if p_service_vehicle_id is not null and not exists (
    select 1 from public.service_vehicles sv
    where sv.id = p_service_vehicle_id and sv.shop_id = p_shop_id and sv.active = true
  ) then
    raise exception using errcode = 'P0001', message = 'Assigned service vehicle is not active in this shop.';
  end if;
  if p_service_vehicle_id is not null and lower(p_mode) <> 'mobile' then
    raise exception using errcode = 'P0001', message = 'Service vehicles can only be assigned to mobile visits.';
  end if;

  insert into public.service_visits(
    shop_id, booking_id, work_order_id, service_address_id, mode, status,
    scheduled_start, scheduled_end, assigned_user_id, service_vehicle_id,
    dispatch_notes, estimated_travel_minutes, estimated_distance_km,
    created_by, last_status_at, last_status_by
  ) values (
    p_shop_id, p_booking_id, p_work_order_id, p_service_address_id,
    lower(p_mode), 'scheduled', p_scheduled_start, p_scheduled_end,
    p_assigned_user_id, p_service_vehicle_id,
    nullif(trim(coalesce(p_dispatch_notes, '')), ''),
    p_estimated_travel_minutes, p_estimated_distance_km,
    public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id),
    now(), public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id)
  ) returning * into v_visit;

  perform public.dispatch_sync_primary_resource(v_visit.id);
  perform public.dispatch_sync_technician_reservation(v_visit.id);
  perform public.dispatch_record_visit_event(
    v_visit.id, 'created', p_actor_user_id, null, v_visit.status,
    jsonb_build_object('operation_key', p_operation_key)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'visit', public.dispatch_visit_snapshot(v_visit.id),
    'idempotent', false
  );
  insert into public.scheduler_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, result
  ) values (
    p_shop_id, 'dispatch_visit_create', p_operation_key,
    public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id), v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

create or replace function public.dispatch_update_service_visit_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_work_order_id uuid,
  p_service_address_id uuid,
  p_dispatch_notes text,
  p_estimated_travel_minutes integer,
  p_estimated_distance_km numeric,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_manage(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Dispatch visit update denied.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select result into v_existing from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id and k.operation_name = 'dispatch_visit_update'
    and k.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_visit from public.service_visits
  where id = p_visit_id and shop_id = p_shop_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'Service visit not found.'; end if;
  if v_visit.status in ('completed','cancelled') then
    raise exception using errcode = 'P0001', message = 'Terminal service visits cannot be edited.';
  end if;
  if p_expected_version is not null and v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Service visit changed since it was loaded.';
  end if;
  if p_work_order_id is not null and v_visit.work_order_id is not null
     and p_work_order_id <> v_visit.work_order_id then
    raise exception using errcode = 'P0001', message = 'A linked work order cannot be replaced.';
  end if;
  if p_work_order_id is not null and not exists (
    select 1 from public.work_orders wo where wo.id = p_work_order_id and wo.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Work order is not available in this shop.';
  end if;
  if p_service_address_id is not null and not exists (
    select 1 from public.service_addresses sa where sa.id = p_service_address_id and sa.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Service address is not available in this shop.';
  end if;

  update public.service_visits
  set work_order_id = coalesce(work_order_id, p_work_order_id),
      service_address_id = p_service_address_id,
      dispatch_notes = p_dispatch_notes,
      estimated_travel_minutes = p_estimated_travel_minutes,
      estimated_distance_km = p_estimated_distance_km,
      version = version + 1,
      updated_at = now()
  where id = v_visit.id
  returning * into v_visit;

  perform public.dispatch_record_visit_event(
    v_visit.id, 'updated', p_actor_user_id, v_visit.status, v_visit.status,
    jsonb_build_object('operation_key', p_operation_key)
  );
  v_result := jsonb_build_object('ok', true, 'visit', public.dispatch_visit_snapshot(v_visit.id), 'idempotent', false);
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (p_shop_id, 'dispatch_visit_update', p_operation_key,
    public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id), v_result)
  on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

create or replace function public.dispatch_reschedule_service_visit_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_old_start timestamptz;
  v_old_end timestamptz;
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_manage(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Dispatch reschedule denied.';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception using errcode = 'P0001', message = 'Valid service visit times are required.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select result into v_existing from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id and k.operation_name = 'dispatch_visit_reschedule'
    and k.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_visit from public.service_visits
  where id = p_visit_id and shop_id = p_shop_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'Service visit not found.'; end if;
  if v_visit.status in ('completed','cancelled') then
    raise exception using errcode = 'P0001', message = 'Terminal service visits cannot be rescheduled.';
  end if;
  if p_expected_version is not null and v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Service visit changed since it was loaded.';
  end if;

  v_old_start := v_visit.scheduled_start;
  v_old_end := v_visit.scheduled_end;

  -- A booking-backed visit and its scheduler event must move together.
  if v_visit.booking_id is not null then
    update public.bookings
    set starts_at = p_starts_at,
        ends_at = p_ends_at,
        updated_at = now(),
        lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
          || jsonb_build_object('dispatch_reschedule_operation_key', p_operation_key)
    where id = v_visit.booking_id and shop_id = p_shop_id;
  end if;

  update public.service_visits
  set scheduled_start = p_starts_at,
      scheduled_end = p_ends_at,
      version = version + 1,
      updated_at = now()
  where id = v_visit.id
  returning * into v_visit;

  perform public.dispatch_sync_primary_resource(v_visit.id);
  perform public.dispatch_sync_technician_reservation(v_visit.id);
  perform public.dispatch_record_visit_event(
    v_visit.id, 'rescheduled', p_actor_user_id, v_visit.status, v_visit.status,
    jsonb_build_object(
      'operation_key', p_operation_key,
      'from_starts_at', v_old_start,
      'from_ends_at', v_old_end,
      'to_starts_at', p_starts_at,
      'to_ends_at', p_ends_at
    )
  );

  v_result := jsonb_build_object('ok', true, 'visit', public.dispatch_visit_snapshot(v_visit.id), 'idempotent', false);
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (p_shop_id, 'dispatch_visit_reschedule', p_operation_key,
    public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id), v_result)
  on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

create or replace function public.dispatch_assign_service_visit_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_assigned_user_id uuid,
  p_service_vehicle_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_old_user uuid;
  v_old_vehicle uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_manage(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Dispatch assignment denied.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select result into v_existing from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id and k.operation_name = 'dispatch_visit_assign'
    and k.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_visit from public.service_visits
  where id = p_visit_id and shop_id = p_shop_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'Service visit not found.'; end if;
  if v_visit.status in ('completed','cancelled') then
    raise exception using errcode = 'P0001', message = 'Terminal service visits cannot be assigned.';
  end if;
  if p_expected_version is not null and v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Service visit changed since it was loaded.';
  end if;
  if p_assigned_user_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_assigned_user_id and p.shop_id = p_shop_id
      and lower(coalesce(p.role, '')) in ('mechanic','technician','tech','lead_hand','leadhand','foreman')
  ) then
    raise exception using errcode = 'P0001', message = 'Assigned technician is not eligible for dispatch.';
  end if;
  if p_service_vehicle_id is not null and not exists (
    select 1 from public.service_vehicles sv
    where sv.id = p_service_vehicle_id and sv.shop_id = p_shop_id and sv.active = true
  ) then
    raise exception using errcode = 'P0001', message = 'Assigned service vehicle is not active in this shop.';
  end if;
  if p_service_vehicle_id is not null and v_visit.mode <> 'mobile' then
    raise exception using errcode = 'P0001', message = 'Service vehicles can only be assigned to mobile visits.';
  end if;

  v_old_user := v_visit.assigned_user_id;
  v_old_vehicle := v_visit.service_vehicle_id;

  update public.service_visits
  set assigned_user_id = p_assigned_user_id,
      service_vehicle_id = p_service_vehicle_id,
      version = version + 1,
      updated_at = now()
  where id = v_visit.id
  returning * into v_visit;

  perform public.dispatch_sync_primary_resource(v_visit.id);
  perform public.dispatch_sync_technician_reservation(v_visit.id);
  perform public.dispatch_record_visit_event(
    v_visit.id, 'assigned', p_actor_user_id, v_visit.status, v_visit.status,
    jsonb_build_object(
      'operation_key', p_operation_key,
      'from_user_id', v_old_user,
      'to_user_id', p_assigned_user_id,
      'from_service_vehicle_id', v_old_vehicle,
      'to_service_vehicle_id', p_service_vehicle_id
    )
  );

  v_result := jsonb_build_object('ok', true, 'visit', public.dispatch_visit_snapshot(v_visit.id), 'idempotent', false);
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (p_shop_id, 'dispatch_visit_assign', p_operation_key,
    public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id), v_result)
  on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

create or replace function public.dispatch_transition_service_visit_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_to_status text,
  p_actual_travel_minutes integer,
  p_actual_distance_km numeric,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_from text;
  v_to text := lower(trim(coalesce(p_to_status, '')));
  v_allowed boolean := false;
  v_actor_is_manager boolean;
  v_now timestamptz := now();
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_execute(p_shop_id, p_actor_user_id, p_visit_id) then
    raise exception using errcode = '42501', message = 'Service visit transition denied.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select result into v_existing from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id and k.operation_name = 'dispatch_visit_transition'
    and k.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_visit from public.service_visits
  where id = p_visit_id and shop_id = p_shop_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'Service visit not found.'; end if;
  if p_expected_version is not null and v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Service visit changed since it was loaded.';
  end if;

  v_from := v_visit.status;
  v_actor_is_manager := public.dispatch_can_manage(p_shop_id, p_actor_user_id);
  v_allowed := case v_from
    when 'scheduled' then v_to in ('dispatched','cancelled')
    when 'dispatched' then v_to in ('en_route','cancelled')
    when 'en_route' then v_to in ('arrived','cancelled')
    when 'arrived' then v_to in ('working','cancelled')
    when 'working' then v_to in ('paused','completed')
    when 'paused' then v_to in ('working','completed','cancelled')
    else false
  end;
  if not v_allowed then
    raise exception using errcode = 'P0001', message = 'Invalid service visit status transition.';
  end if;
  if v_to = 'cancelled' and not v_actor_is_manager then
    raise exception using errcode = '42501', message = 'Only dispatch staff can cancel a service visit.';
  end if;

  update public.service_visits
  set status = v_to,
      dispatched_at = case when v_to = 'dispatched' then coalesce(dispatched_at, v_now) else dispatched_at end,
      travel_started_at = case when v_to = 'en_route' then coalesce(travel_started_at, v_now) else travel_started_at end,
      arrived_at = case when v_to = 'arrived' then coalesce(arrived_at, v_now) else arrived_at end,
      work_started_at = case when v_to = 'working' then coalesce(work_started_at, v_now) else work_started_at end,
      paused_at = case when v_to = 'paused' then v_now else paused_at end,
      completed_at = case when v_to = 'completed' then coalesce(completed_at, v_now) else completed_at end,
      cancelled_at = case when v_to = 'cancelled' then coalesce(cancelled_at, v_now) else cancelled_at end,
      actual_travel_minutes = coalesce(
        p_actual_travel_minutes,
        case when v_to = 'arrived' and travel_started_at is not null
          then greatest(0, round(extract(epoch from (v_now - travel_started_at)) / 60.0)::integer)
          else actual_travel_minutes end
      ),
      actual_distance_km = coalesce(p_actual_distance_km, actual_distance_km),
      last_status_at = v_now,
      last_status_by = public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id),
      version = version + 1,
      updated_at = v_now
  where id = v_visit.id
  returning * into v_visit;

  perform public.dispatch_sync_event_status(v_visit.id);
  perform public.dispatch_sync_technician_reservation(v_visit.id);
  perform public.dispatch_record_visit_event(
    v_visit.id, 'transitioned', p_actor_user_id, v_from, v_to,
    jsonb_build_object('operation_key', p_operation_key)
  );

  v_result := jsonb_build_object('ok', true, 'visit', public.dispatch_visit_snapshot(v_visit.id), 'idempotent', false);
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (p_shop_id, 'dispatch_visit_transition', p_operation_key,
    public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id), v_result)
  on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

create or replace function public.dispatch_board_snapshot(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visits jsonb;
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_manage(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Dispatch board access denied.';
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception using errcode = 'P0001', message = 'A valid dispatch board window is required.';
  end if;

  select coalesce(jsonb_agg(public.dispatch_visit_snapshot(sv.id)
    order by sv.scheduled_start nulls first, sv.created_at), '[]'::jsonb)
  into v_visits
  from public.service_visits sv
  where sv.shop_id = p_shop_id
    and sv.status not in ('completed','cancelled')
    and (
      sv.scheduled_start is null
      or (sv.scheduled_start < p_window_end and coalesce(sv.scheduled_end, sv.scheduled_start + interval '1 hour') > p_window_start)
    );

  return jsonb_build_object(
    'generatedAt', now(),
    'visits', v_visits,
    'technicians', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(nullif(trim(p.full_name), ''), p.email, 'Technician'),
        'role', p.role
      ) order by p.full_name nulls last, p.email)
      from public.profiles p
      where p.shop_id = p_shop_id
        and lower(coalesce(p.role, '')) in ('mechanic','technician','tech','lead_hand','leadhand','foreman')
    ), '[]'::jsonb),
    'serviceVehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id,
        'name', sv.name,
        'unitNumber', sv.unit_number,
        'stockLocationId', sv.stock_location_id
      ) order by sv.name)
      from public.service_vehicles sv
      where sv.shop_id = p_shop_id and sv.active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.dispatch_visit_history(
  p_shop_id uuid,
  p_visit_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_execute(p_shop_id, p_actor_user_id, p_visit_id) then
    raise exception using errcode = '42501', message = 'Service visit history access denied.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'eventType', e.event_type,
      'fromStatus', e.from_status,
      'toStatus', e.to_status,
      'occurredAt', e.occurred_at,
      'actor', case when p.id is null then null else jsonb_build_object(
        'id', p.id,
        'name', coalesce(nullif(trim(p.full_name), ''), p.email, 'Staff')
      ) end,
      'assignedUserId', e.assigned_user_id,
      'serviceVehicleId', e.service_vehicle_id,
      'metadata', e.metadata
    ) order by e.occurred_at, e.id)
    from public.service_visit_events e
    left join public.profiles p on p.id = e.actor_user_id
    where e.shop_id = p_shop_id and e.service_visit_id = p_visit_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.dispatch_mobile_active_snapshot(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_active_id uuid;
  v_next_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Mobile dispatch actor mismatch.';
  end if;
  v_profile_id := public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id);
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'Mobile dispatch shop access denied.';
  end if;

  select sv.id into v_active_id
  from public.service_visits sv
  where sv.shop_id = p_shop_id
    and sv.assigned_user_id = v_profile_id
    and sv.status in ('dispatched','en_route','arrived','working','paused')
  order by case sv.status
    when 'working' then 1
    when 'paused' then 2
    when 'arrived' then 3
    when 'en_route' then 4
    when 'dispatched' then 5
    else 9 end,
    sv.scheduled_start nulls last,
    sv.created_at
  limit 1;

  select sv.id into v_next_id
  from public.service_visits sv
  where sv.shop_id = p_shop_id
    and sv.assigned_user_id = v_profile_id
    and sv.status = 'scheduled'
    and (v_active_id is null or sv.id <> v_active_id)
  order by sv.scheduled_start nulls last, sv.created_at
  limit 1;

  return jsonb_build_object(
    'serverNow', now(),
    'activeJob', case when v_active_id is null then null else public.dispatch_visit_snapshot(v_active_id) end,
    'nextJob', case when v_next_id is null then null else public.dispatch_visit_snapshot(v_next_id) end
  );
end;
$$;

revoke all on function public.dispatch_create_service_visit_atomic(
  uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,uuid,uuid,text,integer,numeric,uuid,text
) from public, anon;
revoke all on function public.dispatch_update_service_visit_atomic(
  uuid,uuid,uuid,uuid,text,integer,numeric,integer,uuid,text
) from public, anon;
revoke all on function public.dispatch_reschedule_service_visit_atomic(
  uuid,uuid,timestamptz,timestamptz,integer,uuid,text
) from public, anon;
revoke all on function public.dispatch_assign_service_visit_atomic(
  uuid,uuid,uuid,uuid,integer,uuid,text
) from public, anon;
revoke all on function public.dispatch_transition_service_visit_atomic(
  uuid,uuid,text,integer,numeric,integer,uuid,text
) from public, anon;
revoke all on function public.dispatch_board_snapshot(uuid,uuid,timestamptz,timestamptz)
  from public, anon;
revoke all on function public.dispatch_visit_history(uuid,uuid,uuid)
  from public, anon;
revoke all on function public.dispatch_mobile_active_snapshot(uuid,uuid)
  from public, anon;

grant execute on function public.dispatch_create_service_visit_atomic(
  uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,uuid,uuid,text,integer,numeric,uuid,text
) to authenticated, service_role;
grant execute on function public.dispatch_update_service_visit_atomic(
  uuid,uuid,uuid,uuid,text,integer,numeric,integer,uuid,text
) to authenticated, service_role;
grant execute on function public.dispatch_reschedule_service_visit_atomic(
  uuid,uuid,timestamptz,timestamptz,integer,uuid,text
) to authenticated, service_role;
grant execute on function public.dispatch_assign_service_visit_atomic(
  uuid,uuid,uuid,uuid,integer,uuid,text
) to authenticated, service_role;
grant execute on function public.dispatch_transition_service_visit_atomic(
  uuid,uuid,text,integer,numeric,integer,uuid,text
) to authenticated, service_role;
grant execute on function public.dispatch_board_snapshot(uuid,uuid,timestamptz,timestamptz)
  to authenticated, service_role;
grant execute on function public.dispatch_visit_history(uuid,uuid,uuid)
  to authenticated, service_role;
grant execute on function public.dispatch_mobile_active_snapshot(uuid,uuid)
  to authenticated, service_role;

comment on table public.service_visit_events is
  'Immutable dispatch/service-visit audit history. Authenticated writes occur only through canonical dispatch commands.';
comment on column public.service_visits.assigned_user_id is
  'Physical visit/dispatch owner only. Work-order-line technician assignment remains labor ownership truth.';
comment on column public.service_visits.version is
  'Optimistic concurrency version incremented by canonical dispatch commands.';

notify pgrst, 'reload schema';

commit;
