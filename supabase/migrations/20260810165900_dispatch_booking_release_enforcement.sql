begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';
set local check_function_bodies = false;

-- Reassert the guard with explicit state variables and enforce it both before
-- and after booking mutations. The durable release signal is dispatched_at,
-- not only the current status label. Work-order identity is protected as soon
-- as the visit has one. The AFTER trigger is intentional: if any legacy
-- booking/scheduler trigger runs first, raising here still rolls the entire
-- statement and all trigger side effects back atomically.
create or replace function public.guard_booking_after_dispatch_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit_id uuid;
  v_visit_status text;
  v_visit_work_order_id uuid;
  v_dispatched_at timestamptz;
  v_dispatch_reschedule_visit text;
  v_time_changed boolean;
  v_status_changed boolean;
begin
  select sv.id, sv.status, sv.work_order_id, sv.dispatched_at
    into v_visit_id, v_visit_status, v_visit_work_order_id, v_dispatched_at
  from public.service_visits sv
  where sv.booking_id = old.id
  limit 1;

  if v_visit_id is null then
    return new;
  end if;

  if new.work_order_id is distinct from old.work_order_id
     and v_visit_work_order_id is not null
     and new.work_order_id is distinct from v_visit_work_order_id then
    raise exception using
      errcode = 'P0001',
      message = 'The appointment work order cannot replace the work order already linked to this service visit.';
  end if;

  if v_dispatched_at is null then
    return new;
  end if;

  v_time_changed :=
    new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at;
  v_status_changed := new.status is distinct from old.status;
  v_dispatch_reschedule_visit := current_setting(
    'profixiq.dispatch_reschedule_visit_id', true
  );

  if v_time_changed
     and not (
       v_visit_status = 'dispatched'
       and v_dispatch_reschedule_visit = v_visit_id::text
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'This appointment is already under Dispatch control and cannot be rescheduled through the booking flow.';
  end if;

  if v_status_changed
     and not (
       (v_visit_status = 'completed' and lower(coalesce(new.status, '')) = 'completed')
       or (v_visit_status = 'cancelled' and lower(coalesce(new.status, '')) = 'cancelled')
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'This appointment is already under Dispatch control and cannot change lifecycle through the booking flow.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_booking_after_dispatch_release()
  from public, anon, authenticated, service_role;

drop trigger if exists bookings_guard_after_dispatch_release on public.bookings;
create trigger bookings_guard_after_dispatch_release
before update of starts_at, ends_at, status, work_order_id
on public.bookings
for each row execute function public.guard_booking_after_dispatch_release();

drop trigger if exists bookings_zzzz_enforce_after_dispatch_release on public.bookings;
create trigger bookings_zzzz_enforce_after_dispatch_release
after update of starts_at, ends_at, status, work_order_id
on public.bookings
for each row execute function public.guard_booking_after_dispatch_release();

notify pgrst, 'reload schema';

commit;
