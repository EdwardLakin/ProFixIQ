begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';
set local check_function_bodies = false;

create or replace function public.guard_service_visit_schedule_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.scheduled_start is null) <> (new.scheduled_end is null) then
    raise exception using
      errcode = 'P0001',
      message = 'Service visit start and end must be provided together.';
  end if;

  if new.scheduled_start is not null
     and new.scheduled_end <= new.scheduled_start then
    raise exception using
      errcode = 'P0001',
      message = 'Service visit end must be after its start.';
  end if;

  if tg_op = 'UPDATE'
     and (
       new.scheduled_start is distinct from old.scheduled_start
       or new.scheduled_end is distinct from old.scheduled_end
     )
     and old.status not in ('scheduled','dispatched') then
    raise exception using
      errcode = 'P0001',
      message = 'A service visit cannot be rescheduled after travel has started.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_service_visit_schedule_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists service_visits_guard_schedule_mutation
  on public.service_visits;
create trigger service_visits_guard_schedule_mutation
before insert or update of scheduled_start, scheduled_end
on public.service_visits
for each row execute function public.guard_service_visit_schedule_mutation();

notify pgrst, 'reload schema';

commit;
