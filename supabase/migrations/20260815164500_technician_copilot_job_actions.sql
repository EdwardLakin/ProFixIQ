-- Technician CoPilot first canonical action slice.
-- Execute only assigned-line actions through the existing private command
-- bridge, while delegating the actual writes to the same atomic functions used
-- by technician screens.

begin;

-- Production already has this canonical status-normalization trigger, but the
-- clean replay chain did not recreate it. The job-punch RPC writes the legacy
-- `in_progress` spelling and relies on this trigger to persist canonical
-- `active`. Restore it only where it is missing; production remains unchanged.
do $migration$
begin
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.work_order_lines'::regclass
      and t.tgname = 'trg_normalize_work_order_line_status'
      and not t.tgisinternal
  ) then
    execute $trigger$
      create trigger trg_normalize_work_order_line_status
      before insert or update of status on public.work_order_lines
      for each row
      execute function public.normalize_work_order_line_status()
    $trigger$;
  end if;
end;
$migration$;

create or replace function copilot.technician_job_action_internal(
  p_auth_user_id uuid,
  p_session_id uuid,
  p_work_order_line_id uuid,
  p_action text,
  p_operation_id uuid,
  p_reason text default null,
  p_cause text default null,
  p_correction text default null,
  p_expected_line_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_profile_id uuid;
  v_shop_id uuid;
  v_work_order_id uuid;
  v_line_status text;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_operation_key text;
  v_operation_name text;
  v_existing_actor_id uuid;
  v_existing_line_id uuid;
  v_existing_action_type text;
  v_existing_entity_type text;
  v_existing_result jsonb;
  v_payload jsonb;
  v_result jsonb;
begin
  if p_operation_id is null then
    raise exception 'copilot_operation_id_required' using errcode = '22023';
  end if;
  if v_action not in (
    'job.start',
    'job.hold',
    'job.release_hold',
    'job.story.save'
  ) then
    raise exception 'copilot_job_action_not_allowed' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('copilot:job-action:' || p_operation_id::text, 0)
  );

  v_profile_id := copilot.technician_profile_id(p_auth_user_id);

  -- Match the canonical punch function's lock order (profile, then line) so a
  -- simultaneous screen action and CoPilot action cannot deadlock each other.
  perform 1
  from public.profiles p
  where p.id = v_profile_id
  for update;

  select rs.shop_id, rs.work_order_id, lower(btrim(wol.status::text))
    into v_shop_id, v_work_order_id, v_line_status
  from copilot.repair_sessions rs
  join public.work_order_lines wol
    on wol.id = p_work_order_line_id
   and wol.shop_id = rs.shop_id
   and wol.work_order_id = rs.work_order_id
   and wol.line_type = 'job'
  where rs.id = p_session_id
    and rs.technician_id = v_profile_id
    and rs.status = 'active'
  for update of rs, wol;

  if not found then
    raise exception 'copilot_job_action_session_or_line_not_actionable'
      using errcode = '55000';
  end if;

  -- Lock every current shared assignment before the authorization recheck so
  -- removal cannot race the canonical write. Direct assignment fields are on
  -- the already-locked work_order_lines row.
  perform 1
  from public.work_order_line_technicians wolt
  where wolt.work_order_line_id = p_work_order_line_id
  for update;

  if not copilot.technician_is_assigned(
    p_auth_user_id,
    v_profile_id,
    v_shop_id,
    v_work_order_id,
    p_work_order_line_id
  ) then
    raise exception 'copilot_work_order_assignment_required'
      using errcode = '42501';
  end if;

  v_operation_key := 'technician-copilot:' || p_operation_id::text;

  if v_action = 'job.story.save' then
    if exists (
      select 1
      from public.workforce_operation_keys wok
      where wok.shop_id = v_shop_id
        and wok.operation_key = v_operation_key
    ) then
      raise exception 'copilot_operation_id_conflict' using errcode = '23505';
    end if;

    select
      receipt.actor_user_id,
      receipt.entity_id,
      receipt.action_type,
      receipt.entity_type
      into
        v_existing_actor_id,
        v_existing_line_id,
        v_existing_action_type,
        v_existing_entity_type
    from public.offline_mutation_receipts receipt
    where receipt.shop_id = v_shop_id
      and receipt.operation_key = v_operation_key;

    if found and (
      v_existing_actor_id is distinct from v_profile_id
      or v_existing_line_id is distinct from p_work_order_line_id
      or v_existing_action_type is distinct from 'save_story_draft'
      or v_existing_entity_type is distinct from 'work_order_line'
    ) then
      raise exception 'copilot_operation_id_conflict' using errcode = '23505';
    end if;
  elsif exists (
    select 1
    from public.offline_mutation_receipts receipt
    where receipt.shop_id = v_shop_id
      and receipt.operation_key = v_operation_key
  ) then
    raise exception 'copilot_operation_id_conflict' using errcode = '23505';
  end if;

  if v_action <> 'job.story.save' then
    v_operation_name := case v_action
      when 'job.start' then 'job_punch:start'
      when 'job.hold' then 'job_punch:pause'
      else 'job_punch:resume'
    end;

    if exists (
      select 1
      from public.workforce_operation_keys wok
      where wok.shop_id = v_shop_id
        and wok.operation_key = v_operation_key
        and (
          wok.operation_name is distinct from v_operation_name
          or wok.actor_user_id is distinct from v_profile_id
          or wok.work_order_line_id is distinct from p_work_order_line_id
        )
    ) then
      raise exception 'copilot_operation_id_conflict' using errcode = '23505';
    end if;

    select wok.actor_user_id, wok.work_order_line_id, wok.result
      into v_existing_actor_id, v_existing_line_id, v_existing_result
    from public.workforce_operation_keys wok
    where wok.shop_id = v_shop_id
      and wok.operation_key = v_operation_key
      and wok.operation_name = v_operation_name;

    if found then
      if v_existing_actor_id is distinct from v_profile_id
        or v_existing_line_id is distinct from p_work_order_line_id
      then
        raise exception 'copilot_operation_id_conflict' using errcode = '23505';
      end if;
      return coalesce(v_existing_result, '{}'::jsonb)
        || jsonb_build_object(
          'idempotent', true,
          'copilotAction', v_action,
          'workOrderId', v_work_order_id,
          'workOrderLineId', p_work_order_line_id
        );
    end if;
  end if;

  if v_action = 'job.start' then
    v_result := public.apply_job_punch_transition_atomic(
      p_shop_id => v_shop_id,
      p_work_order_line_id => p_work_order_line_id,
      p_action => 'start',
      p_technician_id => v_profile_id,
      p_actor_user_id => v_profile_id,
      p_operation_key => v_operation_key,
      p_at => now(),
      p_start_source => 'technician_copilot'
    );
  elsif v_action = 'job.hold' then
    if nullif(btrim(p_reason), '') is null then
      raise exception 'copilot_hold_reason_required' using errcode = '22023';
    end if;
    v_result := public.apply_job_punch_transition_atomic(
      p_shop_id => v_shop_id,
      p_work_order_line_id => p_work_order_line_id,
      p_action => 'pause',
      p_technician_id => v_profile_id,
      p_actor_user_id => v_profile_id,
      p_operation_key => v_operation_key,
      p_at => now(),
      p_hold_reason => btrim(p_reason)
    );
  elsif v_action = 'job.release_hold' then
    if v_line_status not in ('on_hold', 'paused', 'waiting_parts') then
      raise exception 'copilot_job_not_on_hold' using errcode = '55000';
    end if;
    v_result := public.apply_job_punch_transition_atomic(
      p_shop_id => v_shop_id,
      p_work_order_line_id => p_work_order_line_id,
      p_action => 'resume',
      p_technician_id => v_profile_id,
      p_actor_user_id => v_profile_id,
      p_operation_key => v_operation_key,
      p_at => now(),
      p_release_to_awaiting => true
    );
  else
    if p_expected_line_updated_at is null then
      raise exception 'copilot_line_version_required' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_cause, '')), '') is null
      and nullif(btrim(coalesce(p_correction, '')), '') is null
    then
      raise exception 'copilot_job_story_required' using errcode = '22023';
    end if;

    v_payload := jsonb_build_object(
      'lineId', p_work_order_line_id,
      'cause', coalesce(p_cause, ''),
      'correction', coalesce(p_correction, ''),
      'baseUpdatedAt', p_expected_line_updated_at,
      'source', 'technician_copilot'
    );
    v_result := public.apply_offline_line_mutation_atomic(
      v_shop_id,
      v_profile_id,
      v_operation_key,
      'save_story_draft',
      p_work_order_line_id,
      v_payload
    );
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'copilotAction', v_action,
    'workOrderId', v_work_order_id,
    'workOrderLineId', p_work_order_line_id
  );
