begin;

-- New attendance writes must always have sane boundaries.
alter table public.tech_shifts
  drop constraint if exists tech_shifts_valid_time_range;
alter table public.tech_shifts
  add constraint tech_shifts_valid_time_range
  check (end_time is null or end_time >= start_time) not valid;

create index if not exists idx_tech_shifts_shop_user_window
  on public.tech_shifts (shop_id, user_id, start_time desc, end_time);

create index if not exists idx_labor_segments_shop_tech_window
  on public.work_order_line_labor_segments (shop_id, technician_id, started_at desc, ended_at);

-- Serialize shift starts per shop/employee. This prevents two devices or an offline
-- replay from opening competing active shifts without rewriting existing evidence.
create or replace function public.enforce_single_active_tech_shift()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' and new.end_time is null then
    perform pg_advisory_xact_lock(hashtextextended(new.shop_id::text || ':' || new.user_id::text, 0));
    if exists (
      select 1
      from public.tech_shifts existing
      where existing.shop_id = new.shop_id
        and existing.user_id = new.user_id
        and existing.status = 'active'
        and existing.end_time is null
        and existing.id is distinct from new.id
    ) then
      raise exception 'An active shift already exists for this employee'
        using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_active_tech_shift_trigger on public.tech_shifts;
create trigger enforce_single_active_tech_shift_trigger
before insert or update of status, end_time, shop_id, user_id
on public.tech_shifts
for each row execute function public.enforce_single_active_tech_shift();

revoke all on function public.enforce_single_active_tech_shift() from public, anon;
grant execute on function public.enforce_single_active_tech_shift() to authenticated, service_role;

commit;
