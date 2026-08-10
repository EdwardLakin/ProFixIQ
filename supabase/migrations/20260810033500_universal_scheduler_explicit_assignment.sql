begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';
set local check_function_bodies = false;

-- The low-level command accepts an explicit resource id and is therefore an
-- internal primitive. Authenticated clients use apply_portal_booking_command_atomic
-- (no resource parameter) or the separately authorized staff assignment RPC.
revoke execute on function public.scheduler_apply_booking_command_atomic(
  text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,text,text,timestamptz,text,uuid
) from authenticated;
grant execute on function public.scheduler_apply_booking_command_atomic(
  text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,text,text,timestamptz,text,uuid
) to service_role;

-- An explicit scheduler_requested_resource_id can only arrive from trusted
-- server/assignment paths after the low-level RPC is removed from authenticated
-- callers. That explicit pin may target a private bay/truck even if the booking
-- originally came from a customer. Unpinned customer scheduling remains public-
-- capacity-only.
create or replace function public.sync_booking_to_scheduler()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.scheduling_events%rowtype;
  v_reservation public.scheduling_reservations%rowtype;
  v_resource_id uuid;
  v_requested_resource_id uuid;
  v_mode text;
  v_event_status text;
  v_reservation_status text;
  v_public_only boolean := false;
begin
  if new.shop_id is null then return new; end if;

  v_mode := lower(coalesce(new.lifecycle_metadata ->> 'service_mode', ''));
  if v_mode not in ('shop','mobile') then
    select case when s.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end
      into v_mode
    from public.shops s where s.id = new.shop_id;
    v_mode := coalesce(v_mode, 'shop');
  end if;

  begin
    v_requested_resource_id := nullif(
      new.lifecycle_metadata ->> 'scheduler_requested_resource_id', ''
    )::uuid;
  exception when invalid_text_representation then
    v_requested_resource_id := null;
  end;

  v_event_status := case lower(coalesce(new.status, 'pending'))
    when 'confirmed' then 'confirmed'
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end;
  v_reservation_status := case
    when v_event_status = 'completed' then 'completed'
    when v_event_status = 'cancelled' then 'cancelled'
    else 'active'
  end;

  select * into v_event
  from public.scheduling_events e
  where e.booking_id = new.id
  for update;

  if not found then
    insert into public.scheduling_events(
      shop_id, booking_id, work_order_id, source_kind, source_id, mode,
      starts_at, ends_at, status, created_by, metadata
    ) values (
      new.shop_id, new.id, new.work_order_id, 'booking', new.id, v_mode,
      new.starts_at, new.ends_at, v_event_status, new.created_by,
      jsonb_build_object('projection', 'booking')
    ) returning * into v_event;
  else
    update public.scheduling_events
    set work_order_id = new.work_order_id,
        mode = v_mode,
        starts_at = new.starts_at,
        ends_at = new.ends_at,
        status = v_event_status,
        updated_at = now()
    where id = v_event.id
    returning * into v_event;
  end if;

  select * into v_reservation
  from public.scheduling_reservations r
  where r.event_id = v_event.id and r.reservation_role = 'primary'
  for update;

  if v_reservation_status = 'active' then
    v_public_only :=
      coalesce(new.lifecycle_metadata ->> 'created_actor_mode', '') = 'customer'
      and v_requested_resource_id is null;

    v_resource_id := public.scheduler_pick_resource(
      new.shop_id, new.starts_at, new.ends_at, v_mode, v_public_only,
      v_requested_resource_id, v_event.id
    );
  else
    v_resource_id := coalesce(v_reservation.resource_id, v_requested_resource_id);
    if v_resource_id is null then
      select r.id into v_resource_id
      from public.scheduling_resources r
      where r.shop_id = new.shop_id and r.active = true
      order by r.is_fallback desc, r.sort_order, r.id
      limit 1;
    end if;
  end if;

  if v_reservation.id is null then
    insert into public.scheduling_reservations(
      shop_id, event_id, resource_id, reservation_role, starts_at, ends_at, status
    ) values (
      new.shop_id, v_event.id, v_resource_id, 'primary',
      new.starts_at, new.ends_at, v_reservation_status
    );
  else
    update public.scheduling_reservations
    set resource_id = v_resource_id,
        starts_at = new.starts_at,
        ends_at = new.ends_at,
        status = v_reservation_status,
        updated_at = now()
    where id = v_reservation.id;
  end if;

  if new.work_order_id is not null then
    update public.work_orders
    set scheduled_at = new.starts_at,
        expected_completion_at = new.ends_at,
        updated_at = now()
    where id = new.work_order_id
      and shop_id = new.shop_id
      and (
        scheduled_at is distinct from new.starts_at
        or expected_completion_at is distinct from new.ends_at
      );
  end if;
  return new;
end;
$$;

revoke all on function public.sync_booking_to_scheduler()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
