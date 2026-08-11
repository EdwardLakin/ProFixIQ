begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- One eligibility predicate for canonical Dispatch assignment. Explicit Mobile
-- field capability extends technician eligibility without rewriting profiles.role.
create or replace function public.mobile_dispatch_profile_eligible(
  p_shop_id uuid,
  p_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.shop_id = p_shop_id
      and (
        lower(coalesce(p.role, '')) in (
          'mechanic','technician','tech','lead_hand','leadhand','foreman'
        )
        or public.mobile_is_field_operator(p_shop_id, p.id)
      )
  );
$$;

revoke all on function public.mobile_dispatch_profile_eligible(uuid,uuid)
  from public, anon;
grant execute on function public.mobile_dispatch_profile_eligible(uuid,uuid)
  to authenticated, service_role;

-- A profile delete cascades through mobile_field_operators after the parent row
-- is no longer visible. Do not make that cascade depend on reloading the parent.
create or replace function public.sync_mobile_field_operator_resource()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid := case when tg_op = 'DELETE' then old.shop_id else new.shop_id end;
  v_profile_id uuid := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
  v_enabled boolean := case when tg_op = 'DELETE' then false else coalesce(new.enabled, false) end;
  v_profile public.profiles%rowtype;
  v_resource_id uuid;
begin
  select * into v_profile
  from public.profiles p
  where p.id = v_profile_id and p.shop_id = v_shop_id;

  -- Parent-profile cascade: the scheduling resource is no longer a valid field
  -- operator resource. Deactivate it if it has not already cascaded away.
  if not found then
    update public.scheduling_resources
    set active = false, updated_at = now()
    where shop_id = v_shop_id
      and profile_id = v_profile_id
      and resource_type = 'technician';
    if tg_op = 'DELETE' then return old; end if;
    raise exception using errcode = 'P0001', message = 'Field operator must belong to the same shop.';
  end if;

  select r.id into v_resource_id
  from public.scheduling_resources r
  where r.shop_id = v_shop_id
    and r.profile_id = v_profile_id
    and r.resource_type = 'technician'
  limit 1;

  if v_enabled then
    insert into public.scheduling_resources(
      shop_id, code, name, resource_type, mode, profile_id,
      public_bookable, is_fallback, active, sort_order
    ) values (
      v_shop_id,
      'tech:' || v_profile_id::text,
      coalesce(nullif(trim(v_profile.full_name), ''), 'Field operator'),
      'technician', 'both', v_profile_id,
      false, false, true, 200
    ) on conflict do nothing;

    update public.scheduling_resources
    set name = coalesce(nullif(trim(v_profile.full_name), ''), 'Field operator'),
        active = true,
        updated_at = now()
    where shop_id = v_shop_id
      and profile_id = v_profile_id
      and resource_type = 'technician';
  elsif v_resource_id is not null
        and lower(coalesce(v_profile.role, '')) not in (
          'mechanic','technician','tech','lead_hand','leadhand','foreman'
        ) then
    if exists (
      select 1 from public.scheduling_reservations sr
      where sr.resource_id = v_resource_id
        and sr.status = 'active'
        and sr.ends_at > now()
    ) then
      raise exception using errcode = 'P0001', message = 'Field operator has active or future service visits.';
    end if;
    update public.scheduling_resources
    set active = false, updated_at = now()
    where id = v_resource_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Turning truck tracking off must also turn subordinate truck inventory off.
create or replace function public.mobile_normalize_service_settings()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not coalesce(new.service_vehicles_enabled, false) then
    new.truck_inventory_enabled := false;
  end if;
  return new;
end;
$$;

revoke all on function public.mobile_normalize_service_settings()
  from public, anon, authenticated, service_role;

drop trigger if exists mobile_service_settings_normalize on public.mobile_service_settings;
create trigger mobile_service_settings_normalize
before insert or update of service_vehicles_enabled, truck_inventory_enabled
on public.mobile_service_settings
for each row execute function public.mobile_normalize_service_settings();

