-- Technician CoPilot command envelopes are transport-only rows. Consume them
-- inside the INSERT statement so the service role never needs DELETE on the
-- durable AI audit table.

begin;

create or replace function copilot.cleanup_ai_action_command_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
begin
  delete from public.ai_action_events
  where id = new.id
    and source = 'technician_copilot_command';

  return new;
end;
$$;

revoke all on function copilot.cleanup_ai_action_command_after_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists technician_copilot_ai_action_command_cleanup
  on public.ai_action_events;
create trigger technician_copilot_ai_action_command_cleanup
after insert on public.ai_action_events
for each row
when (new.source = 'technician_copilot_command')
execute function copilot.cleanup_ai_action_command_after_insert();

-- Remove any envelopes that accumulated while application cleanup lacked
-- DELETE permission. Durable AI action/audit rows are not touched.
delete from public.ai_action_events
where source = 'technician_copilot_command';

do $technician_copilot_command_cleanup_postcheck$
begin
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.ai_action_events'::regclass
      and t.tgname = 'technician_copilot_ai_action_command_cleanup'
      and not t.tgisinternal
  ) then
    raise exception 'Technician CoPilot command cleanup trigger is missing';
  end if;

  if has_table_privilege('service_role', 'public.ai_action_events', 'DELETE') then
    raise exception 'Technician CoPilot cleanup must not widen service-role DELETE access';
  end if;

  if exists (
    select 1
    from public.ai_action_events
    where source = 'technician_copilot_command'
  ) then
    raise exception 'Technician CoPilot command envelopes remain after cleanup migration';
  end if;
end
$technician_copilot_command_cleanup_postcheck$;

commit;
