begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Once Dispatch releases a visit, old booking mutations may no longer move or
-- cancel the physical job underneath the technician. Canonical Dispatch may
-- still reschedule a dispatched (not yet en-route) visit through a transaction-
-- local proof marker. Terminal visit outcomes are mirrored back to bookings.
create or replace function public.guard_booking_after_dispatch_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_dispatch_reschedule_visit text;
  v_time_changed boolean;
  v_status_changed boolean;
begin
  select * into v_visit
  from public.service_visits sv
  where sv.booking_id = old.id
  order by sv.created_at
  limit 1;

  if not found or v_visit.status = 'scheduled' then
    return new;
  end if;

  v_time_changed :=
    new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at;
  v_status_changed := new.status is distinct from old.status;
  v_dispatch_reschedule_visit := current_setting(
    'profixiq.dispatch_reschedule_visit_id', true
  );

  if v_time_changed then
    if not (
      v_visit.status = 'dispatched'
      and v_dispatch_reschedule_visit = v_visit.id::text
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'This appointment is already under Dispatch control and cannot be rescheduled through the booking flow.';
    end if;
  end if;

  if v_status_changed then
    if not (
      (v_visit.status = 'completed' and lower(coalesce(new.status, '')) = 'completed')
      or (v_visit.status = 'cancelled' and lower(coalesce(new.status, '')) = 'cancelled')
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'This appointment is already under Dispatch control and cannot change lifecycle through the booking flow.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_booking_after_dispatch_release()
  from public, anon, authenticated, service_role;

drop trigger if exists bookings_guard_after_dispatch_release on public.bookings;
create trigger bookings_guard_after_dispatch_release
before update of starts_at, ends_at, status
on public.bookings
for each row execute function public.guard_booking_after_dispatch_release();

create or replace function public.sync_dispatch_terminal_to_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.booking_id is null
     or new.status not in ('completed','cancelled')
     or new.status is not distinct from old.status then
    return new;
  end if;

  update public.bookings
  set status = new.status,
      lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'dispatch_terminal_visit_id', new.id,
          'dispatch_terminal_status', new.status,
          'dispatch_terminal_at', coalesce(new.completed_at, new.cancelled_at, now())
        ),
      updated_at = now()
  where id = new.booking_id
    and shop_id = new.shop_id
    and status is distinct from new.status;

  return new;
end;
$$;

revoke all on function public.sync_dispatch_terminal_to_booking()
  from public, anon, authenticated, service_role;

drop trigger if exists service_visits_sync_dispatch_terminal_booking
  on public.service_visits;
create trigger service_visits_sync_dispatch_terminal_booking
after update of status
on public.service_visits
for each row execute function public.sync_dispatch_terminal_to_booking();

-- Replace the reschedule command only to add an internal transaction proof and
-- to fail explicitly once travel begins. All scheduling/resource behavior stays
-- delegated to the existing Universal Scheduler + Dispatch helpers.
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

  select result into v_existing
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = 'dispatch_visit_reschedule'
    and k.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_visit
  from public.service_visits
  where id = p_visit_id and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Service visit not found.';
  end if;
  if v_visit.status not in ('scheduled','dispatched') then
    raise exception using
      errcode = 'P0001',
      message = 'A service visit cannot be rescheduled after travel has started.';
  end if;
  if p_expected_version is not null and v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Service visit changed since it was loaded.';
  end if;

  v_old_start := v_visit.scheduled_start;
  v_old_end := v_visit.scheduled_end;

  if v_visit.booking_id is not null then
    perform set_config(
      'profixiq.dispatch_reschedule_visit_id',
      v_visit.id::text,
      true
    );

    update public.bookings
    set starts_at = p_starts_at,
        ends_at = p_ends_at,
        updated_at = now(),
        lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
          || jsonb_build_object('dispatch_reschedule_operation_key', p_operation_key)
    where id = v_visit.booking_id and shop_id = p_shop_id;

    perform set_config('profixiq.dispatch_reschedule_visit_id', '', true);
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
    v_visit.id,
    'rescheduled',
    p_actor_user_id,
    v_visit.status,
    v_visit.status,
    jsonb_build_object(
      'operation_key', p_operation_key,
      'from_starts_at', v_old_start,
      'from_ends_at', v_old_end,
      'to_starts_at', p_starts_at,
      'to_ends_at', p_ends_at
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'visit', public.dispatch_visit_snapshot(v_visit.id),
    'idempotent', false
  );

  insert into public.scheduler_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, result
  ) values (
    p_shop_id,
    'dispatch_visit_reschedule',
    p_operation_key,
    public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id),
    v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  return v_result;
end;
$$;

notify pgrst, 'reload schema';

commit;
