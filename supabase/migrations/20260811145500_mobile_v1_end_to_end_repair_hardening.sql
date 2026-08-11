begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';
set local check_function_bodies = false;

-- Post-merge Mobile V1 hardening. Keep the proven #1404 implementations as
-- private cores and put current authorization / lifecycle invariants around
-- them. The public signatures remain unchanged so existing app/API contracts
-- and generated public-schema types do not move.

alter function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) rename to mobile_create_service_call_v1_core;
alter function public.mobile_create_service_call_v1_core(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) set schema private;

alter function public.mobile_materialize_service_visit_work_order_atomic(
  uuid,uuid,uuid,text
) rename to mobile_materialize_visit_wo_v1_core;
alter function public.mobile_materialize_visit_wo_v1_core(
  uuid,uuid,uuid,text
) set schema private;

alter function public.mobile_create_service_followup_atomic(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) rename to mobile_create_followup_v1_core;
alter function public.mobile_create_followup_v1_core(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) set schema private;

alter function public.mobile_update_service_followup_status_atomic(
  uuid,uuid,text,uuid,uuid,text
) rename to mobile_update_followup_v1_core;
alter function public.mobile_update_followup_v1_core(
  uuid,uuid,text,uuid,uuid,text
) set schema private;

revoke all on function private.mobile_create_service_call_v1_core(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) from public, anon, authenticated, service_role;
revoke all on function private.mobile_materialize_visit_wo_v1_core(
  uuid,uuid,uuid,text
) from public, anon, authenticated, service_role;
revoke all on function private.mobile_create_followup_v1_core(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) from public, anon, authenticated, service_role;
revoke all on function private.mobile_update_followup_v1_core(
  uuid,uuid,text,uuid,uuid,text
) from public, anon, authenticated, service_role;

-- Rapid intake must authenticate current shop membership before an old
-- operation key can return anything. In solo/no-dispatch operation, the current
-- explicit field operator owns the visit regardless of whether the physical
-- service mode is shop or mobile.
create function public.mobile_create_service_call_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_vehicle_id uuid,
  p_vehicle_year integer,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_plate text,
  p_address_line1 text,
  p_city text,
  p_province_state text,
  p_postal_code text,
  p_concern text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_quoted_price numeric,
  p_currency text,
  p_service_mode text,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_key public.mobile_operation_keys%rowtype;
  v_result jsonb;
  v_visit_id uuid;
  v_actor_key_id uuid := coalesce(auth.uid(), p_actor_user_id);
  v_can_intake boolean := false;
  v_should_auto_assign boolean := false;
  v_assigned_user_id uuid;
  v_visit_status text;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;

  v_can_intake := lower(coalesce(v_profile.role, '')) in (
    'owner','admin','manager','advisor','service','mechanic','technician','tech',
    'lead_hand','leadhand','foreman'
  ) or public.mobile_is_field_operator(p_shop_id, v_profile.id);
  if not v_can_intake then
    raise exception using errcode = '42501', message = 'Mobile intake is not allowed for this actor.';
  end if;

  select * into v_key
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'rapid_service_intake'
    and mok.operation_key = p_operation_key
  limit 1;
  if found and v_key.actor_user_id is distinct from v_actor_key_id then
    raise exception using errcode = '42501', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to another actor.';
  end if;

  v_result := private.mobile_create_service_call_v1_core(
    p_shop_id,
    p_customer_id,
    p_customer_name,
    p_phone,
    p_vehicle_id,
    p_vehicle_year,
    p_vehicle_make,
    p_vehicle_model,
    p_vehicle_plate,
    p_address_line1,
    p_city,
    p_province_state,
    p_postal_code,
    p_concern,
    p_starts_at,
    p_duration_minutes,
    p_quoted_price,
    p_currency,
    p_service_mode,
    p_actor_user_id,
    p_operation_key
  );

  v_visit_id := nullif(v_result ->> 'serviceVisitId', '')::uuid;
  select
    public.mobile_is_field_operator(p_shop_id, v_profile.id)
      and (coalesce(ms.solo_mode, false) or not coalesce(ms.dispatch_enabled, true))
  into v_should_auto_assign
  from public.mobile_service_settings ms
  where ms.shop_id = p_shop_id;
  v_should_auto_assign := coalesce(v_should_auto_assign, false);

  if v_should_auto_assign and v_visit_id is not null then
    update public.service_visits sv
    set assigned_user_id = v_profile.id,
        version = sv.version + 1,
        updated_at = now()
    where sv.id = v_visit_id
      and sv.shop_id = p_shop_id
      and sv.assigned_user_id is null
    returning sv.assigned_user_id, sv.status
      into v_assigned_user_id, v_visit_status;

    if found then
      perform public.dispatch_sync_technician_reservation(v_visit_id);
      perform public.dispatch_record_visit_event(
        v_visit_id,
        'assigned',
        p_actor_user_id,
        v_visit_status,
        v_visit_status,
        jsonb_build_object(
          'source', 'rapid_mobile_intake',
          'auto_assigned', true,
          'reason', 'solo_or_dispatch_disabled',
          'service_mode', v_result ->> 'serviceMode'
        )
      );
    else
      select sv.assigned_user_id into v_assigned_user_id
      from public.service_visits sv
      where sv.id = v_visit_id and sv.shop_id = p_shop_id;
    end if;

    if v_assigned_user_id = v_profile.id then
      v_result := v_result || jsonb_build_object('assignedToCurrentActor', true);
      update public.mobile_operation_keys mok
      set result = v_result
      where mok.shop_id = p_shop_id
        and mok.operation_name = 'rapid_service_intake'
        and mok.operation_key = p_operation_key
        and mok.actor_user_id is not distinct from v_actor_key_id;
    end if;
  end if;

  return v_result;
