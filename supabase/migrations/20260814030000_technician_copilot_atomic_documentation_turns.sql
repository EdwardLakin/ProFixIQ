-- Technician CoPilot V2 phase 3: finalize each silent-documentation source
-- turn exactly once and append its normalized facts atomically. This prevents
-- concurrent or retried model runs from persisting competing interpretations.

begin;

create table if not exists copilot.repair_session_documentation_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references copilot.repair_sessions(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete restrict,
  source_turn_id text not null,
  operation_id uuid not null unique,
  event_count integer not null,
  payload_digest text not null,
  created_at timestamptz not null default now(),
  constraint repair_session_documentation_turns_source_unique
    unique (session_id, source_turn_id),
  constraint repair_session_documentation_turns_source_check
    check (char_length(btrim(source_turn_id)) between 1 and 200),
  constraint repair_session_documentation_turns_event_count_check
    check (event_count between 0 and 12),
  constraint repair_session_documentation_turns_digest_check
    check (payload_digest ~ '^[0-9a-f]{32}$')
);

create index if not exists repair_session_documentation_turns_technician_idx
  on copilot.repair_session_documentation_turns (
    technician_id,
    session_id,
    created_at desc
  );

revoke all on table copilot.repair_session_documentation_turns
  from public, anon, authenticated;

create or replace function copilot.technician_session_read_internal(
  p_auth_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_profile_id uuid;
  v_session copilot.repair_sessions%rowtype;
  v_events jsonb;
  v_documentation_turns jsonb;
begin
  v_profile_id := copilot.technician_profile_id(p_auth_user_id);

  if p_session_id is null then
    select rs.*
      into v_session
    from copilot.repair_sessions rs
    where rs.technician_id = v_profile_id
      and rs.status = 'active'
    order by rs.last_activity_at desc
    limit 1;
  else
    select rs.*
      into v_session
    from copilot.repair_sessions rs
    where rs.id = p_session_id
      and rs.technician_id = v_profile_id;
  end if;

  if not found then
    return jsonb_build_object(
      'session', null,
      'events', '[]'::jsonb,
      'documentationTurns', '[]'::jsonb
    );
  end if;

  if not copilot.technician_is_assigned(
    p_auth_user_id,
    v_profile_id,
    v_session.shop_id,
    v_session.work_order_id,
    null
  ) then
    raise exception 'copilot_work_order_assignment_required'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'repairSessionId', e.session_id,
        'eventSeq', e.event_seq,
        'eventType', e.event_type,
        'source', c.origin,
        'payload', c.details,
        'operationId', c.operation_id,
        'occurredAt', e.occurred_at
      )
      order by e.event_seq
    ),
    '[]'::jsonb
  )
    into v_events
  from copilot.repair_session_events e
  join copilot.repair_session_event_context c
    on c.event_id = e.id
  where e.session_id = v_session.id;

  select coalesce(
    jsonb_agg(dt.source_turn_id order by dt.created_at, dt.id),
    '[]'::jsonb
  )
    into v_documentation_turns
  from copilot.repair_session_documentation_turns dt
  where dt.session_id = v_session.id;

  return jsonb_build_object(
    'session',
    jsonb_build_object(
      'id', v_session.id,
      'shopId', v_session.shop_id,
      'technicianId', v_session.technician_id,
      'workOrderId', v_session.work_order_id,
      'activeWorkOrderLineId', v_session.active_work_order_line_id,
      'vehicleId', v_session.vehicle_id,
      'serviceVisitId', v_session.service_visit_id,
      'mode', v_session.mode,
      'status', v_session.status,
      'currentTask', v_session.current_task,
      'contextVersion', v_session.context_version,
      'lastEventSeq', v_session.last_event_seq,
      'startedAt', v_session.started_at,
      'lastActivityAt', v_session.last_activity_at,
      'endedAt', v_session.ended_at
    ),
    'events', v_events,
    'documentationTurns', v_documentation_turns
  );
end;
$$;

