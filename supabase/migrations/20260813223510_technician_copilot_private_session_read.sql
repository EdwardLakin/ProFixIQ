-- Technician CoPilot V2 phase 2: private session read handler.

begin;

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
begin
  v_profile_id := copilot.technician_profile_id(p_auth_user_id);

  if p_session_id is null then
    select rs.* into v_session
    from copilot.repair_sessions rs
    where rs.technician_id = v_profile_id and rs.status = 'active'
    order by rs.last_activity_at desc
    limit 1;
  else
    select rs.* into v_session
    from copilot.repair_sessions rs
    where rs.id = p_session_id and rs.technician_id = v_profile_id;
  end if;

  if not found then
    return jsonb_build_object('session', null, 'events', '[]'::jsonb);
  end if;

  if not copilot.technician_is_assigned(
    p_auth_user_id, v_profile_id, v_session.shop_id, v_session.work_order_id, null
  ) then
    raise exception 'copilot_work_order_assignment_required' using errcode = '42501';
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
      ) order by e.event_seq
    ),
    '[]'::jsonb
  ) into v_events
  from copilot.repair_session_events e
  join copilot.repair_session_event_context c on c.event_id = e.id
  where e.session_id = v_session.id;

  return jsonb_build_object(
    'session', jsonb_build_object(
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
    'events', v_events
  );
end;
$$;

commit;
