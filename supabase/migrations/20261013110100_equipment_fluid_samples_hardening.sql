-- Harden fluid sample recording without changing the public RPC contract.
--
-- A sample tied to a component must serialize with component moves so the
-- placement checked by equipment_fluid_samples_guard cannot become stale
-- before both transactions commit. The component move RPC already locks the
-- component row FOR UPDATE; this earlier trigger takes the same row lock.
--
-- Also reject a future calendar day at the database boundary. Date-only UI
-- values are stored at noon UTC, so compare the calendar date rather than the
-- timestamp to avoid rejecting a valid sample entered earlier the same day.

create or replace function public.equipment_fluid_samples_lock_component()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sampled_at::date > now()::date then
    raise exception 'A sample cannot be dated in the future'
      using errcode = '22023';
  end if;

  if new.component_id is not null then
    perform 1
    from public.equipment_components c
    where c.id = new.component_id
    for update;
  end if;

  return new;
end;
$$;

revoke all on function public.equipment_fluid_samples_lock_component()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_fluid_samples_00_lock_component on public.equipment_fluid_samples;
create trigger trg_equipment_fluid_samples_00_lock_component
before insert on public.equipment_fluid_samples
for each row execute function public.equipment_fluid_samples_lock_component();
