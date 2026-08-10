begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';
set local check_function_bodies = false;

create or replace function public.guard_service_visit_dispatch_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('dispatched','en_route','arrived','working','paused','completed')
     and new.assigned_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'A technician must be assigned before a service visit can be dispatched.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_service_visit_dispatch_assignment()
  from public, anon, authenticated, service_role;

drop trigger if exists service_visits_guard_dispatch_assignment
  on public.service_visits;
create trigger service_visits_guard_dispatch_assignment
before insert or update of status, assigned_user_id
on public.service_visits
for each row execute function public.guard_service_visit_dispatch_assignment();

notify pgrst, 'reload schema';

commit;