create or replace function copilot.technician_documentation_append_internal(
  p_auth_user_id uuid,
  p_session_id uuid,
  p_source_turn_id text,
  p_operation_id uuid,
  p_events jsonb,
  p_occurred_at timestamptz
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
  v_source_turn_id text;
  v_event_count integer;
  v_turn_id uuid;
  v_existing copilot.repair_session_documentation_turns%rowtype;
  v_event record;
  v_event_type text;
  v_details jsonb;
  v_confidence numeric;
  v_event_result jsonb;
  v_event_results jsonb := '[]'::jsonb;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  v_source_turn_id := btrim(coalesce(p_source_turn_id, ''));

  if char_length(v_source_turn_id) not between 1 and 200 then
    raise exception 'copilot_documentation_source_turn_invalid'
      using errcode = '22023';
  end if;

  if p_operation_id is null then
    raise exception 'copilot_documentation_operation_id_required'
      using errcode = '22023';
  end if;

  if p_events is null
    or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) > 12
    or octet_length(p_events::text) > 262144
  then
    raise exception 'copilot_documentation_events_invalid'
      using errcode = '22023';
  end if;

  v_event_count := jsonb_array_length(p_events);
  v_profile_id := copilot.technician_profile_id(p_auth_user_id);

  select rs.shop_id, rs.work_order_id
    into v_shop_id, v_work_order_id
  from copilot.repair_sessions rs
  where rs.id = p_session_id
    and rs.technician_id = v_profile_id
    and rs.status <> 'closed';

  if not found then
    raise exception 'copilot_session_not_found' using errcode = 'P0001';
  end if;

  if not copilot.technician_is_assigned(
    p_auth_user_id,
    v_profile_id,
    v_shop_id,
    v_work_order_id,
    null
  ) then
    raise exception 'copilot_work_order_assignment_required'
      using errcode = '42501';
  end if;

  select dt.*
    into v_existing
  from copilot.repair_session_documentation_turns dt
  where dt.session_id = p_session_id
    and dt.source_turn_id = v_source_turn_id;

  if found then
    return jsonb_build_object(
      'turnId', v_existing.id,
      'sourceTurnId', v_existing.source_turn_id,
      'eventCount', v_existing.event_count,
      'replayed', true
    );
  end if;

  select dt.*
    into v_existing
  from copilot.repair_session_documentation_turns dt
  where dt.operation_id = p_operation_id;

  if found then
    raise exception 'copilot_documentation_operation_id_conflict'
      using errcode = '23505';
  end if;

  insert into copilot.repair_session_documentation_turns (
    session_id,
    shop_id,
    technician_id,
    source_turn_id,
    operation_id,
    event_count,
    payload_digest
  )
  values (
    p_session_id,
    v_shop_id,
    v_profile_id,
    v_source_turn_id,
    p_operation_id,
    v_event_count,
    md5(p_events::text)
  )
  on conflict do nothing
  returning id into v_turn_id;

  if v_turn_id is null then
    select dt.*
      into v_existing
    from copilot.repair_session_documentation_turns dt
    where dt.session_id = p_session_id
      and dt.source_turn_id = v_source_turn_id;

    if found then
      return jsonb_build_object(
        'turnId', v_existing.id,
        'sourceTurnId', v_existing.source_turn_id,
        'eventCount', v_existing.event_count,
        'replayed', true
      );
    end if;

    if exists (
      select 1
      from copilot.repair_session_documentation_turns dt
      where dt.operation_id = p_operation_id
    ) then
      raise exception 'copilot_documentation_operation_id_conflict'
        using errcode = '23505';
    end if;

    raise exception 'copilot_documentation_turn_reservation_failed'
      using errcode = 'P0001';
  end if;

  for v_event in
    select item.value as payload, item.ordinality::integer as slot
    from jsonb_array_elements(p_events) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    if jsonb_typeof(v_event.payload) <> 'object' then
      raise exception 'copilot_documentation_event_invalid'
        using errcode = '22023';
    end if;

    v_event_type := v_event.payload ->> 'type';
    if v_event_type is null or v_event_type not in (
      'task.changed',
      'observation.recorded',
      'measurement.recorded',
      'dtc.observed',
      'diagnostic.finding',
      'component.removed',
      'component.installed',
      'component.disconnected',
      'component.connected',
      'fluid.drained',
      'fluid.filled'
    ) then
      raise exception 'copilot_documentation_event_type_not_allowed'
        using errcode = '22023';
    end if;

    v_details := v_event.payload -> 'details';
    if v_details is null
      or jsonb_typeof(v_details) <> 'object'
      or octet_length(v_details::text) > 262144
    then
      raise exception 'copilot_documentation_event_details_invalid'
        using errcode = '22023';
    end if;

    if v_details ->> 'sourceTurnId' is distinct from v_source_turn_id
      or v_details ->> 'captureMode' is distinct from 'silent_documentation_v1'
      or v_details ->> 'capturePromptVersion'
        is distinct from 'technician_copilot_documentation_v1'
      or coalesce(v_details ->> 'captureProviderMode', '')
        not in ('ai', 'fallback')
      or jsonb_typeof(v_details -> 'sourceText') is distinct from 'string'
      or nullif(btrim(v_details ->> 'sourceText'), '') is null
      or jsonb_typeof(v_details -> 'captureModel') is distinct from 'string'
      or nullif(btrim(v_details ->> 'captureModel'), '') is null
      or jsonb_typeof(v_details -> 'documentationFingerprint')
        is distinct from 'string'
      or nullif(btrim(v_details ->> 'documentationFingerprint'), '') is null
    then
      raise exception 'copilot_documentation_event_provenance_invalid'
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_details -> 'confidence') is distinct from 'number' then
      raise exception 'copilot_documentation_event_confidence_invalid'
        using errcode = '22023';
    end if;

    begin
      v_confidence := (v_details ->> 'confidence')::numeric;
    exception when others then
      raise exception 'copilot_documentation_event_confidence_invalid'
        using errcode = '22023';
    end;

    if v_confidence < 0.6 or v_confidence > 1 then
      raise exception 'copilot_documentation_event_confidence_invalid'
        using errcode = '22023';
    end if;

    v_event_result := copilot.append_repair_event_internal(
      p_session_id,
      v_shop_id,
      v_profile_id,
      v_event_type,
      'copilot',
      md5(
        p_operation_id::text
        || ':documentation-slot:'
        || v_event.slot::text
      )::uuid,
      v_details,
      v_occurred_at
    );

    if coalesce((v_event_result ->> 'replayed')::boolean, false) then
      raise exception 'copilot_documentation_slot_conflict'
        using errcode = '23505';
    end if;

    if v_event_type = 'task.changed' then
      update copilot.repair_sessions
      set current_task = nullif(btrim(v_details ->> 'task'), ''),
          updated_at = now()
      where id = p_session_id;
    end if;

    v_event_results := v_event_results || jsonb_build_array(
      jsonb_build_object(
        'slot', v_event.slot,
        'eventId', v_event_result -> 'eventId',
        'eventSeq', v_event_result -> 'eventSeq',
        'eventType', v_event_type
      )
    );
  end loop;

  return jsonb_build_object(
    'turnId', v_turn_id,
    'sourceTurnId', v_source_turn_id,
    'eventCount', v_event_count,
    'events', v_event_results,
    'replayed', false
  );
