begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- One appointment represents one physical visit. Work orders may still have
-- many visits; those visits can be backed by separate bookings or by the work
-- order alone.
create unique index if not exists service_visits_booking_unique
  on public.service_visits(booking_id)
  where booking_id is not null;

create or replace function public.sync_mobile_booking_to_dispatch_visit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_visit public.service_visits%rowtype;
  v_actor_profile_id uuid;
  v_times_changed boolean := false;
  v_status_changed boolean := false;
begin
  if new.shop_id is null then return new; end if;

  v_mode := lower(coalesce(new.lifecycle_metadata ->> 'service_mode', ''));
  if v_mode not in ('shop','mobile') then
    select case when s.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end
      into v_mode
    from public.shops s
    where s.id = new.shop_id;
  end if;
  if coalesce(v_mode, 'shop') <> 'mobile' then return new; end if;

  -- A dispatch-owned reschedule already updates the Service Visit explicitly in
  -- the same transaction. Skip this projection for that exact booking update so
  -- the visit version is incremented once rather than twice.
  if tg_op = 'UPDATE'
     and coalesce(new.lifecycle_metadata ->> 'dispatch_reschedule_operation_key', '')
       is distinct from coalesce(old.lifecycle_metadata ->> 'dispatch_reschedule_operation_key', '') then
    return new;
  end if;

  select * into v_visit
  from public.service_visits sv
  where sv.booking_id = new.id
  order by sv.created_at
  limit 1
  for update;

  if not found then
    if lower(coalesce(new.status, 'pending')) in ('cancelled','completed') then
      return new;
    end if;

    select p.id into v_actor_profile_id
    from public.profiles p
    where p.shop_id = new.shop_id
      and (
        p.id = new.created_by
        or p.user_id = new.created_by
        or p.id = auth.uid()
        or p.user_id = auth.uid()
      )
    order by case
      when p.id = new.created_by then 0
      when p.user_id = new.created_by then 1
      when p.id = auth.uid() then 2
      else 3
    end
    limit 1;

    insert into public.service_visits(
      shop_id, booking_id, work_order_id, mode, status,
      scheduled_start, scheduled_end, created_by,
      last_status_at, last_status_by
    ) values (
      new.shop_id, new.id, new.work_order_id, 'mobile', 'scheduled',
      new.starts_at, new.ends_at, v_actor_profile_id,
      now(), v_actor_profile_id
    )
    returning * into v_visit;

    insert into public.service_visit_events(
      shop_id, service_visit_id, event_type, from_status, to_status,
      actor_user_id, assigned_user_id, service_vehicle_id, metadata
    ) values (
      new.shop_id, v_visit.id, 'created', null, 'scheduled',
      v_actor_profile_id, null, null,
      jsonb_build_object('source', 'mobile_booking_projection', 'booking_id', new.id)
    );
    return new;
  end if;

  -- Once dispatch has released the visit, physical execution owns its timeline.
  -- Before that point, staff/customer booking reschedules remain synchronized.
  if v_visit.status = 'scheduled' then
    v_times_changed :=
      v_visit.scheduled_start is distinct from new.starts_at
      or v_visit.scheduled_end is distinct from new.ends_at;

    if lower(coalesce(new.status, 'pending')) = 'cancelled' then
      update public.service_visits
      set status = 'cancelled',
          cancelled_at = coalesce(cancelled_at, now()),
          last_status_at = now(),
          version = version + 1,
          updated_at = now()
      where id = v_visit.id
      returning * into v_visit;
      v_status_changed := true;
    else
      update public.service_visits
      set work_order_id = coalesce(work_order_id, new.work_order_id),
          scheduled_start = new.starts_at,
          scheduled_end = new.ends_at,
          version = case when v_times_changed then version + 1 else version end,
          updated_at = case when v_times_changed then now() else updated_at end
      where id = v_visit.id
      returning * into v_visit;
    end if;

    if v_times_changed and not v_status_changed then
      insert into public.service_visit_events(
        shop_id, service_visit_id, event_type, from_status, to_status,
        actor_user_id, assigned_user_id, service_vehicle_id, metadata
      ) values (
        new.shop_id, v_visit.id, 'rescheduled', 'scheduled', 'scheduled',
        null, v_visit.assigned_user_id, v_visit.service_vehicle_id,
        jsonb_build_object(
          'source', 'mobile_booking_projection',
          'booking_id', new.id,
          'from_starts_at', old.starts_at,
          'from_ends_at', old.ends_at,
          'to_starts_at', new.starts_at,
          'to_ends_at', new.ends_at
        )
      );
    elsif v_status_changed then
      insert into public.service_visit_events(
        shop_id, service_visit_id, event_type, from_status, to_status,
        actor_user_id, assigned_user_id, service_vehicle_id, metadata
      ) values (
        new.shop_id, v_visit.id, 'transitioned', 'scheduled', 'cancelled',
        null, v_visit.assigned_user_id, v_visit.service_vehicle_id,
        jsonb_build_object('source', 'mobile_booking_projection', 'booking_id', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_mobile_booking_to_dispatch_visit()
  from public, anon, authenticated, service_role;

drop trigger if exists bookings_sync_mobile_dispatch_visit on public.bookings;
create trigger bookings_sync_mobile_dispatch_visit
after insert or update of starts_at, ends_at, work_order_id, status, lifecycle_metadata
on public.bookings
for each row execute function public.sync_mobile_booking_to_dispatch_visit();

-- Bring already-active mobile bookings into the same dispatch contract without
-- changing their booking/work-order identity.
with inserted as (
  insert into public.service_visits(
    shop_id, booking_id, work_order_id, mode, status,
    scheduled_start, scheduled_end, created_by,
    last_status_at, last_status_by
  )
  select
    b.shop_id,
    b.id,
    b.work_order_id,
    'mobile',
    'scheduled',
    b.starts_at,
    b.ends_at,
    null,
    now(),
    null
  from public.bookings b
  join public.shops s on s.id = b.shop_id
  where lower(coalesce(b.status, 'pending')) not in ('cancelled','completed')
    and (
      lower(coalesce(b.lifecycle_metadata ->> 'service_mode', '')) = 'mobile'
      or (
        nullif(b.lifecycle_metadata ->> 'service_mode', '') is null
        and s.location_type = 'mobile_service_branch'
      )
    )
    and not exists (
      select 1 from public.service_visits sv where sv.booking_id = b.id
    )
  on conflict do nothing
  returning id, shop_id, booking_id
)
insert into public.service_visit_events(
  shop_id, service_visit_id, event_type, from_status, to_status, metadata
)
select
  i.shop_id,
  i.id,
  'created',
  null,
  'scheduled',
  jsonb_build_object('source', 'mobile_booking_backfill', 'booking_id', i.booking_id)
from inserted i;

notify pgrst, 'reload schema';

commit;
