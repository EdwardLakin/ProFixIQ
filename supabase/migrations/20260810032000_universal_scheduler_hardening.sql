begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Final hardening for the coordinated scheduler cutover. These replacements
-- deliberately ship in the same PR/cutover and are not a later product phase.

create or replace function public.scheduler_pick_resource(
  p_shop_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mode text,
  p_public_only boolean default false,
  p_preferred_resource_id uuid default null,
  p_exclude_event_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource_id uuid;
  v_mode text := case
    when lower(coalesce(p_mode, 'shop')) = 'mobile' then 'mobile'
    else 'shop'
  end;
begin
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception using errcode = 'P0001', message = 'Valid scheduling times are required.';
  end if;

  if p_preferred_resource_id is not null then
    select r.id into v_resource_id
    from public.scheduling_resources r
    where r.id = p_preferred_resource_id
      and r.shop_id = p_shop_id
      and r.active = true
      and (r.mode = v_mode or r.mode = 'both')
      and (not p_public_only or r.public_bookable = true)
      and (
        (v_mode = 'shop' and r.resource_type in ('capacity','bay'))
        or (v_mode = 'mobile' and r.resource_type in ('capacity','service_vehicle'))
      )
      and not exists (
        select 1
        from public.scheduling_reservations x
        where x.resource_id = r.id
          and x.status = 'active'
          and (p_exclude_event_id is null or x.event_id <> p_exclude_event_id)
          and x.starts_at < p_ends_at
          and x.ends_at > p_starts_at
      );
    if v_resource_id is null then
      raise exception using errcode = '23P01', message = 'The requested scheduling resource is not available.';
    end if;
    return v_resource_id;
  end if;

  with candidates as (
    select r.*,
      exists (
        select 1
        from public.scheduling_resources nr
        where nr.shop_id = p_shop_id
          and nr.active = true
          and nr.is_fallback = false
          and (nr.mode = v_mode or nr.mode = 'both')
          and (
            (v_mode = 'shop' and nr.resource_type in ('capacity','bay'))
            or (v_mode = 'mobile' and nr.resource_type in ('capacity','service_vehicle'))
          )
      ) as has_real_capacity
    from public.scheduling_resources r
    where r.shop_id = p_shop_id
      and r.active = true
      and (r.mode = v_mode or r.mode = 'both')
      and (not p_public_only or r.public_bookable = true)
      and (
        (v_mode = 'shop' and r.resource_type in ('capacity','bay'))
        or (v_mode = 'mobile' and r.resource_type in ('capacity','service_vehicle'))
      )
  )
  select c.id into v_resource_id
  from candidates c
  where (not c.has_real_capacity or c.is_fallback = false)
    and not exists (
      select 1
      from public.scheduling_reservations x
      where x.resource_id = c.id
        and x.status = 'active'
        and (p_exclude_event_id is null or x.event_id <> p_exclude_event_id)
        and x.starts_at < p_ends_at
        and x.ends_at > p_starts_at
    )
  order by c.is_fallback asc, c.sort_order asc, c.name asc, c.id
  limit 1;

  if v_resource_id is null then
    raise exception using errcode = '23P01', message = 'No scheduling resource is available for this time.';
  end if;
  return v_resource_id;
end;
$$;

revoke all on function public.scheduler_pick_resource(
  uuid,timestamptz,timestamptz,text,boolean,uuid,uuid
) from public, anon, authenticated;

-- Stamp the actor/service context for direct legacy booking inserts too. This is
-- especially important for approved-quote bookings that pre-date scheduler APIs.
create or replace function public.scheduler_stamp_booking_context()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_location_type text;
begin
  new.lifecycle_metadata := coalesce(new.lifecycle_metadata, '{}'::jsonb);

  if nullif(new.lifecycle_metadata ->> 'service_mode', '') is null then
    select s.location_type into v_location_type
    from public.shops s where s.id = new.shop_id;
    new.lifecycle_metadata := new.lifecycle_metadata || jsonb_build_object(
      'service_mode',
      case when v_location_type = 'mobile_service_branch' then 'mobile' else 'shop' end
    );
  end if;

  if nullif(new.lifecycle_metadata ->> 'created_actor_mode', '') is null
     and auth.uid() is not null then
    if new.customer_id is not null and exists (
      select 1 from public.customers c
      where c.id = new.customer_id and c.user_id = auth.uid()
    ) then
      new.lifecycle_metadata := new.lifecycle_metadata
        || jsonb_build_object('created_actor_mode', 'customer');
    else
      new.lifecycle_metadata := new.lifecycle_metadata
        || jsonb_build_object('created_actor_mode', 'staff');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.scheduler_stamp_booking_context()
  from public, anon, authenticated, service_role;

drop trigger if exists bookings_stamp_scheduler_context on public.bookings;
create trigger bookings_stamp_scheduler_context
before insert on public.bookings
for each row execute function public.scheduler_stamp_booking_context();

-- Automatic reschedules are free to move between compatible capacity resources.
-- Only an explicit requested resource pins the appointment to one resource.
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
    v_public_only := coalesce(new.lifecycle_metadata ->> 'created_actor_mode', '') = 'customer';
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

-- Unassigned service visits can likewise move to another compatible truck or
-- capacity resource. An explicitly assigned service vehicle remains pinned.
create or replace function public.sync_service_visit_to_scheduler()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.scheduling_events%rowtype;
  v_booking_event public.scheduling_events%rowtype;
  v_reservation public.scheduling_reservations%rowtype;
  v_resource_id uuid;
  v_preferred_resource uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_event_status text;
  v_reservation_status text;
begin
  v_start := new.scheduled_start;
  v_end := new.scheduled_end;
  if v_start is null or v_end is null then return new; end if;

  if new.booking_id is not null then
    select * into v_booking_event
    from public.scheduling_events e
    where e.booking_id = new.booking_id
    for update;
    if found then
      update public.scheduling_events
      set service_visit_id = new.id,
          work_order_id = coalesce(new.work_order_id, work_order_id),
          updated_at = now()
      where id = v_booking_event.id;
      return new;
    end if;
  end if;

  v_event_status := case
    when new.status = 'completed' then 'completed'
    when new.status = 'cancelled' then 'cancelled'
    when new.status in ('working','arrived','en_route','dispatched','paused') then 'active'
    else 'confirmed'
  end;
  v_reservation_status := case
    when v_event_status = 'completed' then 'completed'
    when v_event_status = 'cancelled' then 'cancelled'
    else 'active'
  end;

  select * into v_event
  from public.scheduling_events e
  where e.service_visit_id = new.id
  for update;

  if not found then
    insert into public.scheduling_events(
      shop_id, work_order_id, service_visit_id, source_kind, source_id,
      mode, starts_at, ends_at, status, created_by, metadata
    ) values (
      new.shop_id, new.work_order_id, new.id, 'service_visit', new.id,
      new.mode, v_start, v_end, v_event_status, new.created_by,
      jsonb_build_object('projection', 'service_visit')
    ) returning * into v_event;
  else
    update public.scheduling_events
    set work_order_id = new.work_order_id,
        mode = new.mode,
        starts_at = v_start,
        ends_at = v_end,
        status = v_event_status,
        updated_at = now()
    where id = v_event.id
    returning * into v_event;
  end if;

  if new.service_vehicle_id is not null then
    select r.id into v_preferred_resource
    from public.scheduling_resources r
    where r.shop_id = new.shop_id
      and r.service_vehicle_id = new.service_vehicle_id
      and r.active = true
    limit 1;
  end if;

  select * into v_reservation
  from public.scheduling_reservations r
  where r.event_id = v_event.id and r.reservation_role = 'primary'
  for update;

  if v_reservation_status = 'active' then
    v_resource_id := public.scheduler_pick_resource(
      new.shop_id, v_start, v_end, new.mode, false,
      v_preferred_resource, v_event.id
    );
  else
    v_resource_id := coalesce(v_reservation.resource_id, v_preferred_resource);
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
      v_start, v_end, v_reservation_status
    );
  else
    update public.scheduling_reservations
    set resource_id = v_resource_id,
        starts_at = v_start,
        ends_at = v_end,
        status = v_reservation_status,
        updated_at = now()
    where id = v_reservation.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_service_visit_to_scheduler()
  from public, anon, authenticated, service_role;

