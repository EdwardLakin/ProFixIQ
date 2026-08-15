-- Technician CoPilot runtime integrity rescue.
-- Align the private runtime with the Phase-1 append-only event ledger and
-- enforce actionable assignment/session boundaries in the database.

begin;

create or replace function copilot.technician_is_assigned(
  p_auth_user_id uuid,
  p_profile_id uuid,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_work_order_line_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, copilot, pg_temp
as $$
  select exists (
    select 1
    from public.work_order_lines wol
    join public.work_orders wo
      on wo.id = wol.work_order_id
     and wo.shop_id = wol.shop_id
    where wol.shop_id = p_shop_id
      and wol.work_order_id = p_work_order_id
      and wol.line_type = 'job'
      and lower(replace(replace(btrim(wol.status), ' ', '_'), '-', '_')) not in (
        'completed',
        'ready_to_invoice',
        'invoiced',
        'declined',
        'deferred',
        'cancelled',
        'canceled',
        'closed'
      )
      and lower(replace(replace(btrim(wo.status), ' ', '_'), '-', '_')) not in (
        'completed',
        'ready_to_invoice',
        'invoiced',
        'cancelled',
        'canceled',
        'closed',
        'paid',
        'void',
        'voided',
        'archived'
      )
      and (p_work_order_line_id is null or wol.id = p_work_order_line_id)
      and (
        wol.assigned_tech_id in (p_auth_user_id, p_profile_id)
        or wol.assigned_to in (p_auth_user_id, p_profile_id)
        or exists (
          select 1
          from public.work_order_line_technicians wolt
          where wolt.work_order_line_id = wol.id
            and wolt.technician_id in (p_auth_user_id, p_profile_id)
        )
      )
  )
$$;

create or replace function copilot.guard_repair_session_anchors()
returns trigger
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_work_order_shop_id uuid;
  v_work_order_vehicle_id uuid;
begin
  select wo.shop_id, wo.vehicle_id
    into v_work_order_shop_id, v_work_order_vehicle_id
  from public.work_orders wo
  where wo.id = new.work_order_id;

  if not found then
    raise exception 'copilot_work_order_not_found' using errcode = 'P0001';
  end if;

  if new.shop_id is distinct from v_work_order_shop_id then
    raise exception 'copilot_session_shop_mismatch' using errcode = '23514';
  end if;

  if new.vehicle_id is distinct from v_work_order_vehicle_id then
    raise exception 'copilot_session_vehicle_mismatch' using errcode = '23514';
  end if;

  if new.active_work_order_line_id is not null
    and not exists (
      select 1
      from public.work_order_lines wol
      where wol.id = new.active_work_order_line_id
        and wol.shop_id = new.shop_id
        and wol.work_order_id = new.work_order_id
        and wol.line_type = 'job'
    )
  then
    raise exception 'copilot_session_line_mismatch' using errcode = '23514';
  end if;

  if new.service_visit_id is not null
    and not exists (
      select 1
      from public.service_visits sv
      where sv.id = new.service_visit_id
        and sv.shop_id = new.shop_id
        and sv.work_order_id = new.work_order_id
    )
  then
    raise exception 'copilot_session_service_visit_mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists repair_sessions_guard_anchors
  on copilot.repair_sessions;
create trigger repair_sessions_guard_anchors
before insert or update of
  shop_id,
  work_order_id,
  active_work_order_line_id,
  vehicle_id,
  service_visit_id
on copilot.repair_sessions
for each row
execute function copilot.guard_repair_session_anchors();

create or replace function copilot.append_repair_event_internal(
  p_session_id uuid,
  p_shop_id uuid,
  p_technician_id uuid,
  p_event_type text,
  p_origin text,
  p_operation_id uuid,
  p_details jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_existing_event_id uuid;
  v_existing_session_id uuid;
  v_existing_seq bigint;
  v_event_id uuid;
  v_next_seq bigint;
  v_session_status text;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_operation_id is null then
    raise exception 'copilot_operation_id_required' using errcode = '22023';
  end if;

  if p_event_type is null
    or char_length(btrim(p_event_type)) not between 1 and 120
  then
    raise exception 'copilot_event_type_invalid' using errcode = '22023';
  end if;

  if p_origin not in (
    'voice',
    'ui',
    'system',
    'offline',
    'integration',
    'copilot'
  ) then
    raise exception 'copilot_event_origin_not_allowed' using errcode = '22023';
  end if;

  if p_details is null
    or jsonb_typeof(p_details) <> 'object'
    or octet_length(p_details::text) > 262144
  then
    raise exception 'copilot_event_details_invalid' using errcode = '22023';
  end if;

  select rs.last_event_seq + 1, rs.status
    into v_next_seq, v_session_status
  from copilot.repair_sessions rs
  where rs.id = p_session_id
    and rs.shop_id = p_shop_id
    and rs.technician_id = p_technician_id
  for update;

  if not found then
    raise exception 'copilot_session_not_found' using errcode = 'P0001';
  end if;

  if v_session_status <> 'active'
    and p_event_type not in (
      'session.paused',
      'session.resumed',
      'session.closed'
    )
  then
    raise exception 'copilot_session_not_active' using errcode = '55000';
  end if;

  select e.id, e.repair_session_id, e.event_seq
    into v_existing_event_id, v_existing_session_id, v_existing_seq
  from copilot.repair_session_event_context c
  join copilot.repair_session_events e
    on e.id = c.event_id
  where c.operation_id = p_operation_id;

  if found then
    if v_existing_session_id <> p_session_id then
      raise exception 'copilot_operation_id_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'eventId', v_existing_event_id,
      'eventSeq', v_existing_seq,
      'replayed', true
    );
  end if;

  begin
    insert into copilot.repair_session_events (
      repair_session_id,
      event_seq,
      event_type,
      occurred_at
    )
    values (
      p_session_id,
      v_next_seq,
      p_event_type,
      v_occurred_at
    )
    returning id into v_event_id;

    insert into copilot.repair_session_event_context (
      event_id,
      operation_id,
      origin,
      details
    )
    values (
      v_event_id,
      p_operation_id,
      p_origin,
      p_details
    );
  exception when unique_violation then
    select e.id, e.repair_session_id, e.event_seq
      into v_existing_event_id, v_existing_session_id, v_existing_seq
    from copilot.repair_session_event_context c
    join copilot.repair_session_events e
      on e.id = c.event_id
    where c.operation_id = p_operation_id;

    if not found then
      raise;
    end if;
    if v_existing_session_id <> p_session_id then
      raise exception 'copilot_operation_id_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'eventId', v_existing_event_id,
      'eventSeq', v_existing_seq,
      'replayed', true
    );
  end;

  update copilot.repair_sessions
  set last_event_seq = v_next_seq,
      context_version = context_version + 1,
      last_activity_at = greatest(last_activity_at, v_occurred_at),
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'eventId', v_event_id,
    'eventSeq', v_next_seq,
    'replayed', false
  );
