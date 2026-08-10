begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';
set local check_function_bodies = false;

create extension if not exists btree_gist with schema extensions;

-- ===========================================================================
-- UNIVERSAL SCHEDULER CUTOVER
--
-- bookings remain the durable appointment/request record.
-- work_orders remain the durable repair/commercial record.
-- service_visits remain the durable physical execution/dispatch record.
-- scheduling_events + scheduling_reservations own time/capacity truth.
-- ===========================================================================

-- Service visits may exist before a work order when intake/dispatch precedes the
-- repair record. They must still be anchored to either a booking or a work order.
alter table public.service_visits
  alter column work_order_id drop not null,
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;

alter table public.service_visits
  drop constraint if exists service_visits_anchor_check;
alter table public.service_visits
  add constraint service_visits_anchor_check
  check (work_order_id is not null or booking_id is not null) not valid;
alter table public.service_visits validate constraint service_visits_anchor_check;

create index if not exists service_visits_booking_idx
  on public.service_visits(booking_id, scheduled_start)
  where booking_id is not null;

-- ---------------------------------------------------------------------------
-- Service vehicles. Truck inventory reuses canonical stock_locations.
-- ---------------------------------------------------------------------------

create table if not exists public.service_vehicles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  unit_number text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  primary_user_id uuid references public.profiles(id) on delete set null,
  stock_location_id uuid references public.stock_locations(id) on delete set null,
  active boolean not null default true,
  capabilities jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_vehicles_name_check check (length(trim(name)) > 0)
);

create unique index if not exists service_vehicles_shop_unit_unique
  on public.service_vehicles(shop_id, lower(unit_number))
  where unit_number is not null and trim(unit_number) <> '';
create index if not exists service_vehicles_shop_active_idx
  on public.service_vehicles(shop_id, active, name);

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_visits'::regclass
      and conname = 'service_visits_service_vehicle_id_fkey'
  ) then
    alter table public.service_visits
      add constraint service_visits_service_vehicle_id_fkey
      foreign key (service_vehicle_id)
      references public.service_vehicles(id)
      on delete set null
      not valid;
    alter table public.service_visits
      validate constraint service_visits_service_vehicle_id_fkey;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- Resource model. One event can reserve multiple resources. Primary capacity
-- currently uses capacity/bay for shop mode and capacity/service_vehicle for
-- mobile mode. Technician resources are already modelled for dispatch/secondary
-- reservation without forcing them into every current booking flow.
-- ---------------------------------------------------------------------------

create table if not exists public.scheduling_resources (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  code text not null,
  name text not null,
  resource_type text not null,
  mode text not null default 'shop',
  profile_id uuid references public.profiles(id) on delete cascade,
  service_vehicle_id uuid references public.service_vehicles(id) on delete cascade,
  stock_location_id uuid references public.stock_locations(id) on delete set null,
  public_bookable boolean not null default false,
  is_fallback boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_resources_code_check check (length(trim(code)) > 0),
  constraint scheduling_resources_name_check check (length(trim(name)) > 0),
  constraint scheduling_resources_type_check check (
    resource_type in ('capacity','bay','technician','service_vehicle')
  ),
  constraint scheduling_resources_mode_check check (mode in ('shop','mobile','both'))
);

create unique index if not exists scheduling_resources_shop_code_unique
  on public.scheduling_resources(shop_id, lower(code));
create unique index if not exists scheduling_resources_profile_unique
  on public.scheduling_resources(shop_id, profile_id)
  where profile_id is not null and resource_type = 'technician';
create unique index if not exists scheduling_resources_vehicle_unique
  on public.scheduling_resources(shop_id, service_vehicle_id)
  where service_vehicle_id is not null and resource_type = 'service_vehicle';
create index if not exists scheduling_resources_shop_mode_idx
  on public.scheduling_resources(shop_id, active, mode, resource_type, sort_order);