-- Public availability may be queried by a portal customer, but only public
-- resources are returned and their operational names/codes are anonymized.
create or replace function public.scheduler_availability_snapshot(
  p_shop_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_mode text default 'shop',
  p_public_only boolean default false,
  p_resource_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not p_public_only and auth.uid() is not null and not exists (
    select 1 from public.profiles p
    where (p.id = auth.uid() or p.user_id = auth.uid())
      and p.shop_id = p_shop_id
  ) then
    raise exception using errcode = '42501', message = 'Scheduler availability access denied.';
  end if;

  with matching as (
    select r.*,
      exists (
        select 1
        from public.scheduling_resources nr
        where nr.shop_id = p_shop_id
          and nr.active = true
          and nr.is_fallback = false
          and (
            nr.mode = case when lower(coalesce(p_mode,'shop')) = 'mobile'
              then 'mobile' else 'shop' end
            or nr.mode = 'both'
          )
          and (
            (lower(coalesce(p_mode,'shop')) <> 'mobile'
              and nr.resource_type in ('capacity','bay'))
            or (lower(coalesce(p_mode,'shop')) = 'mobile'
              and nr.resource_type in ('capacity','service_vehicle'))
          )
      ) as has_real_capacity
    from public.scheduling_resources r
    where r.shop_id = p_shop_id
      and r.active = true
      and (p_resource_id is null or r.id = p_resource_id)
      and (
        r.mode = case when lower(coalesce(p_mode,'shop')) = 'mobile'
          then 'mobile' else 'shop' end
        or r.mode = 'both'
      )
      and (not p_public_only or r.public_bookable = true)
      and (
        (lower(coalesce(p_mode,'shop')) <> 'mobile'
          and r.resource_type in ('capacity','bay'))
        or (lower(coalesce(p_mode,'shop')) = 'mobile'
          and r.resource_type in ('capacity','service_vehicle'))
      )
  ), usable as (
    select * from matching
    where not has_real_capacity or is_fallback = false
  )
  select jsonb_build_object(
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', case when p_public_only then 'Available capacity' else u.name end,
        'code', case when p_public_only then 'public-capacity' else u.code end,
        'resourceType', case when p_public_only then 'capacity' else u.resource_type end,
        'mode', u.mode,
        'publicBookable', u.public_bookable
      ) order by u.sort_order, u.name)
      from usable u
    ), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'resourceId', x.resource_id,
        'eventId', x.event_id,
        'startsAt', x.starts_at,
        'endsAt', x.ends_at
      ) order by x.starts_at)
      from public.scheduling_reservations x
      join usable u on u.id = x.resource_id
      where x.status = 'active'
        and x.starts_at < p_window_end
        and x.ends_at > p_window_start
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.scheduler_availability_snapshot(
  uuid,timestamptz,timestamptz,text,boolean,uuid
) from public, anon;
grant execute on function public.scheduler_availability_snapshot(
  uuid,timestamptz,timestamptz,text,boolean,uuid
) to authenticated, service_role;

-- A profile moved between shops must not leave stale technician capacity behind.
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
      and (new.shop_id is null or shop_id <> new.shop_id
        or lower(coalesce(new.role, '')) not in ('mechanic','technician','tech'));
  end if;

  if new.shop_id is not null
     and lower(coalesce(new.role, '')) in ('mechanic','technician','tech') then
    insert into public.scheduling_resources(
      shop_id, code, name, resource_type, mode, profile_id,
      public_bookable, is_fallback, active, sort_order
    ) values (
      new.shop_id, 'tech:' || new.id::text,
      coalesce(nullif(trim(new.full_name), ''), 'Technician'),
      'technician', 'both', new.id, false, false, true, 200
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

notify pgrst, 'reload schema';

commit;