end;
$$;

revoke all on function copilot.technician_job_action_internal(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

comment on function copilot.technician_job_action_internal(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz
) is
  'Private assigned-technician bridge to canonical job punch and story mutation functions.';

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
  select p.shop_id
    into v_profile_shop_id
  from public.profiles p
  where p.id = v_profile_id;

  if new.shop_id <> v_profile_shop_id
    or new.actor_id is distinct from v_profile_id
  then
    raise exception 'copilot_command_identity_mismatch'
      using errcode = '42501';
  end if;

  v_action := new.payload ->> 'action';
  begin
    case v_action
      when 'session.read' then
        v_result := copilot.technician_session_read_internal(
          v_auth_user_id,
          nullif(new.payload ->> 'sessionId', '')::uuid
        );
      when 'session.start' then
        v_result := copilot.technician_session_start_internal(
          v_auth_user_id,
          (new.payload ->> 'workOrderId')::uuid,
          nullif(new.payload ->> 'workOrderLineId', '')::uuid,
          coalesce(nullif(new.payload ->> 'mode', ''), 'shop'),
          (new.payload ->> 'operationId')::uuid
        );
      when 'event.append' then
        v_result := copilot.technician_event_append_internal(
          v_auth_user_id,
          (new.payload ->> 'sessionId')::uuid,
          new.payload ->> 'eventType',
          coalesce(nullif(new.payload ->> 'origin', ''), 'ui'),
          (new.payload ->> 'operationId')::uuid,
          coalesce(new.payload -> 'details', '{}'::jsonb),
          coalesce(
            nullif(new.payload ->> 'occurredAt', '')::timestamptz,
            now()
          )
        );
      when 'documentation.append' then
        v_result := copilot.technician_documentation_append_internal(
          v_auth_user_id,
          (new.payload ->> 'sessionId')::uuid,
          new.payload ->> 'sourceTurnId',
          (new.payload ->> 'operationId')::uuid,
          coalesce(new.payload -> 'events', '[]'::jsonb),
          coalesce(
            nullif(new.payload ->> 'occurredAt', '')::timestamptz,
            now()
          )
        );
      when 'job.action' then
        v_result := copilot.technician_job_action_internal(
          v_auth_user_id,
          (new.payload ->> 'sessionId')::uuid,
          (new.payload ->> 'workOrderLineId')::uuid,
          new.payload ->> 'jobAction',
          (new.payload ->> 'operationId')::uuid,
          nullif(new.payload ->> 'reason', ''),
          new.payload ->> 'cause',
          new.payload ->> 'correction',
          nullif(new.payload ->> 'expectedLineUpdatedAt', '')::timestamptz
        );
      else
        raise exception 'copilot_command_not_allowed'
          using errcode = '22023';
    end case;

    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'copilotCommandResult', v_result,
        'copilotCommandError', null
      );
  exception when others then
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'copilotCommandResult', null,
        'copilotCommandError', jsonb_build_object(
          'code', sqlstate,
          'message', sqlerrm
        )
      );
  end;

  return new;