end;
$$;

-- Work-order handoff re-authorizes membership and Service Visit authority before
-- the old idempotency cache can return its dispatch snapshot. It also guarantees
-- that a booking-backed repair opens with at least one executable canonical job
-- line derived from the customer concern.
create function public.mobile_materialize_service_visit_work_order_atomic(
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
  v_key public.mobile_operation_keys%rowtype;
  v_result jsonb;
  v_work_order_id uuid;
  v_line_id uuid;
  v_line_no integer;
  v_concern text;
  v_actor_key_id uuid := coalesce(auth.uid(), p_actor_user_id);
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;

  select * into v_visit
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id
  for update;
  if not found or v_visit.booking_id is null then
    raise exception using errcode = 'P0001', message = 'Booking-backed Service Visit not found.';
  end if;

  if not public.mobile_can_manage_work_orders(p_shop_id, p_actor_user_id)
     and not (
       v_visit.assigned_user_id = v_profile.id
       and public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id)
     ) then
    raise exception using errcode = '42501', message = 'Work-order handoff requires work-order creation authority or the assigned technician.';
  end if;

  select * into v_key
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_materialize_work_order'
    and mok.operation_key = p_operation_key
  limit 1;
  if found then
    if v_key.actor_user_id is distinct from v_actor_key_id then
      raise exception using errcode = '42501', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to another actor.';
    end if;
    if coalesce(v_key.result ->> 'serviceVisitId', '') <> p_visit_id::text then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to another Service Visit.';
    end if;
  end if;

  v_result := private.mobile_materialize_visit_wo_v1_core(
    p_shop_id,
    p_visit_id,
    p_actor_user_id,
    p_operation_key
  );
  v_work_order_id := nullif(v_result ->> 'workOrderId', '')::uuid;
  if v_work_order_id is null then
    raise exception using errcode = 'P0001', message = 'Work-order handoff did not return a work order.';
  end if;

  select * into v_visit
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id;
  select * into v_booking
  from public.bookings b
  where b.id = v_visit.booking_id and b.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Linked booking not found after work-order handoff.';
  end if;

  select wol.id into v_line_id
  from public.work_order_lines wol
  where wol.shop_id = p_shop_id
    and wol.work_order_id = v_work_order_id
    and wol.line_type = 'job'
    and wol.voided_at is null
  order by wol.line_no nulls last, wol.created_at, wol.id
  limit 1;

  if v_line_id is null then
    select coalesce(max(wol.line_no), 0) + 1 into v_line_no
    from public.work_order_lines wol
    where wol.shop_id = p_shop_id
      and wol.work_order_id = v_work_order_id;

    v_concern := coalesce(
      nullif(trim(coalesce(v_booking.notes, '')), ''),
      nullif(trim(coalesce(v_visit.dispatch_notes, '')), ''),
      'Service request'
    );

    insert into public.work_order_lines(
      work_order_id,
      vehicle_id,
      user_id,
      shop_id,
      line_no,
      line_type,
      complaint,
      job_type,
      status,
      approval_state,
      assigned_to,
      assigned_tech_id,
      updated_at
    ) values (
      v_work_order_id,
      v_booking.vehicle_id,
      v_visit.assigned_user_id,
      p_shop_id,
      v_line_no,
      'job',
      v_concern,
      'diagnosis',
      'awaiting',
      'approved',
      v_visit.assigned_user_id,
      v_visit.assigned_user_id,
      now()
    )
    returning id into v_line_id;

    if v_visit.assigned_user_id is not null then
      insert into public.work_order_line_technicians(
        work_order_line_id,
        technician_id,
        assigned_by
      ) values (
        v_line_id,
        v_visit.assigned_user_id,
        v_profile.id
      )
      on conflict (work_order_line_id, technician_id)
      do update set assigned_by = excluded.assigned_by;
    end if;
  end if;

  v_result := v_result || jsonb_build_object('initialWorkOrderLineId', v_line_id);
  update public.mobile_operation_keys mok
  set result = v_result,
      work_order_id = v_work_order_id,
      work_order_line_id = coalesce(mok.work_order_line_id, v_line_id)
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_materialize_work_order'
    and mok.operation_key = p_operation_key
    and mok.actor_user_id is not distinct from v_actor_key_id;

  return v_result;
