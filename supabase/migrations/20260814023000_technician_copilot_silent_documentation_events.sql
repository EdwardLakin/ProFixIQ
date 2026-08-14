-- Technician CoPilot V2 phase 3: allow explicit diagnostic findings in the
-- private Repair Session event ledger. This keeps the existing role,
-- assignment, payload-size, origin, and closed-session checks unchanged.

begin;

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
    raise exception 'copilot_work_order_assignment_required' using errcode = '42501';
  end if;

  v_result := copilot.append_repair_event_internal(
    p_session_id,
    v_shop_id,
    v_profile_id,
    p_event_type,
    p_origin,
    p_operation_id,
    p_details,
    p_occurred_at
  );

  if coalesce((v_result ->> 'replayed')::boolean, false) = false
    and p_event_type = 'task.changed'
  then
    update copilot.repair_sessions
    set current_task = nullif(trim(p_details ->> 'task'), ''),
        updated_at = now()
    where id = p_session_id;
  end if;

  return v_result;
end;
$$;

comment on function copilot.technician_event_append_internal(
  uuid,
  uuid,
  text,
  text,
  uuid,
  jsonb,
  timestamptz
) is
  'Technician-authorized private Repair Session event append boundary, including Phase-3 explicit diagnostic findings.';

do $phase3_contract_postcheck$
declare
  v_signature constant text :=
    'copilot.technician_event_append_internal(uuid,uuid,text,text,uuid,jsonb,timestamptz)';
  v_function regprocedure;
  v_definition text;
begin
  v_function := to_regprocedure(v_signature);
  if v_function is null then
    raise exception 'Technician CoPilot Phase-3 postcheck failed: append function missing';
  end if;

  select pg_get_functiondef(v_function)
    into v_definition;

  if position('''diagnostic.finding''' in v_definition) = 0 then
    raise exception 'Technician CoPilot Phase-3 postcheck failed: diagnostic finding is not allowed';
  end if;

  if position('copilot.technician_is_assigned' in v_definition) = 0
    or position('copilot.technician_profile_id' in v_definition) = 0
    or position('copilot.append_repair_event_internal' in v_definition) = 0
  then
    raise exception 'Technician CoPilot Phase-3 postcheck failed: authorization or idempotent append boundary changed';
  end if;

  if has_schema_privilege('anon', 'copilot', 'USAGE')
    or has_schema_privilege('authenticated', 'copilot', 'USAGE')
    or has_function_privilege('anon', v_signature, 'EXECUTE')
    or has_function_privilege('authenticated', v_signature, 'EXECUTE')
  then
    raise exception 'Technician CoPilot Phase-3 postcheck failed: private runtime exposed to browser roles';
  end if;
end
$phase3_contract_postcheck$;

commit;