end;
$$;

do $technician_copilot_job_actions_postcheck$
declare
  v_action_definition text;
  v_command_definition text;
begin
  select pg_get_functiondef(
    'copilot.technician_job_action_internal(uuid,uuid,uuid,text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_action_definition;

  select pg_get_functiondef(
    'copilot.process_ai_action_command()'::regprocedure
  ) into v_command_definition;

  if v_action_definition is null
    or position('pg_advisory_xact_lock' in v_action_definition) = 0
    or position('copilot.technician_is_assigned' in v_action_definition) = 0
    or position('for update of rs, wol' in lower(v_action_definition)) = 0
    or position('apply_job_punch_transition_atomic' in v_action_definition) = 0
    or position('apply_offline_line_mutation_atomic' in v_action_definition) = 0
  then
    raise exception 'Technician CoPilot job-action authorization or canonical delegation is missing';
  end if;

  if v_command_definition is null
    or position('when ''job.action''' in v_command_definition) = 0
    or position('technician_job_action_internal' in v_command_definition) = 0
  then
    raise exception 'Technician CoPilot job action is missing from the private command bridge';
  end if;

  if has_function_privilege(
    'authenticated',
    'copilot.technician_job_action_internal(uuid,uuid,uuid,text,uuid,text,text,text,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'copilot.technician_job_action_internal(uuid,uuid,uuid,text,uuid,text,text,text,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Technician CoPilot private job action has an unsafe direct grant';
  end if;
end
$technician_copilot_job_actions_postcheck$;

commit;