-- Mobile-managed service vehicles leave Dispatch when tracking is disabled. The
-- stock location record is preserved as inventory history, but detached from the
-- vehicle so it is no longer live truck inventory.
create or replace function public.mobile_reconcile_service_vehicle_setting()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(new.service_vehicles_enabled, false) then
    if exists (
      select 1
      from public.service_visits visit
      join public.service_vehicles vehicle on vehicle.id = visit.service_vehicle_id
      where visit.shop_id = new.shop_id
        and visit.status not in ('completed','cancelled')
        and coalesce(vehicle.capabilities, '{}'::jsonb) @> '{"mobile_v1":true}'::jsonb
    ) then
      raise exception using errcode = 'P0001', message = 'Unassign active service calls before disabling service-vehicle tracking.';
    end if;

    update public.service_vehicles
    set active = false,
        stock_location_id = null,
        updated_at = now()
    where shop_id = new.shop_id
      and coalesce(capabilities, '{}'::jsonb) @> '{"mobile_v1":true}'::jsonb;
  elsif not coalesce(new.truck_inventory_enabled, false) then
    update public.service_vehicles
    set stock_location_id = null,
        updated_at = now()
    where shop_id = new.shop_id
      and coalesce(capabilities, '{}'::jsonb) @> '{"mobile_v1":true}'::jsonb;
  end if;
  return new;
end;
$$;

revoke all on function public.mobile_reconcile_service_vehicle_setting()
  from public, anon, authenticated, service_role;

drop trigger if exists mobile_service_settings_reconcile_vehicle on public.mobile_service_settings;
create trigger mobile_service_settings_reconcile_vehicle
after insert or update of service_vehicles_enabled, truck_inventory_enabled
on public.mobile_service_settings
for each row execute function public.mobile_reconcile_service_vehicle_setting();

-- Defense in depth for future-work capture: managers may author any same-shop
-- follow-up; field staff may only author one for a work order physically assigned
-- to them through a Service Visit.
create or replace function public.mobile_guard_service_followup_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if new.recommended_by is null then
    raise exception using errcode = '42501', message = 'A field recommendation requires an author.';
  end if;

  select lower(coalesce(p.role, '')) into v_role
  from public.profiles p
  where p.id = new.recommended_by and p.shop_id = new.shop_id;
  if v_role is null then
    raise exception using errcode = '42501', message = 'Recommendation author is not in this shop.';
  end if;

  if v_role in ('owner','admin','manager','advisor','service','lead_hand','leadhand','foreman') then
    return new;
  end if;

  if exists (
    select 1
    from public.service_visits sv
    where sv.shop_id = new.shop_id
      and sv.work_order_id = new.work_order_id
      and sv.assigned_user_id = new.recommended_by
      and (new.service_visit_id is null or sv.id = new.service_visit_id)
  ) then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'Field recommendations require an assigned Service Visit.';
end;
$$;

revoke all on function public.mobile_guard_service_followup_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists mobile_service_followups_guard_insert on public.mobile_service_followups;
create trigger mobile_service_followups_guard_insert
before insert on public.mobile_service_followups
for each row execute function public.mobile_guard_service_followup_insert();

-- Canonical Dispatch assignment now understands explicit Mobile field operators.
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
  if p_assigned_user_id is not null
     and not public.mobile_dispatch_profile_eligible(p_shop_id, p_assigned_user_id) then
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
        'role', p.role,
        'fieldOperator', public.mobile_is_field_operator(p_shop_id, p.id)
      ) order by p.full_name nulls last, p.email)
      from public.profiles p
      where p.shop_id = p_shop_id
        and public.mobile_dispatch_profile_eligible(p_shop_id, p.id)
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

-- Offline transitions must retain the version observed when the user queued the
-- action. Status alone is insufficient because working -> paused -> working is an
-- ABA cycle that can return to the same status at a newer version.
drop function if exists public.mobile_replay_service_visit_transition_atomic(
  uuid,uuid,text,text,uuid,text
);

