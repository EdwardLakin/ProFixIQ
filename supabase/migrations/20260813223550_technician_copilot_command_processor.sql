-- Technician CoPilot V2 phase 2: private command processor.

begin;

create or replace function copilot.process_server_command()
returns trigger
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
begin
  begin
    case new.action
      when 'session.read' then
        new.result := copilot.technician_session_read_internal(
          new.auth_user_id,
          nullif(new.payload ->> 'sessionId', '')::uuid
        );

      when 'session.start' then
        new.result := copilot.technician_session_start_internal(
          new.auth_user_id,
          (new.payload ->> 'workOrderId')::uuid,
          nullif(new.payload ->> 'workOrderLineId', '')::uuid,
          coalesce(nullif(new.payload ->> 'mode', ''), 'shop'),
          (new.payload ->> 'operationId')::uuid
        );

      when 'event.append' then
        new.result := copilot.technician_event_append_internal(
          new.auth_user_id,
          (new.payload ->> 'sessionId')::uuid,
          new.payload ->> 'eventType',
          coalesce(nullif(new.payload ->> 'origin', ''), 'ui'),
          (new.payload ->> 'operationId')::uuid,
          coalesce(new.payload -> 'details', '{}'::jsonb),
          coalesce(nullif(new.payload ->> 'occurredAt', '')::timestamptz, now())
        );
    end case;

    new.error_code := null;
    new.error_message := null;
  exception when others then
    new.result := null;
    new.error_code := sqlstate;
    new.error_message := sqlerrm;
  end;

  new.processed_at := now();
  return new;
end;
$$;

create trigger copilot_server_commands_process_before_insert
before insert on public.copilot_server_commands
for each row execute function copilot.process_server_command();

commit;