end;
$$;

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
  v_explicit boolean := p_session_id is not null;
begin
  v_profile_id := copilot.technician_profile_id(p_auth_user_id);

  if not v_explicit then
    select rs.*
      into v_session
    from copilot.repair_sessions rs
    where rs.technician_id = v_profile_id
      and rs.status = 'active'
      and copilot.technician_is_assigned(
        p_auth_user_id,
        v_profile_id,
        rs.shop_id,
        rs.work_order_id,
        null
      )
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

  if v_explicit
    and not copilot.technician_is_assigned(
      p_auth_user_id,
      v_profile_id,
      v_session.shop_id,
      v_session.work_order_id,
      null
    )
  then
    raise exception 'copilot_work_order_assignment_required'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'repairSessionId', e.repair_session_id,
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
  where e.repair_session_id = v_session.id;

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

create or replace function copilot.technician_session_start_internal(
  p_auth_user_id uuid,
  p_work_order_id uuid,
  p_work_order_line_id uuid,
  p_mode text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_profile_id uuid;
  v_shop_id uuid;
  v_vehicle_id uuid;
  v_work_order_status text;
  v_existing_session_id uuid;
  v_existing_technician_id uuid;
  v_active_session_id uuid;
  v_target_session_id uuid;
  v_event jsonb;
begin
  if p_mode not in ('shop', 'field', 'fleet') then
    raise exception 'copilot_invalid_session_mode' using errcode = '22023';
  end if;
  if p_operation_id is null then
    raise exception 'copilot_operation_id_required' using errcode = '22023';
  end if;

  v_profile_id := copilot.technician_profile_id(p_auth_user_id);

  select p.shop_id
    into v_shop_id
  from public.profiles p
  where p.id = v_profile_id;

  select
    wo.vehicle_id,
    lower(replace(replace(btrim(wo.status), ' ', '_'), '-', '_'))
    into v_vehicle_id, v_work_order_status
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = v_shop_id
  for share;

  if not found then
    raise exception 'copilot_work_order_not_found' using errcode = 'P0001';
  end if;

  if v_work_order_status in (
    'completed',
    'ready_to_invoice',
    'invoiced',
    'cancelled',
    'canceled',
    'closed',
    'paid',
    'void',
    'voided',
    'archived'
  ) then
    raise exception 'copilot_work_order_not_actionable' using errcode = '55000';
  end if;

  if not copilot.technician_is_assigned(
    p_auth_user_id,
    v_profile_id,
    v_shop_id,
    p_work_order_id,
    p_work_order_line_id
  ) then
    raise exception 'copilot_work_order_assignment_required'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('copilot:technician:' || v_profile_id::text, 0)
  );

  select e.repair_session_id, rs.technician_id
    into v_existing_session_id, v_existing_technician_id
  from copilot.repair_session_event_context c
  join copilot.repair_session_events e
    on e.id = c.event_id
  join copilot.repair_sessions rs
    on rs.id = e.repair_session_id
  where c.operation_id = p_operation_id;

  if found then
    if v_existing_technician_id <> v_profile_id then
      raise exception 'copilot_operation_id_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'sessionId', v_existing_session_id,
      'replayed', true
    );
  end if;

  select rs.id
    into v_active_session_id
  from copilot.repair_sessions rs
  where rs.technician_id = v_profile_id
    and rs.status = 'active'
  for update;

  if found
    and exists (
      select 1
      from copilot.repair_sessions rs
      where rs.id = v_active_session_id
        and rs.work_order_id = p_work_order_id
    )
  then
    update copilot.repair_sessions
    set active_work_order_line_id = coalesce(
          p_work_order_line_id,
          active_work_order_line_id
        ),
        last_activity_at = now(),
        updated_at = now()
    where id = v_active_session_id;

    return jsonb_build_object(
      'sessionId', v_active_session_id,
      'replayed', false,
      'alreadyActive', true
    );
  end if;

  if v_active_session_id is not null then
    v_event := copilot.append_repair_event_internal(
      v_active_session_id,
      v_shop_id,
      v_profile_id,
      'session.paused',
      'system',
      md5(p_operation_id::text || ':auto-pause')::uuid,
      jsonb_build_object('reason', 'switched_work_order'),
      now()
    );

    update copilot.repair_sessions
    set status = 'paused',
        updated_at = now()
    where id = v_active_session_id;
  end if;

  select rs.id
    into v_target_session_id
  from copilot.repair_sessions rs
  where rs.technician_id = v_profile_id
    and rs.work_order_id = p_work_order_id
    and rs.status = 'paused'
  order by rs.last_activity_at desc
  limit 1
  for update;

  if found then
    update copilot.repair_sessions
    set status = 'active',
        active_work_order_line_id = coalesce(
          p_work_order_line_id,
          active_work_order_line_id
        ),
        ended_at = null,
        last_activity_at = now(),
        updated_at = now()
    where id = v_target_session_id;

    v_event := copilot.append_repair_event_internal(
      v_target_session_id,
      v_shop_id,
      v_profile_id,
      'session.resumed',
      'system',
      p_operation_id,
      jsonb_build_object(
        'workOrderId', p_work_order_id,
        'workOrderLineId', p_work_order_line_id
      ),
      now()
    );
  else
    insert into copilot.repair_sessions (
      shop_id,
      technician_id,
      work_order_id,
      active_work_order_line_id,
      vehicle_id,
      mode,
      status
    )
    values (
      v_shop_id,
      v_profile_id,
      p_work_order_id,
      p_work_order_line_id,
      v_vehicle_id,
      p_mode,
      'active'
    )
    returning id into v_target_session_id;

    v_event := copilot.append_repair_event_internal(
      v_target_session_id,
      v_shop_id,
      v_profile_id,
      'session.started',
      'system',
      p_operation_id,
      jsonb_build_object(
        'workOrderId', p_work_order_id,
        'workOrderLineId', p_work_order_line_id,
        'mode', p_mode
      ),
      now()
    );
  end if;

  return jsonb_build_object(
    'sessionId', v_target_session_id,
    'replayed', coalesce((v_event ->> 'replayed')::boolean, false)
  );