end;
$$;

comment on table copilot.repair_session_documentation_turns is
  'Private same-turn idempotency receipts for atomically finalized Technician CoPilot silent documentation.';

comment on function copilot.technician_documentation_append_internal(
  uuid,
  uuid,
  text,
  uuid,
  jsonb,
  timestamptz
) is
  'Technician-authorized, turn-scoped atomic append for normalized silent-documentation events.';

revoke all on function copilot.technician_documentation_append_internal(
  uuid,
  uuid,
  text,
  uuid,
  jsonb,
  timestamptz
) from public, anon, authenticated;

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

do $phase3_atomic_documentation_postcheck$
declare
  v_append_signature constant text :=
    'copilot.technician_documentation_append_internal(uuid,uuid,text,uuid,jsonb,timestamptz)';
  v_append_function regprocedure;
  v_append_definition text;
  v_read_function regprocedure;
  v_read_definition text;
  v_command_function regprocedure;
  v_command_definition text;
begin
  if to_regclass('copilot.repair_session_documentation_turns') is null then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: turn receipt table missing';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'copilot.repair_session_documentation_turns'::regclass
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid)
        ilike '%unique (session_id, source_turn_id)%'
  ) then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: source-turn uniqueness missing';
  end if;

  v_append_function := to_regprocedure(v_append_signature);
  if v_append_function is null then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: append function missing';
  end if;

  select pg_get_functiondef(v_append_function)
    into v_append_definition;

  if position('copilot.technician_profile_id' in v_append_definition) = 0
    or position('copilot.technician_is_assigned' in v_append_definition) = 0
    or position('copilot.append_repair_event_internal' in v_append_definition) = 0
    or position('on conflict do nothing' in lower(v_append_definition)) = 0
    or position(':documentation-slot:' in v_append_definition) = 0
    or position('jsonb_array_length(p_events) > 12' in v_append_definition) = 0
  then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: authorization or turn atomicity changed';
  end if;

  v_read_function := to_regprocedure(
    'copilot.technician_session_read_internal(uuid,uuid)'
  );
  if v_read_function is null then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: session read function missing';
  end if;

  select pg_get_functiondef(v_read_function)
    into v_read_definition;

  if position(
    'copilot.repair_session_documentation_turns'
    in v_read_definition
  ) = 0
    or position('documentationTurns' in v_read_definition) = 0
  then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: documentation receipt projection missing';
  end if;

  v_command_function := to_regprocedure(
    'copilot.process_ai_action_command()'
  );
  if v_command_function is null then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: command bridge missing';
  end if;

  select pg_get_functiondef(v_command_function)
    into v_command_definition;

  if position('''documentation.append''' in v_command_definition) = 0
    or position(
      'copilot.technician_documentation_append_internal'
      in v_command_definition
    ) = 0
  then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: command bridge not wired';
  end if;

  if has_schema_privilege('anon', 'copilot', 'USAGE')
    or has_schema_privilege('authenticated', 'copilot', 'USAGE')
    or has_table_privilege(
      'anon',
      'copilot.repair_session_documentation_turns',
      'SELECT'
    )
    or has_table_privilege(
      'authenticated',
      'copilot.repair_session_documentation_turns',
      'SELECT'
    )
    or has_function_privilege('anon', v_append_signature, 'EXECUTE')
    or has_function_privilege(
      'authenticated',
      v_append_signature,
      'EXECUTE'
    )
  then
    raise exception 'Technician CoPilot atomic documentation postcheck failed: private boundary exposed';
  end if;
end
$phase3_atomic_documentation_postcheck$;

commit;
