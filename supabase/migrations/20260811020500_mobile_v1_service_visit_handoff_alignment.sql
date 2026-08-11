begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- A Mobile V1 repair handoff owns both durable links: booking -> work order and
-- Service Visit -> work order. The booking projection can populate the visit
-- link for mobile-mode bookings, but shop-mode Service Visits intentionally do
-- not pass through that mobile-only projection. Make the RPC authoritative for
-- both modes while keeping the projection path idempotent.
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
  v_visit_linked_directly boolean := false;
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
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

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

  if not public.mobile_can_manage_work_orders(p_shop_id, p_actor_user_id)
     and not (
       v_visit.assigned_user_id = v_profile.id
       and public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id)
     ) then
    raise exception using errcode = '42501', message = 'Work-order handoff requires work-order creation authority or the assigned technician.';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = v_visit.booking_id and b.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Linked booking not found.';
  end if;

  if v_visit.work_order_id is not null then
    select * into v_work_order
    from public.work_orders
    where id = v_visit.work_order_id and shop_id = p_shop_id;
  elsif v_booking.work_order_id is not null then
    select * into v_work_order
    from public.work_orders
    where id = v_booking.work_order_id and shop_id = p_shop_id;
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

    if public.mobile_can_manage_work_orders(p_shop_id, p_actor_user_id) then
      select * into v_work_order
      from public.create_work_order_with_custom_id(
        p_shop_id,
        v_booking.customer_id,
        v_booking.vehicle_id,
        coalesce(v_booking.notes, v_visit.dispatch_notes, ''),
        3,
        false,
        case
          when v_role in ('advisor','service','manager','owner','admin') then v_profile.id
          else null
        end
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

  -- Re-read after booking triggers have run. Mobile-mode bookings may already
  -- have projected the work-order link into the Service Visit; shop-mode
  -- bookings intentionally will not have done so.
  select * into v_booking
  from public.bookings b
  where b.id = v_booking.id and b.shop_id = p_shop_id;
  if not found or v_booking.work_order_id is distinct from v_work_order.id then
    raise exception using errcode = 'P0001', message = 'Booking did not accept the work-order handoff.';
  end if;

  select * into v_visit
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Service Visit disappeared during work-order handoff.';
  end if;

  if v_visit.work_order_id is null then
    update public.service_visits sv
    set work_order_id = v_work_order.id,
        version = sv.version + 1,
        updated_at = now()
    where sv.id = p_visit_id
      and sv.shop_id = p_shop_id
      and sv.work_order_id is null
    returning * into v_visit;

    if not found then
      raise exception using errcode = 'P0001', message = 'Service Visit work-order handoff changed concurrently.';
    end if;
    v_visit_linked_directly := true;
  end if;

  if v_visit.work_order_id is distinct from v_work_order.id then
    raise exception using errcode = 'P0001', message = 'Service Visit did not accept the work-order handoff.';
  end if;

  if v_visit_linked_directly then
    insert into public.service_visit_events(
      shop_id, service_visit_id, event_type, from_status, to_status,
      actor_user_id, assigned_user_id, service_vehicle_id, metadata
    ) values (
      p_shop_id, v_visit.id, 'updated', v_visit.status, v_visit.status,
      v_profile.id, v_visit.assigned_user_id, v_visit.service_vehicle_id,
      jsonb_build_object(
        'source', 'mobile_work_order_handoff',
        'booking_id', v_booking.id,
        'work_order_id', v_work_order.id,
        'operation_key', p_operation_key
      )
    );
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

notify pgrst, 'reload schema';

commit;