end;
$$;

create or replace function copilot.technician_event_append_internal(
  p_auth_user_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_origin text,
  p_operation_id uuid,
  p_details jsonb,
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
  v_result jsonb;
begin
  if p_event_type not in (
    'conversation.user',
    'conversation.assistant',
    'task.changed',
    'complaint.recorded',
    'observation.recorded',
    'measurement.recorded',
    'dtc.observed',
    'diagnostic.finding',
    'evidence.attached',
    'component.removed',
    'component.installed',
    'component.disconnected',
    'component.connected',
    'fluid.drained',
    'fluid.filled',
    'action.pending',
    'action.completed'
  ) then
    raise exception 'copilot_event_type_not_allowed' using errcode = '22023';
  end if;

  if p_origin not in (
    'voice',
    'ui',
    'system',
    'offline',
    'integration',
    'copilot'
  ) then
    raise exception 'copilot_event_origin_not_allowed' using errcode = '22023';
  end if;

  if p_details is null
    or jsonb_typeof(p_details) <> 'object'
    or octet_length(p_details::text) > 262144
  then
    raise exception 'copilot_event_details_invalid' using errcode = '22023';
  end if;

  v_profile_id := copilot.technician_profile_id(p_auth_user_id);

  select rs.shop_id, rs.work_order_id
    into v_shop_id, v_work_order_id
  from copilot.repair_sessions rs
  where rs.id = p_session_id
    and rs.technician_id = v_profile_id
    and rs.status = 'active';

  if not found then
    raise exception 'copilot_session_not_active' using errcode = '55000';
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

  v_result := copilot.append_repair_event_internal(
    p_session_id,
    v_shop_id,
    v_profile_id,
    p_event_type,
    p_origin,
    p_operation_id,
    p_details,
    coalesce(p_occurred_at, now())
  );

  if coalesce((v_result ->> 'replayed')::boolean, false) = false
    and p_event_type = 'task.changed'
  then
    update copilot.repair_sessions
    set current_task = nullif(btrim(p_details ->> 'task'), ''),
        updated_at = now()
    where id = p_session_id;
  end if;

  return v_result;
end;
$$;

create or replace function copilot.guard_documentation_turn_active()
returns trigger
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
begin
  perform 1
  from copilot.repair_sessions rs
  where rs.id = new.session_id
    and rs.shop_id = new.shop_id
    and rs.technician_id = new.technician_id
    and rs.status = 'active'
  for update;

  if not found then
    raise exception 'copilot_session_not_active' using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists repair_session_documentation_turns_require_active
  on copilot.repair_session_documentation_turns;
create trigger repair_session_documentation_turns_require_active
before insert on copilot.repair_session_documentation_turns
for each row
execute function copilot.guard_documentation_turn_active();

revoke all on function copilot.technician_is_assigned(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
revoke all on function copilot.guard_repair_session_anchors()
  from public, anon, authenticated, service_role;
revoke all on function copilot.append_repair_event_internal(
  uuid,
  uuid,
  uuid,
  text,
  text,
  uuid,
  jsonb,
  timestamptz
) from public, anon, authenticated, service_role;
revoke all on function copilot.technician_session_read_internal(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function copilot.technician_session_start_internal(
  uuid,
  uuid,
  uuid,
  text,
  uuid
) from public, anon, authenticated, service_role;
revoke all on function copilot.technician_event_append_internal(
  uuid,
  uuid,
  text,
  text,
  uuid,
  jsonb,
  timestamptz
) from public, anon, authenticated, service_role;
revoke all on function copilot.guard_documentation_turn_active()
  from public, anon, authenticated, service_role;

comment on function copilot.append_repair_event_internal(
  uuid,
  uuid,
  uuid,
  text,
  text,
  uuid,
  jsonb,
  timestamptz
) is
  'Private ordered append against repair_session_events.repair_session_id with operation replay protection.';
comment on function copilot.technician_session_start_internal(
  uuid,
  uuid,
  uuid,
  text,
  uuid
) is
  'Starts or switches one active Technician CoPilot session only for actionable assigned work.';

-- Ephemeral command rows are transport envelopes, not durable AI audit events.
delete from public.ai_action_events
where source = 'technician_copilot_command';

do $technician_copilot_runtime_integrity_postcheck$
declare
  v_append_definition text;
  v_read_definition text;
  v_start_definition text;
begin
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'copilot'
      and c.table_name = 'repair_session_events'
      and c.column_name = 'repair_session_id'
  )
  or exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'copilot'
      and c.table_name = 'repair_session_events'
      and c.column_name in ('session_id', 'shop_id', 'technician_id')
  )
  then
    raise exception 'Technician CoPilot runtime postcheck failed: event ledger columns are incoherent';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'copilot'
      and c.table_name = 'repair_session_event_context'
      and c.column_name in ('shop_id', 'technician_id', 'occurred_at')
  )
  then
    raise exception 'Technician CoPilot runtime postcheck failed: context ledger columns are incoherent';
  end if;

  select pg_get_functiondef(p.oid)
    into v_append_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'copilot'
    and p.proname = 'append_repair_event_internal';

  select pg_get_functiondef(p.oid)
    into v_read_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'copilot'
    and p.proname = 'technician_session_read_internal';

  select pg_get_functiondef(p.oid)
    into v_start_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'copilot'
    and p.proname = 'technician_session_start_internal';

  if v_append_definition is null
    or position('repair_session_id' in v_append_definition) = 0
    or position('repair_session_events(session_id' in v_append_definition) > 0
    or position('repair_session_event_context(event_id,shop_id' in v_append_definition) > 0
  then
    raise exception 'Technician CoPilot runtime postcheck failed: append helper still targets obsolete columns';
  end if;

  if v_read_definition is null
    or position('e.repair_session_id' in v_read_definition) = 0
    or position('e.session_id' in v_read_definition) > 0
  then
    raise exception 'Technician CoPilot runtime postcheck failed: session read still targets obsolete columns';
  end if;

  if v_start_definition is null
    or position('e.repair_session_id' in v_start_definition) = 0
    or position('copilot_work_order_not_actionable' in v_start_definition) = 0
    or position('pg_advisory_xact_lock' in v_start_definition) = 0
  then
    raise exception 'Technician CoPilot runtime postcheck failed: session start integrity guard missing';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'copilot.repair_sessions'::regclass
      and t.tgname = 'repair_sessions_guard_anchors'
      and not t.tgisinternal
  )
  or not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'copilot.repair_session_documentation_turns'::regclass
      and t.tgname = 'repair_session_documentation_turns_require_active'
      and not t.tgisinternal
  )
  then
    raise exception 'Technician CoPilot runtime postcheck failed: integrity triggers missing';
  end if;
end
$technician_copilot_runtime_integrity_postcheck$;

commit;