end;
$$;

-- Follow-up idempotency is also actor/resource scoped before the legacy core can
-- return a cached result. This closes the same revoked-membership pattern across
-- every Mobile Service operation-key RPC without changing lifecycle semantics.
create function public.mobile_create_service_followup_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_service_visit_id uuid,
  p_recommendation text,
  p_disposition text,
  p_estimated_amount numeric,
  p_follow_up_at timestamptz,
  p_notes text,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_work_order public.work_orders%rowtype;
  v_key public.mobile_operation_keys%rowtype;
  v_assigned_visit_id uuid;
  v_actor_key_id uuid := coalesce(auth.uid(), p_actor_user_id);
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;

  select * into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id and wo.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found.';
  end if;

  if not public.mobile_can_manage_followups(p_shop_id, p_actor_user_id) then
    if not public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id) then
      raise exception using errcode = '42501', message = 'Field execution access is required.';
    end if;
    select sv.id into v_assigned_visit_id
    from public.service_visits sv
    where sv.shop_id = p_shop_id
      and sv.work_order_id = p_work_order_id
      and sv.assigned_user_id = v_profile.id
      and (p_service_visit_id is null or sv.id = p_service_visit_id)
    order by sv.created_at desc
    limit 1;
    if v_assigned_visit_id is null then
      raise exception using errcode = '42501', message = 'Field recommendations require an assigned Service Visit.';
    end if;
  end if;

  if p_service_visit_id is not null and not exists (
    select 1 from public.service_visits sv
    where sv.id = p_service_visit_id
      and sv.shop_id = p_shop_id
      and sv.work_order_id = p_work_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'Service Visit does not match the work order.';
  end if;

  select * into v_key
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_service_followup'
    and mok.operation_key = p_operation_key
  limit 1;
  if found then
    if v_key.actor_user_id is distinct from v_actor_key_id then
      raise exception using errcode = '42501', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to another actor.';
    end if;
    if v_key.work_order_id is distinct from p_work_order_id then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to another work order.';
    end if;
  end if;

  return private.mobile_create_followup_v1_core(
    p_shop_id,
    p_work_order_id,
    p_service_visit_id,
    p_recommendation,
    p_disposition,
    p_estimated_amount,
    p_follow_up_at,
    p_notes,
    p_actor_user_id,
    p_operation_key
  );
end;
$$;

create function public.mobile_update_service_followup_status_atomic(
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
  v_key public.mobile_operation_keys%rowtype;
  v_allowed boolean := false;
  v_actor_key_id uuid := coalesce(auth.uid(), p_actor_user_id);
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

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

  v_allowed := public.mobile_can_manage_followups(p_shop_id, p_actor_user_id)
    or v_followup.recommended_by = v_profile.id
    or (
      public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id)
      and exists (
        select 1 from public.service_visits sv
        where sv.shop_id = p_shop_id
          and sv.work_order_id = v_followup.work_order_id
          and sv.assigned_user_id = v_profile.id
          and (v_followup.service_visit_id is null or sv.id = v_followup.service_visit_id)
      )
    );
  if not v_allowed then
    raise exception using errcode = '42501', message = 'Follow-up update access denied.';
  end if;

  select * into v_key
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_service_followup_status'
    and mok.operation_key = p_operation_key
  limit 1;
  if found then
    if v_key.actor_user_id is distinct from v_actor_key_id then
      raise exception using errcode = '42501', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to another actor.';
    end if;
    if v_key.work_order_id is distinct from v_followup.work_order_id then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to another work order.';
    end if;
  end if;

  return private.mobile_update_followup_v1_core(
    p_shop_id,
    p_followup_id,
    p_status,
    p_converted_work_order_id,
    p_actor_user_id,
    p_operation_key
  );
end;
$$;

-- The booking trigger remains customer-safe. The only new insert path is the
-- exact rapid-intake booking stamped by the Mobile RPC and created by the
-- currently authenticated canonical work-order creator.
create or replace function public.guard_customer_booking_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_customer_user_id uuid;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'INSERT' then
      if coalesce(new.status, 'pending') <> 'pending' then
        raise exception 'Portal bookings must begin as pending';
      end if;
      return new;
    end if;

    if old.status in ('cancelled', 'completed')
       and new.status is distinct from old.status then
      raise exception 'Completed or cancelled bookings cannot be changed';
    end if;

    if old.status = 'confirmed' and new.status = 'pending' then
      raise exception 'Confirmed bookings cannot return to pending';
    end if;

    return new;
  end if;

  if public.is_staff_for_shop(new.shop_id) then
    return new;
  end if;

  if tg_op = 'INSERT'
     and public.mobile_can_manage_work_orders(new.shop_id, auth.uid())
     and coalesce(new.status, 'pending') = 'confirmed'
     and new.created_by = public.dispatch_actor_profile_id(new.shop_id, auth.uid())
     and coalesce(new.lifecycle_metadata ->> 'source', '') = 'rapid_mobile_intake'
     and coalesce(new.lifecycle_metadata ->> 'created_actor_mode', '') = 'staff' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and public.mobile_can_manage_work_orders(new.shop_id, auth.uid())
     and old.work_order_id is null
     and new.work_order_id is not null
     and nullif(trim(coalesce(
       new.lifecycle_metadata ->> 'mobile_work_order_handoff_operation_key',
       ''
     )), '') is not null
     and new.shop_id is not distinct from old.shop_id
     and new.customer_id is not distinct from old.customer_id
     and new.vehicle_id is not distinct from old.vehicle_id
     and new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at
     and new.status is not distinct from old.status
     and new.notes is not distinct from old.notes then
    return new;
  end if;

  select c.user_id
  into v_customer_user_id
  from public.customers c
  where c.id = new.customer_id;

  if v_customer_user_id is distinct from auth.uid() then
    raise exception 'Booking does not belong to the current customer';
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending') <> 'pending' then
      raise exception 'Customer bookings must begin as pending';
    end if;
    return new;
  end if;

  if old.status in ('cancelled', 'completed')
     and new.status is distinct from old.status then
    raise exception 'Completed or cancelled bookings cannot be changed';
  end if;

  if new.status is distinct from old.status
     and not (
       old.status in ('pending', 'confirmed')
       and new.status = 'cancelled'
     ) then
    raise exception 'Customers may only cancel an active booking';
  end if;

  if new.shop_id is distinct from old.shop_id
     or new.customer_id is distinct from old.customer_id
     or new.vehicle_id is distinct from old.vehicle_id
     or new.work_order_id is distinct from old.work_order_id
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.notes is distinct from old.notes then
    raise exception 'Customers cannot edit protected booking fields';
  end if;

  return new;
end;
$function$;

-- Starting/resuming physical repair and completing a Service Visit both require
-- the canonical repair record. Travel and arrival remain valid before handoff.
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
  if v_to in ('working', 'completed') and v_visit.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'A linked work order is required before starting or completing repair.';
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

-- Offline replay performs the same prerequisite before its cached transition
-- return, so a pre-handoff working/completed state cannot be replayed around the
-- canonical boundary.
create or replace function public.mobile_replay_service_visit_transition_atomic(
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

  select * into v_visit
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Service Visit not found.';
  end if;
  if lower(trim(coalesce(p_to_status, ''))) in ('working', 'completed')
     and v_visit.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'A linked work order is required before starting or completing repair.';
  end if;

  select result into v_existing
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = 'dispatch_visit_transition'
    and k.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
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

revoke all on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) to authenticated, service_role;

revoke all on function public.mobile_materialize_service_visit_work_order_atomic(
  uuid,uuid,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_materialize_service_visit_work_order_atomic(
  uuid,uuid,uuid,text
) to authenticated, service_role;

revoke all on function public.mobile_create_service_followup_atomic(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_create_service_followup_atomic(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) to authenticated, service_role;

revoke all on function public.mobile_update_service_followup_status_atomic(
  uuid,uuid,text,uuid,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_update_service_followup_status_atomic(
  uuid,uuid,text,uuid,uuid,text
) to authenticated, service_role;

revoke all on function public.dispatch_transition_service_visit_atomic(
  uuid,uuid,text,integer,numeric,integer,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.dispatch_transition_service_visit_atomic(
  uuid,uuid,text,integer,numeric,integer,uuid,text
) to authenticated, service_role;

revoke all on function public.mobile_replay_service_visit_transition_atomic(
  uuid,uuid,text,text,integer,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_replay_service_visit_transition_atomic(
  uuid,uuid,text,text,integer,uuid,text
) to authenticated, service_role;

revoke all on function public.guard_customer_booking_mutation()
  from public, anon, authenticated, service_role;
grant execute on function public.guard_customer_booking_mutation()
  to service_role;

notify pgrst, 'reload schema';

commit;