create table if not exists public.scheduling_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  service_visit_id uuid references public.service_visits(id) on delete set null,
  source_kind text not null default 'booking',
  source_id uuid,
  mode text not null default 'shop',
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_events_window_check check (ends_at > starts_at),
  constraint scheduling_events_mode_check check (mode in ('shop','mobile')),
  constraint scheduling_events_status_check check (
    status in ('pending','confirmed','active','cancelled','completed')
  )
);

create unique index if not exists scheduling_events_booking_unique
  on public.scheduling_events(booking_id) where booking_id is not null;
create unique index if not exists scheduling_events_visit_unique
  on public.scheduling_events(service_visit_id) where service_visit_id is not null;
create index if not exists scheduling_events_shop_window_idx
  on public.scheduling_events(shop_id, starts_at, ends_at);
create index if not exists scheduling_events_work_order_idx
  on public.scheduling_events(work_order_id) where work_order_id is not null;

create table if not exists public.scheduling_reservations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  event_id uuid not null references public.scheduling_events(id) on delete cascade,
  resource_id uuid not null references public.scheduling_resources(id) on delete cascade,
  reservation_role text not null default 'primary',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_reservations_window_check check (ends_at > starts_at),
  constraint scheduling_reservations_status_check check (
    status in ('active','cancelled','completed')
  )
);

create unique index if not exists scheduling_reservations_event_role_unique
  on public.scheduling_reservations(event_id, reservation_role);
create index if not exists scheduling_reservations_shop_window_idx
  on public.scheduling_reservations(shop_id, starts_at, ends_at);

alter table public.scheduling_reservations
  drop constraint if exists scheduling_reservations_no_overlap;
alter table public.scheduling_reservations
  add constraint scheduling_reservations_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'active');

create table if not exists public.scheduler_operation_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  operation_name text not null,
  operation_key text not null,
  actor_user_id uuid,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint scheduler_operation_key_check check (length(trim(operation_key)) > 0)
);
create unique index if not exists scheduler_operation_keys_unique
  on public.scheduler_operation_keys(shop_id, operation_name, operation_key);

-- Compatibility capacity: one resource reproduces the old one-booking-at-a-time
-- behaviour until a shop configures real bays/capacity or mobile trucks.
insert into public.scheduling_resources(
  shop_id, code, name, resource_type, mode,
  public_bookable, is_fallback, active, sort_order
)
select
  s.id,
  'default-capacity',
  case when s.location_type = 'mobile_service_branch'
    then 'Mobile capacity' else 'Shop capacity' end,
  'capacity',
  case when s.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end,
  true,
  true,
  true,
  1000
from public.shops s
on conflict do nothing;

insert into public.scheduling_resources(
  shop_id, code, name, resource_type, mode, profile_id,
  public_bookable, is_fallback, active, sort_order
)
select
  p.shop_id,
  'tech:' || p.id::text,
  coalesce(nullif(trim(p.full_name), ''), 'Technician'),
  'technician',
  'both',
  p.id,
  false,
  false,
  true,
  200
from public.profiles p
where p.shop_id is not null
  and lower(coalesce(p.role, '')) in ('mechanic','technician','tech')
on conflict do nothing;

-- Backfill active bookings while the historical shop-wide exclusion still
-- guarantees they do not overlap. Then retire the old constraint permanently.
insert into public.scheduling_events(
  shop_id, booking_id, work_order_id, source_kind, source_id, mode,
  starts_at, ends_at, status, created_by, metadata
)
select
  b.shop_id,
  b.id,
  b.work_order_id,
  'booking',
  b.id,
  case when s.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end,
  b.starts_at,
  b.ends_at,
  case lower(coalesce(b.status, 'pending'))
    when 'confirmed' then 'confirmed'
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end,
  b.created_by,
  jsonb_build_object('backfilled', true)
from public.bookings b
join public.shops s on s.id = b.shop_id
on conflict do nothing;

insert into public.scheduling_reservations(
  shop_id, event_id, resource_id, reservation_role,
  starts_at, ends_at, status
)
select
  e.shop_id,
  e.id,
  r.id,
  'primary',
  e.starts_at,
  e.ends_at,
  case when e.status in ('cancelled','completed') then e.status else 'active' end
