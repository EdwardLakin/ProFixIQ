create or replace function public.finalize_shift_from_end_punch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type::text = 'end_shift' then
    update public.tech_shifts
    set status = 'completed',
        end_time = coalesce(end_time, new.timestamp)
    where id = new.shift_id
      and (status <> 'completed' or end_time is null);
  end if;
  return new;
end;
$$;

drop trigger if exists punch_events_finalize_shift on public.punch_events;
create trigger punch_events_finalize_shift
after insert on public.punch_events
for each row
when (new.event_type::text = 'end_shift')
execute function public.finalize_shift_from_end_punch();

revoke all on function public.finalize_shift_from_end_punch() from public, anon;
grant execute on function public.finalize_shift_from_end_punch() to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'punch_events_finalize_shift'
      and tgrelid = 'public.punch_events'::regclass
      and not tgisinternal
  ) then
    raise exception 'punch_events_finalize_shift trigger was not created';
  end if;
end;
$$;
