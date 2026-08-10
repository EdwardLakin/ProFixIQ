begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- Universal Scheduler final tenant/security and capacity-transition hardening.
-- ---------------------------------------------------------------------------

create or replace function public.scheduler_actor_matches(p_actor_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or (
      auth.uid() is not null
      and (
        auth.uid() = p_actor_user_id
        or exists (
          select 1 from public.profiles p
          where p.id = p_actor_user_id
            and p.user_id = auth.uid()
        )
      )
    );
$$;

revoke all on function public.scheduler_actor_matches(uuid) from public, anon;
grant execute on function public.scheduler_actor_matches(uuid)
  to authenticated, service_role;

-- Move active compatibility reservations onto real capacity when a shop first
-- configures bays/trucks. Existing accepted appointments remain capacity-visible.
create or replace function public.scheduler_rebalance_fallback_reservations(
  p_shop_id uuid,
  p_mode text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_resource_id uuid;
  v_count integer := 0;
  v_mode text := case when lower(coalesce(p_mode,'shop')) = 'mobile' then 'mobile' else 'shop' end;
begin
  if not exists (
    select 1
    from public.scheduling_resources r
    where r.shop_id = p_shop_id
      and r.active = true
      and r.is_fallback = false
      and (r.mode = v_mode or r.mode = 'both')
      and (
        (v_mode = 'shop' and r.resource_type in ('capacity','bay'))
        or (v_mode = 'mobile' and r.resource_type in ('capacity','service_vehicle'))
      )
  ) then
    return 0;
  end if;

  for v_row in
    select
      sr.id as reservation_id,
      sr.event_id,
      sr.starts_at,
      sr.ends_at
    from public.scheduling_reservations sr
    join public.scheduling_events e on e.id = sr.event_id
    join public.scheduling_resources r on r.id = sr.resource_id
    where sr.shop_id = p_shop_id
      and sr.status = 'active'
      and r.is_fallback = true
      and e.mode = v_mode
    order by sr.starts_at, sr.id
    for update of sr
  loop
    v_resource_id := public.scheduler_pick_resource(
      p_shop_id,
      v_row.starts_at,
      v_row.ends_at,
      v_mode,
      false,
      null,
      v_row.event_id
    );

    update public.scheduling_reservations
    set resource_id = v_resource_id,
        updated_at = now()
    where id = v_row.reservation_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.scheduler_rebalance_fallback_reservations(uuid,text)
  from public, anon, authenticated;

-- Public availability is callable anonymously, but only in public mode. Internal
-- capacity reads require an authenticated same-shop actor or service-role JWT.
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
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if not p_public_only
     and v_jwt_role <> 'service_role'
     and (
       auth.uid() is null
       or not exists (
         select 1 from public.profiles p
         where (p.id = auth.uid() or p.user_id = auth.uid())
           and p.shop_id = p_shop_id
       )
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
        'eventId', case when p_public_only then null else x.event_id end,
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
) from public;
grant execute on function public.scheduler_availability_snapshot(
  uuid,timestamptz,timestamptz,text,boolean,uuid
) to anon, authenticated, service_role;

-- Canonical command: enforce caller->actor identity before any tenant checks.
create or replace function public.scheduler_apply_booking_command_atomic(
  p_action text,
  p_booking_id uuid,
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text,
  p_actor_user_id uuid,
  p_actor_mode text,
  p_operation_key text,
  p_reason text default null,
  p_at timestamptz default now(),
  p_mode text default 'shop',
  p_resource_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_actor_mode text := lower(trim(coalesce(p_actor_mode, '')));
  v_service_mode text := case
    when lower(coalesce(p_mode, 'shop')) = 'mobile' then 'mobile'
    else 'shop'
  end;
  v_now timestamptz := coalesce(p_at, now());
  v_booking public.bookings%rowtype;
  v_customer public.customers%rowtype;
  v_shop public.shops%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_min_notice integer;
  v_max_lead integer;
  v_operation_name text;
  v_event_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Scheduling actor does not match the authenticated caller.';
  end if;
  if v_action not in ('create','reschedule','cancel','confirm','complete') then
    raise exception using errcode = 'P0001', message = 'Unsupported scheduling action.';
  end if;
  if v_actor_mode not in ('customer','staff') then
    raise exception using errcode = 'P0001', message = 'Unsupported scheduling actor mode.';
  end if;
  if p_actor_user_id is null or nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'Authenticated actor and stable operation key are required.';
  end if;

  if p_booking_id is not null then
    select b.shop_id into p_shop_id
    from public.bookings b where b.id = p_booking_id;
  end if;
  if p_shop_id is null then
    raise exception using errcode = 'P0001', message = 'Scheduling shop could not be resolved.';
  end if;

  v_operation_name := 'scheduler_booking_' || v_action;
  select k.result into v_existing
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = v_operation_name
    and k.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  if v_action = 'create' then
    if p_customer_id is null then
      raise exception using errcode = 'P0001', message = 'Customer is required.';
    end if;
    select * into v_shop from public.shops where id = p_shop_id for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Shop not found.';
    end if;
    if v_actor_mode = 'customer' and v_shop.accepts_online_booking is false then
      raise exception using errcode = 'P0001', message = 'Shop is not accepting online bookings.';
    end if;

    select * into v_customer from public.customers where id = p_customer_id for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Customer not found.';
    end if;
    if v_actor_mode = 'customer' and v_customer.user_id is distinct from p_actor_user_id then
      raise exception using errcode = '42501', message = 'Customer booking actor mismatch.';
    end if;
    if v_actor_mode = 'staff' and not exists (
      select 1 from public.profiles p
      where (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
        and p.shop_id = p_shop_id
        and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor')
    ) then
      raise exception using errcode = '42501', message = 'Staff booking actor is not authorized.';
    end if;
    if v_customer.shop_id is not null and v_customer.shop_id <> p_shop_id then
      raise exception using errcode = '42501', message = 'Customer belongs to another shop.';
    end if;
    if p_vehicle_id is not null and not exists (
      select 1 from public.vehicles v
      where v.id = p_vehicle_id
        and v.customer_id = p_customer_id
        and v.shop_id = p_shop_id
    ) then
      raise exception using errcode = '42501', message = 'Vehicle does not belong to this customer and shop.';
    end if;
    if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
      raise exception using errcode = 'P0001', message = 'Valid booking times are required.';
    end if;

    v_min_notice := coalesce(v_shop.min_notice_minutes, 120);
    v_max_lead := coalesce(v_shop.max_lead_days, 30);
    if p_starts_at < v_now + make_interval(mins => v_min_notice) then
      raise exception using errcode = 'P0001', message = 'Booking does not satisfy minimum notice.';
    end if;
    if p_starts_at > v_now + make_interval(days => v_max_lead) then
      raise exception using errcode = 'P0001', message = 'Booking exceeds maximum lead time.';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(p_shop_id::text || ':' || v_service_mode, 0)
    );
    perform public.scheduler_pick_resource(
      p_shop_id, p_starts_at, p_ends_at, v_service_mode,
      (v_actor_mode = 'customer'), p_resource_id, null
    );

    update public.customers set shop_id = p_shop_id
    where id = p_customer_id and shop_id is null;

    insert into public.bookings(
      shop_id, customer_id, vehicle_id, starts_at, ends_at, status, notes,
      created_by, updated_at, lifecycle_metadata
    ) values (
      p_shop_id, p_customer_id, p_vehicle_id, p_starts_at, p_ends_at,
      'pending', nullif(trim(coalesce(p_notes, '')), ''), p_actor_user_id, v_now,
      jsonb_strip_nulls(jsonb_build_object(
        'created_actor_mode', v_actor_mode,
        'created_operation_key', p_operation_key,
        'service_mode', v_service_mode,
        'scheduler_requested_resource_id', p_resource_id
      ))
    ) returning * into v_booking;
  else
    select * into v_booking
    from public.bookings b
    where b.id = p_booking_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Booking not found.';
    end if;

    if v_actor_mode = 'customer' then
      select * into v_customer from public.customers where id = v_booking.customer_id;
      if v_customer.user_id is distinct from p_actor_user_id then
        raise exception using errcode = '42501', message = 'Booking is not owned by this customer.';
      end if;
    elsif not exists (
      select 1 from public.profiles p
      where (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
        and p.shop_id = v_booking.shop_id
        and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor')
    ) then
      raise exception using errcode = '42501', message = 'Staff booking actor is not authorized.';
    end if;

    if lower(coalesce(v_booking.status, '')) in ('cancelled','completed') then
      raise exception using errcode = 'P0001', message = 'Booking is already in a terminal state.';
    end if;
    if v_actor_mode = 'customer' and v_booking.work_order_id is not null then
      raise exception using errcode = 'P0001', message = 'Work-order-linked booking requires staff workflow.';
    end if;
    if v_actor_mode = 'customer' and v_booking.starts_at <= v_now then
      raise exception using errcode = 'P0001', message = 'Past bookings cannot be changed by the customer.';
    end if;

    if v_action = 'cancel' then
      update public.bookings
      set status = 'cancelled',
          cancelled_at = v_now,
          cancelled_by = p_actor_user_id,
          cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
          updated_at = v_now,
          lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
            || jsonb_build_object(
              'cancelled_actor_mode', v_actor_mode,
              'cancelled_operation_key', p_operation_key
            )
      where id = v_booking.id
      returning * into v_booking;
    elsif v_action in ('confirm','complete') then
      if v_actor_mode <> 'staff' then
        raise exception using errcode = '42501', message = 'Only staff can confirm or complete appointments.';
      end if;
      if v_action = 'confirm' and lower(coalesce(v_booking.status, 'pending')) <> 'pending' then
        raise exception using errcode = 'P0001', message = 'Only pending appointments can be confirmed.';
      end if;
      update public.bookings
      set status = case when v_action = 'confirm' then 'confirmed' else 'completed' end,
          updated_at = v_now,
          lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
            || jsonb_build_object(v_action || '_operation_key', p_operation_key)
      where id = v_booking.id
      returning * into v_booking;
    else
      select * into v_shop from public.shops where id = v_booking.shop_id;
      if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
        raise exception using errcode = 'P0001', message = 'Valid booking times are required.';
      end if;
      v_min_notice := coalesce(v_shop.min_notice_minutes, 120);
      v_max_lead := coalesce(v_shop.max_lead_days, 30);
      if p_starts_at < v_now + make_interval(mins => v_min_notice) then
        raise exception using errcode = 'P0001', message = 'Booking does not satisfy minimum notice.';
      end if;
      if p_starts_at > v_now + make_interval(days => v_max_lead) then
        raise exception using errcode = 'P0001', message = 'Booking exceeds maximum lead time.';
      end if;

      select e.id into v_event_id
      from public.scheduling_events e
      where e.booking_id = v_booking.id;
      perform pg_advisory_xact_lock(
        hashtextextended(v_booking.shop_id::text || ':' || v_service_mode, 0)
      );
      perform public.scheduler_pick_resource(
        v_booking.shop_id, p_starts_at, p_ends_at,
        coalesce(nullif(v_booking.lifecycle_metadata ->> 'service_mode', ''), v_service_mode),
        false, p_resource_id, v_event_id
      );

      update public.bookings
      set starts_at = p_starts_at,
          ends_at = p_ends_at,
          notes = case when p_notes is null then notes else nullif(trim(p_notes), '') end,
          updated_at = v_now,
          lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
            || jsonb_strip_nulls(jsonb_build_object(
              'rescheduled_actor_mode', v_actor_mode,
              'rescheduled_operation_key', p_operation_key,
              'scheduler_requested_resource_id', p_resource_id
            ))
      where id = v_booking.id
      returning * into v_booking;
    end if;
  end if;

  select jsonb_build_object(
    'ok', true,
    'booking', to_jsonb(v_booking),
    'action', v_action,
    'idempotent', false,
    'scheduler', (
      select jsonb_build_object(
        'eventId', e.id,
        'resourceId', r.resource_id,
        'resourceName', sr.name,
        'mode', e.mode
      )
      from public.scheduling_events e
      left join public.scheduling_reservations r
        on r.event_id = e.id and r.reservation_role = 'primary'
      left join public.scheduling_resources sr on sr.id = r.resource_id
      where e.booking_id = v_booking.id
    )
  ) into v_result;

  insert into public.scheduler_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, result
  ) values (
    v_booking.shop_id, v_operation_name, p_operation_key, p_actor_user_id, v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id, v_operation_name, 'bookings', v_booking.id,
    jsonb_build_object('actor_mode', v_actor_mode, 'operation_key', p_operation_key)
  );

  return v_result;
end;
$$;

revoke all on function public.scheduler_apply_booking_command_atomic(
  text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,text,text,timestamptz,text,uuid
) from public, anon;
grant execute on function public.scheduler_apply_booking_command_atomic(
  text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,text,text,timestamptz,text,uuid
) to authenticated, service_role;

-- Resource administration enforces authenticated actor identity, protects
-- resources with future reservations, and migrates fallback reservations when
-- real capacity is introduced.
create or replace function public.scheduler_upsert_resource(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_resource_id uuid,
  p_code text,
  p_name text,
  p_resource_type text,
  p_mode text,
  p_public_bookable boolean,
  p_active boolean,
  p_sort_order integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource public.scheduling_resources%rowtype;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Scheduling actor does not match the authenticated caller.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor')
  ) then
    raise exception using errcode = '42501', message = 'Scheduling resource management denied.';
  end if;
  if p_resource_type not in ('capacity','bay','technician','service_vehicle') then
    raise exception using errcode = 'P0001', message = 'Invalid scheduling resource type.';
  end if;
  if p_mode not in ('shop','mobile','both') then
    raise exception using errcode = 'P0001', message = 'Invalid scheduling resource mode.';
  end if;
  if nullif(trim(coalesce(p_code,'')), '') is null
     or nullif(trim(coalesce(p_name,'')), '') is null then
    raise exception using errcode = 'P0001', message = 'Resource code and name are required.';
  end if;

  if p_resource_id is null then
    insert into public.scheduling_resources(
      shop_id, code, name, resource_type, mode,
      public_bookable, active, sort_order, is_fallback
    ) values (
      p_shop_id, trim(p_code), trim(p_name), p_resource_type, p_mode,
      coalesce(p_public_bookable,false), coalesce(p_active,true),
      coalesce(p_sort_order,100), false
    ) returning * into v_resource;
  else
    if coalesce(p_active, true) = false and exists (
      select 1
      from public.scheduling_reservations x
      where x.resource_id = p_resource_id
        and x.status = 'active'
        and x.ends_at > now()
    ) then
      raise exception using errcode = 'P0001', message = 'Scheduling resource has active future reservations and cannot be disabled.';
    end if;

    update public.scheduling_resources
    set code = trim(p_code),
        name = trim(p_name),
        resource_type = p_resource_type,
        mode = p_mode,
        public_bookable = coalesce(p_public_bookable,false),
        active = coalesce(p_active,true),
        sort_order = coalesce(p_sort_order,100),
        updated_at = now()
    where id = p_resource_id
      and shop_id = p_shop_id
      and is_fallback = false
    returning * into v_resource;
    if not found then
      raise exception using errcode = 'P0001', message = 'Scheduling resource not found or is system managed.';
    end if;
  end if;

  if v_resource.active
     and not v_resource.is_fallback
     and v_resource.resource_type in ('capacity','bay','service_vehicle') then
    perform public.scheduler_rebalance_fallback_reservations(
      p_shop_id,
      case when v_resource.mode = 'mobile' or v_resource.resource_type = 'service_vehicle'
        then 'mobile' else 'shop' end
    );
  end if;

  return jsonb_build_object('ok', true, 'resource', to_jsonb(v_resource));
end;
$$;

revoke all on function public.scheduler_upsert_resource(
  uuid,uuid,uuid,text,text,text,text,boolean,boolean,integer
) from public, anon;
grant execute on function public.scheduler_upsert_resource(
  uuid,uuid,uuid,text,text,text,text,boolean,boolean,integer
) to authenticated, service_role;

-- Service vehicles become mobile capacity. A truck with future reservations may
-- not be disabled until those reservations are moved/cancelled.
create or replace function public.sync_service_vehicle_scheduling_resource()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource_id uuid;
begin
  select r.id into v_resource_id
  from public.scheduling_resources r
  where r.shop_id = new.shop_id
    and r.service_vehicle_id = new.id
    and r.resource_type = 'service_vehicle'
  limit 1;

  if new.active = false and v_resource_id is not null and exists (
    select 1 from public.scheduling_reservations x
    where x.resource_id = v_resource_id
      and x.status = 'active'
      and x.ends_at > now()
  ) then
    raise exception using errcode = 'P0001', message = 'Service vehicle has active future reservations and cannot be disabled.';
  end if;

  if v_resource_id is null then
    insert into public.scheduling_resources(
      shop_id, code, name, resource_type, mode,
      service_vehicle_id, stock_location_id,
      public_bookable, is_fallback, active, sort_order
    ) values (
      new.shop_id, 'service-vehicle:' || new.id::text, new.name,
      'service_vehicle', 'mobile', new.id, new.stock_location_id,
      true, false, new.active, 100
    ) returning id into v_resource_id;
  else
    update public.scheduling_resources
    set name = new.name,
        stock_location_id = new.stock_location_id,
        active = new.active,
        updated_at = now()
    where id = v_resource_id;
  end if;

  if new.active then
    perform public.scheduler_rebalance_fallback_reservations(new.shop_id, 'mobile');
  end if;
  return new;
end;
$$;

revoke all on function public.sync_service_vehicle_scheduling_resource()
  from public, anon, authenticated, service_role;

-- Explicit event/resource reassignment is the backend contract used by resource
-- calendars and later drag/drop dispatch. It does not change repair ownership.
create or replace function public.scheduler_assign_event_resource_atomic(
  p_shop_id uuid,
  p_event_id uuid,
  p_resource_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.scheduling_events%rowtype;
  v_reservation public.scheduling_reservations%rowtype;
  v_resource public.scheduling_resources%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Scheduling actor does not match the authenticated caller.';
  end if;
  if nullif(trim(coalesce(p_operation_key,'')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor')
  ) then
    raise exception using errcode = '42501', message = 'Scheduling resource assignment denied.';
  end if;

  select result into v_existing
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = 'scheduler_assign_resource'
    and k.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_event
  from public.scheduling_events e
  where e.id = p_event_id and e.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Scheduling event not found.';
  end if;
  if v_event.status in ('cancelled','completed') then
    raise exception using errcode = 'P0001', message = 'Terminal scheduling events cannot be reassigned.';
  end if;

  select * into v_resource
  from public.scheduling_resources r
  where r.id = p_resource_id and r.shop_id = p_shop_id and r.active = true;
  if not found then
    raise exception using errcode = 'P0001', message = 'Scheduling resource not found.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':' || v_event.mode, 0)
  );
  perform public.scheduler_pick_resource(
    p_shop_id, v_event.starts_at, v_event.ends_at, v_event.mode,
    false, p_resource_id, v_event.id
  );

  select * into v_reservation
  from public.scheduling_reservations r
  where r.event_id = v_event.id and r.reservation_role = 'primary'
  for update;
  if not found then
    insert into public.scheduling_reservations(
      shop_id, event_id, resource_id, reservation_role,
      starts_at, ends_at, status
    ) values (
      p_shop_id, v_event.id, p_resource_id, 'primary',
      v_event.starts_at, v_event.ends_at, 'active'
    ) returning * into v_reservation;
  else
    update public.scheduling_reservations
    set resource_id = p_resource_id, updated_at = now()
    where id = v_reservation.id
    returning * into v_reservation;
  end if;

  if v_event.booking_id is not null then
    update public.bookings
    set lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
      || jsonb_build_object('scheduler_requested_resource_id', p_resource_id),
      updated_at = now()
    where id = v_event.booking_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'eventId', v_event.id,
    'resource', jsonb_build_object(
      'id', v_resource.id,
      'name', v_resource.name,
      'resourceType', v_resource.resource_type
    ),
    'idempotent', false
  );

  insert into public.scheduler_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, result
  ) values (
    p_shop_id, 'scheduler_assign_resource', p_operation_key,
    p_actor_user_id, v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  return v_result;
end;
$$;

revoke all on function public.scheduler_assign_event_resource_atomic(
  uuid,uuid,uuid,uuid,text
) from public, anon;
grant execute on function public.scheduler_assign_event_resource_atomic(
  uuid,uuid,uuid,uuid,text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