from public.scheduling_events e
join lateral (
  select sr.id
  from public.scheduling_resources sr
  where sr.shop_id = e.shop_id
    and sr.is_fallback = true
    and sr.active = true
  order by sr.sort_order, sr.id
  limit 1
) r on true
where e.booking_id is not null
on conflict do nothing;

alter table public.bookings drop constraint if exists bookings_no_active_overlap;

-- ---------------------------------------------------------------------------
-- Authorization helpers for RLS and RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.scheduler_same_shop(p_shop_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or p.user_id = auth.uid())
      and p.shop_id = p_shop_id
  );
$$;

create or replace function public.scheduler_can_manage(p_shop_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or p.user_id = auth.uid())
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor','mechanic')
  );
$$;

revoke all on function public.scheduler_same_shop(uuid) from public, anon;
revoke all on function public.scheduler_can_manage(uuid) from public, anon;
grant execute on function public.scheduler_same_shop(uuid) to authenticated, service_role;
grant execute on function public.scheduler_can_manage(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Resource selection. The DB exclusion is the final concurrency guarantee.
-- ---------------------------------------------------------------------------

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
          and (not p_public_only or nr.public_bookable = true)
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

-- ---------------------------------------------------------------------------
-- Booking projection trigger. This is the compatibility safety net: even a
-- legacy booking insert/update is represented in the scheduler and cannot
-- violate resource overlap.
-- ---------------------------------------------------------------------------

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
  if new.shop_id is null then
    return new;
  end if;

  v_mode := lower(coalesce(new.lifecycle_metadata ->> 'service_mode', ''));
  if v_mode not in ('shop','mobile') then
    select case when s.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end
      into v_mode
    from public.shops s
    where s.id = new.shop_id;
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
  where r.event_id = v_event.id
    and r.reservation_role = 'primary'
  for update;

  if v_reservation_status = 'active' then
    v_public_only := coalesce(new.lifecycle_metadata ->> 'created_actor_mode', '') = 'customer';
    v_resource_id := public.scheduler_pick_resource(
      new.shop_id,
      new.starts_at,
      new.ends_at,
      v_mode,
      v_public_only,
      coalesce(v_requested_resource_id, v_reservation.resource_id),
      v_event.id
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
      shop_id, event_id, resource_id, reservation_role,
      starts_at, ends_at, status
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

drop trigger if exists bookings_sync_universal_scheduler on public.bookings;
create trigger bookings_sync_universal_scheduler
after insert or update of shop_id, work_order_id, starts_at, ends_at, status, lifecycle_metadata
on public.bookings
for each row
execute function public.sync_booking_to_scheduler();

-- ---------------------------------------------------------------------------
-- Service-visit projection. Standalone mobile visits reserve capacity; visits
-- anchored to a booking reuse that booking event instead of creating a second
-- capacity claim.
-- ---------------------------------------------------------------------------

create or replace function public.prepare_service_visit_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if new.booking_id is not null then
    select * into v_booking
    from public.bookings b
    where b.id = new.booking_id and b.shop_id = new.shop_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'Service visit booking is not available in this shop.';
    end if;
    new.work_order_id := coalesce(new.work_order_id, v_booking.work_order_id);
    new.scheduled_start := coalesce(new.scheduled_start, v_booking.starts_at);
    new.scheduled_end := coalesce(new.scheduled_end, v_booking.ends_at);
  end if;
  if new.work_order_id is not null and not exists (
    select 1 from public.work_orders wo
    where wo.id = new.work_order_id and wo.shop_id = new.shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Service visit work order is not available in this shop.';
  end if;
  if new.scheduled_start is not null and new.scheduled_end is not null
     and new.scheduled_end <= new.scheduled_start then
    raise exception using errcode = 'P0001', message = 'Service visit end must be after start.';
  end if;
  return new;
end;
$$;

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
  if v_start is null or v_end is null then
    return new;
  end if;

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
      coalesce(v_preferred_resource, v_reservation.resource_id), v_event.id
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
      new.shop_id, v_event.id, v_resource_id, 'primary', v_start, v_end, v_reservation_status
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

revoke all on function public.prepare_service_visit_schedule()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_service_visit_to_scheduler()
  from public, anon, authenticated, service_role;

drop trigger if exists service_visits_prepare_scheduler on public.service_visits;
create trigger service_visits_prepare_scheduler
before insert or update of shop_id, booking_id, work_order_id, scheduled_start, scheduled_end
on public.service_visits
for each row execute function public.prepare_service_visit_schedule();

drop trigger if exists service_visits_sync_universal_scheduler on public.service_visits;
create trigger service_visits_sync_universal_scheduler
after insert or update of shop_id, booking_id, work_order_id, mode, status,
  scheduled_start, scheduled_end, service_vehicle_id
on public.service_visits
for each row execute function public.sync_service_visit_to_scheduler();

-- ---------------------------------------------------------------------------
-- Canonical atomic booking command.
-- ---------------------------------------------------------------------------

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

-- Existing callers retain their function signature but no longer own scheduling
-- rules. This is deliberately a compatibility adapter.
create or replace function public.apply_portal_booking_command_atomic(
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
  p_at timestamptz default now()
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.scheduler_apply_booking_command_atomic(
    p_action,
    p_booking_id,
    p_shop_id,
    p_customer_id,
    p_vehicle_id,
    p_starts_at,
    p_ends_at,
    p_notes,
    p_actor_user_id,
    p_actor_mode,
    p_operation_key,
    p_reason,
    p_at,
    case
      when p_booking_id is not null then coalesce(
        (select nullif(b.lifecycle_metadata ->> 'service_mode', '')
         from public.bookings b where b.id = p_booking_id),
        'shop'
      )
      when p_shop_id is not null then coalesce(
        (select case when s.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end
         from public.shops s where s.id = p_shop_id),
        'shop'
      )
      else 'shop'
    end,
    null
  );
$$;

revoke all on function public.apply_portal_booking_command_atomic(
  text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,text,text,timestamptz
) from public;
grant execute on function public.apply_portal_booking_command_atomic(
  text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,text,text,timestamptz
) to authenticated, service_role;

-- Portal request start remains atomic WO + booking creation, but marks the
-- booking as customer-originated so the scheduler uses public capacity only.
create or replace function public.portal_request_start_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_visit_type text,
  p_notes text,
  p_source_row_id text default null
) returns table (
  work_order_id uuid,
  booking_id uuid,
  deduped boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_work_order_id uuid;
  v_booking_id uuid;
  v_existing_work_order_id uuid;
  v_existing_booking_id uuid;
  v_normalized_visit_type text;
begin
  v_normalized_visit_type := case
    when p_visit_type = 'waiter' then 'waiter'
    when p_visit_type = 'drop_off' then 'drop_off'
    else null
  end;
  if p_shop_id is null or p_customer_id is null then
    raise exception 'Missing shop/customer for portal request start';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Invalid booking window';
  end if;
  if v_normalized_visit_type is null then
    raise exception 'visitType must be waiter or drop_off';
  end if;

  if p_source_row_id is not null and length(trim(p_source_row_id)) > 0 then
    select w.id into v_existing_work_order_id
    from public.work_orders w
    where w.shop_id = p_shop_id
      and w.customer_id = p_customer_id
      and w.source_row_id = p_source_row_id
    order by w.created_at desc nulls last
    limit 1;
    if v_existing_work_order_id is not null then
      select b.id into v_existing_booking_id
      from public.bookings b
      where b.work_order_id = v_existing_work_order_id
      order by b.created_at desc
      limit 1;
      if v_existing_booking_id is not null then
        return query select v_existing_work_order_id, v_existing_booking_id, true;
        return;
      end if;
    end if;
  end if;

  insert into public.work_orders(
    shop_id, customer_id, vehicle_id, status, approval_state, is_waiter,
    scheduled_at, expected_completion_at, notes, source_row_id
  ) values (
    p_shop_id, p_customer_id, p_vehicle_id, 'awaiting_approval', 'pending',
    (v_normalized_visit_type = 'waiter'), p_starts_at, p_ends_at,
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_source_row_id, '')), '')
  ) returning id into v_work_order_id;

  insert into public.bookings(
    shop_id, customer_id, vehicle_id, work_order_id,
    starts_at, ends_at, status, notes, lifecycle_metadata
  ) values (
    p_shop_id, p_customer_id, p_vehicle_id, v_work_order_id,
    p_starts_at, p_ends_at, 'pending',
    nullif(trim(coalesce(p_notes, '')), ''),
    jsonb_build_object('created_actor_mode','customer','service_mode','shop')
  ) returning id into v_booking_id;

  return query select v_work_order_id, v_booking_id, false;
exception
  when unique_violation then
    if p_source_row_id is not null and length(trim(p_source_row_id)) > 0 then
      select w.id into v_existing_work_order_id
      from public.work_orders w
      where w.shop_id = p_shop_id
        and w.customer_id = p_customer_id
        and w.source_row_id = p_source_row_id
      order by w.created_at desc nulls last
      limit 1;
      if v_existing_work_order_id is not null then
        select b.id into v_existing_booking_id
        from public.bookings b
        where b.work_order_id = v_existing_work_order_id
        order by b.created_at desc
        limit 1;
        if v_existing_booking_id is not null then
          return query select v_existing_work_order_id, v_existing_booking_id, true;
          return;
        end if;
      end if;
    end if;
    raise;
  when exclusion_violation then
    raise exception 'This time overlaps an existing scheduling resource'
      using errcode = 'P0001';
end;
$$;

revoke all on function public.portal_request_start_atomic(
  uuid,uuid,uuid,timestamptz,timestamptz,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.portal_request_start_atomic(
  uuid,uuid,uuid,timestamptz,timestamptz,text,text,text
) to service_role;

-- Shop Assistant keeps its confirmation/action transaction, while the booking
-- mutation delegates to the scheduler inside that same transaction.
create or replace function public.shop_assistant_reschedule_booking_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_booking_id uuid,
  p_actor_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_booking public.bookings%rowtype;
  v_expected text;
  v_result jsonb;
  v_scheduler jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'reschedule_booking'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner','admin','manager','advisor','lead_hand','leadhand','foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot reschedule appointments.';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Appointment not found for this shop.';
  end if;

  v_expected := v_action.target_versions ->> ('booking:' || p_booking_id::text);
  if v_expected is not null
     and v_booking.updated_at is distinct from v_expected::timestamptz then
    raise exception using errcode = 'P0001', message = 'The appointment changed after the confirmation preview.';
  end if;

  v_scheduler := public.scheduler_apply_booking_command_atomic(
    'reschedule',
    p_booking_id,
    null,
    null,
    null,
    p_starts_at,
    coalesce(p_ends_at, v_booking.ends_at),
    case
      when nullif(trim(coalesce(p_note, '')), '') is null then v_booking.notes
      when nullif(trim(coalesce(v_booking.notes, '')), '') is null then trim(p_note)
      else v_booking.notes || E'\n' || trim(p_note)
    end,
    p_actor_user_id,
    'staff',
    p_shop_id::text || ':shop-assistant:' || p_action_id::text,
    null,
    now(),
    coalesce(nullif(v_booking.lifecycle_metadata ->> 'service_mode', ''), 'shop'),
    null
  );

  select * into v_booking from public.bookings where id = p_booking_id;
  v_result := jsonb_build_object(
    'ok', true,
    'booking', jsonb_build_object(
      'id', v_booking.id,
      'startsAt', v_booking.starts_at,
      'endsAt', v_booking.ends_at,
      'status', v_booking.status,
      'customerId', v_booking.customer_id,
      'vehicleId', v_booking.vehicle_id,
      'workOrderId', v_booking.work_order_id
    ),
    'summary', 'Appointment ' || left(v_booking.id::text, 8)
      || ' was moved to ' || v_booking.starts_at::text || '.',
    'href', '/dashboard/appointments',
    'scheduler', v_scheduler -> 'scheduler'
  );

  update public.shop_assistant_actions
  set status = 'succeeded',
      result = v_result,
      error = null,
      execution_finished_at = now(),
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'shop_assistant_booking_rescheduled', p_actor_user_id, now(),
    'booking', p_booking_id,
    jsonb_build_object('shop_id', p_shop_id, 'action_id', p_action_id)
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Availability + resource/event read contracts.
-- ---------------------------------------------------------------------------

create or replace function public.scheduler_availability_snapshot(
  p_shop_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_mode text default 'shop',
  p_public_only boolean default false,
  p_resource_id uuid default null
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
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
          and (not p_public_only or nr.public_bookable = true)
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
        'name', u.name,
        'code', u.code,
        'resourceType', u.resource_type,
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
  );
$$;

create or replace function public.scheduler_list_resources(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not exists (
    select 1 from public.profiles p
    where (p.id = auth.uid() or p.user_id = auth.uid())
      and p.shop_id = p_shop_id
  ) then
    raise exception using errcode = '42501', message = 'Scheduler shop access denied.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'name', r.name,
      'resourceType', r.resource_type,
      'mode', r.mode,
      'profileId', r.profile_id,
      'serviceVehicleId', r.service_vehicle_id,
      'stockLocationId', r.stock_location_id,
      'publicBookable', r.public_bookable,
      'isFallback', r.is_fallback,
      'active', r.active,
      'sortOrder', r.sort_order
    ) order by r.sort_order, r.name)
    from public.scheduling_resources r
    where r.shop_id = p_shop_id
  ), '[]'::jsonb);
