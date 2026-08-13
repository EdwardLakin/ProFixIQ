-- Technician CoPilot V2 phase 2: service-only command transport over the
-- existing AI action event relation. CoPilot command rows are hidden from
-- normal shop SELECT access and are removed by the API after consumption.

begin;

create or replace function copilot.process_ai_action_command()
returns trigger
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_auth_user_id uuid;
  v_profile_id uuid;
  v_profile_shop_id uuid;
  v_action text;
  v_result jsonb;
begin
  v_auth_user_id := (new.payload ->> 'authUserId')::uuid;
  v_profile_id := copilot.technician_profile_id(v_auth_user_id);
  select p.shop_id into v_profile_shop_id from public.profiles p where p.id=v_profile_id;

  if new.shop_id <> v_profile_shop_id or new.actor_id is distinct from v_profile_id then
    raise exception 'copilot_command_identity_mismatch' using errcode='42501';
  end if;

  v_action := new.payload ->> 'action';
  begin
    case v_action
      when 'session.read' then
        v_result := copilot.technician_session_read_internal(
          v_auth_user_id,
          nullif(new.payload ->> 'sessionId','')::uuid
        );
      when 'session.start' then
        v_result := copilot.technician_session_start_internal(
          v_auth_user_id,
          (new.payload ->> 'workOrderId')::uuid,
          nullif(new.payload ->> 'workOrderLineId','')::uuid,
          coalesce(nullif(new.payload ->> 'mode',''),'shop'),
          (new.payload ->> 'operationId')::uuid
        );
      when 'event.append' then
        v_result := copilot.technician_event_append_internal(
          v_auth_user_id,
          (new.payload ->> 'sessionId')::uuid,
          new.payload ->> 'eventType',
          coalesce(nullif(new.payload ->> 'origin',''),'ui'),
          (new.payload ->> 'operationId')::uuid,
          coalesce(new.payload -> 'details','{}'::jsonb),
          coalesce(nullif(new.payload ->> 'occurredAt','')::timestamptz,now())
        );
      else
        raise exception 'copilot_command_not_allowed' using errcode='22023';
    end case;

    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
      'copilotCommandResult',v_result,
      'copilotCommandError',null
    );
  exception when others then
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
      'copilotCommandResult',null,
      'copilotCommandError',jsonb_build_object('code',sqlstate,'message',sqlerrm)
    );
  end;

  return new;
end;
$$;

drop trigger if exists technician_copilot_ai_action_command on public.ai_action_events;
create trigger technician_copilot_ai_action_command
before insert on public.ai_action_events
for each row
when (new.source = 'technician_copilot_command')
execute function copilot.process_ai_action_command();

drop policy if exists ai_action_events_shop_select on public.ai_action_events;
create policy ai_action_events_shop_select on public.ai_action_events
for select to authenticated
using (
  source <> 'technician_copilot_command'
  and exists (
    select 1 from public.profiles p
    where (p.id = auth.uid() or p.user_id = auth.uid())
      and p.shop_id = ai_action_events.shop_id
  )
);

commit;