create function public.mobile_replay_service_visit_transition_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_from_status text,
  p_to_status text,
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
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if not public.dispatch_can_execute(p_shop_id, p_actor_user_id, p_visit_id) then
    raise exception using errcode = '42501', message = 'Field execution access is required.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;
  if p_expected_version is null then
    raise exception using errcode = '22023', message = 'Expected visit version is required for offline replay.';
  end if;

  select result into v_existing
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = 'dispatch_visit_transition'
    and k.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_visit
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Service Visit not found.';
  end if;
  if v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'SERVICE_VISIT_VERSION_CHANGED';
  end if;
  if v_visit.status <> lower(p_from_status) then
    raise exception using errcode = '40001', message = 'SERVICE_VISIT_STATE_CHANGED';
  end if;

  return public.dispatch_transition_service_visit_atomic(
    p_shop_id,
    p_visit_id,
    lower(p_to_status),
    null,
    null,
    p_expected_version,
    p_actor_user_id,
    p_operation_key
  );
end;
$$;

revoke all on function public.mobile_replay_service_visit_transition_atomic(
  uuid,uuid,text,text,integer,uuid,text
) from public, anon;
grant execute on function public.mobile_replay_service_visit_transition_atomic(
  uuid,uuid,text,text,integer,uuid,text
) to authenticated, service_role;

-- Follow-up queue lifecycle. Capturing a recommendation is not enough; it needs
-- a canonical way to leave the open queue when quoted, converted, or dismissed.
create or replace function public.mobile_update_service_followup_status_atomic(
  p_shop_id uuid,
  p_followup_id uuid,
  p_status text,
  p_converted_work_order_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_followup public.mobile_service_followups%rowtype;
  v_existing jsonb;
  v_target text := lower(trim(coalesce(p_status, '')));
  v_result jsonb;
  v_allowed boolean := false;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;
  if v_target not in ('quoted','converted','dismissed') then
    raise exception using errcode = '22023', message = 'Invalid follow-up status.';
  end if;

  select result into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_service_followup_status'
    and mok.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;

  select * into v_followup
  from public.mobile_service_followups f
  where f.id = p_followup_id and f.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Follow-up not found.';
  end if;

  v_allowed := public.dispatch_can_manage(p_shop_id, p_actor_user_id)
    or v_followup.recommended_by = v_profile.id
    or exists (
      select 1 from public.service_visits sv
      where sv.shop_id = p_shop_id
        and sv.work_order_id = v_followup.work_order_id
        and sv.assigned_user_id = v_profile.id
        and (v_followup.service_visit_id is null or sv.id = v_followup.service_visit_id)
    );
  if not v_allowed then
    raise exception using errcode = '42501', message = 'Follow-up update access denied.';
  end if;

  if v_followup.status = v_target then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'followupId', v_followup.id,
      'status', v_followup.status
    );
  end if;
  if v_followup.status in ('converted','dismissed') then
    raise exception using errcode = 'P0001', message = 'Terminal follow-ups cannot be reopened.';
  end if;
  if v_target = 'converted' then
    if p_converted_work_order_id is null or not exists (
      select 1 from public.work_orders wo
      where wo.id = p_converted_work_order_id and wo.shop_id = p_shop_id
    ) then
      raise exception using errcode = '23503', message = 'Converted work order is required and must belong to this shop.';
    end if;
  end if;

  update public.mobile_service_followups
  set status = v_target,
      quoted_at = case when v_target = 'quoted' then coalesce(quoted_at, now()) else quoted_at end,
      converted_work_order_id = case when v_target = 'converted' then p_converted_work_order_id else converted_work_order_id end,
      dismissed_at = case when v_target = 'dismissed' then coalesce(dismissed_at, now()) else dismissed_at end,
      updated_at = now()
  where id = v_followup.id
  returning * into v_followup;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'followupId', v_followup.id,
    'status', v_followup.status,
    'convertedWorkOrderId', v_followup.converted_work_order_id
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'mobile_service_followup_status', p_operation_key,
    coalesce(auth.uid(), p_actor_user_id), v_followup.work_order_id, v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

revoke all on function public.mobile_update_service_followup_status_atomic(
  uuid,uuid,text,uuid,uuid,text
) from public, anon;
grant execute on function public.mobile_update_service_followup_status_atomic(
  uuid,uuid,text,uuid,uuid,text
) to authenticated, service_role;