end;
$$;

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

  return jsonb_build_object('ok', true, 'resource', to_jsonb(v_resource));
end;
$$;

create or replace function public.scheduler_list_events(
  p_shop_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mode text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not exists (
    select 1 from public.profiles p
    where (p.id = auth.uid() or p.user_id = auth.uid())
      and p.shop_id = p_shop_id
  ) then
    raise exception using errcode = '42501', message = 'Scheduler shop access denied.';
  end if;

  return coalesce((
    with canonical as (
      select
        e.id,
        e.booking_id,
        e.work_order_id,
        e.service_visit_id,
        e.source_kind,
        e.mode,
        e.title,
        e.starts_at,
        e.ends_at,
        e.status,
        r.resource_id,
        sr.name as resource_name,
        sr.resource_type
      from public.scheduling_events e
      left join public.scheduling_reservations r
        on r.event_id = e.id and r.reservation_role = 'primary'
      left join public.scheduling_resources sr on sr.id = r.resource_id
      where e.shop_id = p_shop_id
        and e.starts_at < p_ends_at
        and e.ends_at > p_starts_at
        and (p_mode is null or e.mode = p_mode)
    ), planned_work as (
      select
        wo.id,
        null::uuid as booking_id,
        wo.id as work_order_id,
        null::uuid as service_visit_id,
        'work_order'::text as source_kind,
        'shop'::text as mode,
        coalesce(wo.custom_id, 'Work order') as title,
        wo.scheduled_at as starts_at,
        coalesce(wo.expected_completion_at, wo.scheduled_at + interval '1 hour') as ends_at,
        case when wo.status in ('completed','invoiced','closed') then 'completed' else 'active' end as status,
        null::uuid as resource_id,
        null::text as resource_name,
        null::text as resource_type
      from public.work_orders wo
      where wo.shop_id = p_shop_id
        and wo.scheduled_at is not null
        and wo.scheduled_at < p_ends_at
        and coalesce(wo.expected_completion_at, wo.scheduled_at + interval '1 hour') > p_starts_at
        and (p_mode is null or p_mode = 'shop')
        and not exists (
          select 1 from public.scheduling_events e
          where e.work_order_id = wo.id
        )
    ), all_events as (
      select * from canonical
      union all
      select * from planned_work
    )
    select jsonb_agg(jsonb_build_object(
      'id', x.id,
      'bookingId', x.booking_id,
      'workOrderId', x.work_order_id,
      'serviceVisitId', x.service_visit_id,
      'sourceKind', x.source_kind,
      'mode', x.mode,
      'title', x.title,
      'startsAt', x.starts_at,
      'endsAt', x.ends_at,
      'status', x.status,
      'resourceId', x.resource_id,
      'resourceName', x.resource_name,
      'resourceType', x.resource_type
    ) order by x.starts_at)
    from all_events x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.scheduler_availability_snapshot(
  uuid,timestamptz,timestamptz,text,boolean,uuid
) from public, anon;
revoke all on function public.scheduler_list_resources(uuid) from public, anon;
revoke all on function public.scheduler_upsert_resource(
  uuid,uuid,uuid,text,text,text,text,boolean,boolean,integer
) from public, anon;
revoke all on function public.scheduler_list_events(
  uuid,timestamptz,timestamptz,text
) from public, anon;

grant execute on function public.scheduler_availability_snapshot(
  uuid,timestamptz,timestamptz,text,boolean,uuid
) to authenticated, service_role;
grant execute on function public.scheduler_list_resources(uuid)
  to authenticated, service_role;
grant execute on function public.scheduler_upsert_resource(
  uuid,uuid,uuid,text,text,text,text,boolean,boolean,integer
) to authenticated, service_role;
grant execute on function public.scheduler_list_events(
  uuid,timestamptz,timestamptz,text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Service-vehicle and technician resource synchronization.
-- ---------------------------------------------------------------------------

create or replace function public.sync_service_vehicle_scheduling_resource()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.scheduling_resources(
    shop_id, code, name, resource_type, mode,
    service_vehicle_id, stock_location_id,
    public_bookable, is_fallback, active, sort_order
  ) values (
    new.shop_id,
    'service-vehicle:' || new.id::text,
    new.name,
    'service_vehicle',
    'mobile',
    new.id,
    new.stock_location_id,
    true,
    false,
    new.active,
    100
  )
  on conflict do nothing;

  update public.scheduling_resources
  set name = new.name,
      stock_location_id = new.stock_location_id,
      active = new.active,
      updated_at = now()
  where shop_id = new.shop_id
    and service_vehicle_id = new.id
    and resource_type = 'service_vehicle';
  return new;
end;
$$;

create or replace function public.sync_profile_scheduling_resource()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.shop_id is not null
     and lower(coalesce(new.role, '')) in ('mechanic','technician','tech') then
    insert into public.scheduling_resources(
      shop_id, code, name, resource_type, mode, profile_id,
      public_bookable, is_fallback, active, sort_order
    ) values (
      new.shop_id,
      'tech:' || new.id::text,
      coalesce(nullif(trim(new.full_name), ''), 'Technician'),
      'technician',
      'both',
      new.id,
      false,
      false,
      true,
      200
    ) on conflict do nothing;

    update public.scheduling_resources
    set name = coalesce(nullif(trim(new.full_name), ''), 'Technician'),
        active = true,
        updated_at = now()
    where shop_id = new.shop_id
      and profile_id = new.id
      and resource_type = 'technician';
  elsif old.shop_id is not null then
    update public.scheduling_resources
    set active = false, updated_at = now()
    where profile_id = old.id and resource_type = 'technician';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_service_vehicle_scheduling_resource()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_profile_scheduling_resource()
  from public, anon, authenticated, service_role;

drop trigger if exists service_vehicles_sync_scheduling_resource
  on public.service_vehicles;
create trigger service_vehicles_sync_scheduling_resource
after insert or update of name, stock_location_id, active
on public.service_vehicles
for each row execute function public.sync_service_vehicle_scheduling_resource();

drop trigger if exists profiles_sync_scheduling_resource on public.profiles;
create trigger profiles_sync_scheduling_resource
after insert or update of shop_id, role, full_name
on public.profiles
for each row execute function public.sync_profile_scheduling_resource();

-- ---------------------------------------------------------------------------
-- RLS. Scheduling tables are command-owned: authenticated users can read their
-- own shop but writes occur through the audited RPC layer.
-- ---------------------------------------------------------------------------

alter table public.service_vehicles enable row level security;
alter table public.scheduling_resources enable row level security;
alter table public.scheduling_events enable row level security;
alter table public.scheduling_reservations enable row level security;
alter table public.scheduler_operation_keys enable row level security;

revoke all on table public.service_vehicles from public, anon;
revoke all on table public.scheduling_resources from public, anon;
revoke all on table public.scheduling_events from public, anon;
revoke all on table public.scheduling_reservations from public, anon;
revoke all on table public.scheduler_operation_keys from public, anon, authenticated;

grant select, insert, update, delete on public.service_vehicles to authenticated;
grant select on public.scheduling_resources to authenticated;
grant select on public.scheduling_events to authenticated;
grant select on public.scheduling_reservations to authenticated;
grant all on public.service_vehicles to service_role;
grant all on public.scheduling_resources to service_role;
grant all on public.scheduling_events to service_role;
grant all on public.scheduling_reservations to service_role;
grant all on public.scheduler_operation_keys to service_role;

drop policy if exists service_vehicles_shop_select on public.service_vehicles;
create policy service_vehicles_shop_select
on public.service_vehicles for select to authenticated
using (public.scheduler_same_shop(service_vehicles.shop_id));

drop policy if exists service_vehicles_shop_write on public.service_vehicles;
create policy service_vehicles_shop_write
on public.service_vehicles for all to authenticated
using (public.scheduler_can_manage(service_vehicles.shop_id))
with check (public.scheduler_can_manage(service_vehicles.shop_id));

drop policy if exists scheduling_resources_shop_select on public.scheduling_resources;
create policy scheduling_resources_shop_select
on public.scheduling_resources for select to authenticated
using (public.scheduler_same_shop(scheduling_resources.shop_id));

drop policy if exists scheduling_events_shop_select on public.scheduling_events;
create policy scheduling_events_shop_select
on public.scheduling_events for select to authenticated
using (public.scheduler_same_shop(scheduling_events.shop_id));

drop policy if exists scheduling_reservations_shop_select on public.scheduling_reservations;
create policy scheduling_reservations_shop_select
on public.scheduling_reservations for select to authenticated
using (public.scheduler_same_shop(scheduling_reservations.shop_id));

-- Replace the foundation visit policies because visits may now be booking-only.
drop policy if exists service_visits_shop_member_insert on public.service_visits;
drop policy if exists service_visits_shop_member_update on public.service_visits;
drop policy if exists service_visits_shop_manager_delete on public.service_visits;
drop policy if exists service_visits_shop_write on public.service_visits;
create policy service_visits_shop_write
on public.service_visits for all to authenticated
using (public.scheduler_can_manage(service_visits.shop_id))
with check (
  public.scheduler_can_manage(service_visits.shop_id)
  and (
    service_visits.work_order_id is null
    or exists (
      select 1 from public.work_orders wo
      where wo.id = service_visits.work_order_id
        and wo.shop_id = service_visits.shop_id
    )
  )
  and (
    service_visits.booking_id is null
    or exists (
      select 1 from public.bookings b
      where b.id = service_visits.booking_id
        and b.shop_id = service_visits.shop_id
    )
  )
  and (
    service_visits.service_address_id is null
    or exists (
      select 1 from public.service_addresses sa
      where sa.id = service_visits.service_address_id
        and sa.shop_id = service_visits.shop_id
    )
  )
  and (
    service_visits.service_vehicle_id is null
    or exists (
      select 1 from public.service_vehicles sv
      where sv.id = service_visits.service_vehicle_id
        and sv.shop_id = service_visits.shop_id
    )
  )
);

comment on table public.scheduling_resources is
  'Universal scheduling resources: compatibility capacity, bays, technicians, and service vehicles.';
comment on table public.scheduling_events is
  'Canonical schedule event projection; source domain semantics remain in booking/work-order/service-visit records.';
comment on table public.scheduling_reservations is
  'Resource capacity claims. Active reservations cannot overlap on the same resource.';
comment on table public.service_vehicles is
  'Mobile service vehicles; stock_location_id optionally links a truck to canonical inventory.';
comment on column public.service_visits.assigned_user_id is
  'Dispatch owner for the physical visit only; repair labor ownership remains on work-order lines.';

notify pgrst, 'reload schema';

commit;