-- Explicit rapid-intake -> repair handoff. It creates exactly one WO from the
-- already-canonical booking/customer/vehicle identities and links that WO back
-- through the booking so the existing late-WO projection attaches the visit.
create or replace function public.mobile_materialize_service_visit_work_order_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_visit public.service_visits%rowtype;
  v_booking public.bookings%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_custom_id text;
  v_role text;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

  select result into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_materialize_work_order'
    and mok.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;
  v_role := lower(coalesce(v_profile.role, ''));

  select * into v_visit
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id
  for update;
  if not found or v_visit.booking_id is null then
    raise exception using errcode = 'P0001', message = 'Booking-backed Service Visit not found.';
  end if;

  if not public.dispatch_can_manage(p_shop_id, p_actor_user_id)
     and not (
       v_visit.assigned_user_id = v_profile.id
       and public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id)
     ) then
    raise exception using errcode = '42501', message = 'Work-order handoff requires Dispatch authority or the assigned field operator.';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = v_visit.booking_id and b.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Linked booking not found.';
  end if;

  if v_visit.work_order_id is not null then
    select * into v_work_order from public.work_orders where id = v_visit.work_order_id and shop_id = p_shop_id;
  elsif v_booking.work_order_id is not null then
    select * into v_work_order from public.work_orders where id = v_booking.work_order_id and shop_id = p_shop_id;
  end if;

  if v_work_order.id is null then
    if v_booking.customer_id is null or v_booking.vehicle_id is null then
      raise exception using errcode = '23503', message = 'Customer and vehicle are required before creating the work order.';
    end if;
    if not exists (
      select 1 from public.vehicles v
      where v.id = v_booking.vehicle_id
        and v.shop_id = p_shop_id
        and v.customer_id = v_booking.customer_id
    ) then
      raise exception using errcode = '23503', message = 'Booking vehicle does not belong to the booking customer.';
    end if;

    if v_role in ('owner','admin','manager','advisor','service','lead_hand','foreman') then
      select * into v_work_order
      from public.create_work_order_with_custom_id(
        p_shop_id,
        v_booking.customer_id,
        v_booking.vehicle_id,
        coalesce(v_booking.notes, v_visit.dispatch_notes, ''),
        3,
        false,
        case when v_role in ('advisor','service','manager','owner','admin') then v_profile.id else null end
      );
    else
      loop
        v_custom_id := 'WO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
        insert into public.work_orders(
          shop_id, customer_id, vehicle_id, notes, priority, is_waiter,
          created_by, advisor_id, custom_id, status
        ) values (
          p_shop_id, v_booking.customer_id, v_booking.vehicle_id,
          coalesce(v_booking.notes, v_visit.dispatch_notes, ''), 3, false,
          coalesce(auth.uid(), p_actor_user_id), null, v_custom_id, 'awaiting'
        ) on conflict do nothing
        returning * into v_work_order;
        exit when v_work_order.id is not null;
      end loop;
    end if;
  end if;

  update public.bookings
  set work_order_id = v_work_order.id,
      lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
        || jsonb_build_object('mobile_work_order_handoff_operation_key', p_operation_key),
      updated_at = now()
  where id = v_booking.id
    and (work_order_id is null or work_order_id = v_work_order.id);

  select * into v_visit
  from public.service_visits
  where id = p_visit_id and shop_id = p_shop_id;
  if v_visit.work_order_id is distinct from v_work_order.id then
    raise exception using errcode = 'P0001', message = 'Service Visit did not accept the work-order handoff.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'serviceVisitId', v_visit.id,
    'bookingId', v_booking.id,
    'workOrderId', v_work_order.id,
    'workOrderNumber', v_work_order.custom_id,
    'visit', public.dispatch_visit_snapshot(v_visit.id)
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'mobile_materialize_work_order', p_operation_key,
    coalesce(auth.uid(), p_actor_user_id), v_work_order.id, v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

revoke all on function public.mobile_materialize_service_visit_work_order_atomic(
  uuid,uuid,uuid,text
) from public, anon;
grant execute on function public.mobile_materialize_service_visit_work_order_atomic(
  uuid,uuid,uuid,text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
