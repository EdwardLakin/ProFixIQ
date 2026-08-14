-- Technician CoPilot V2 phase 2: private read/start/event handlers.

begin;

create or replace function copilot.technician_session_read_internal(p_auth_user_id uuid,p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, copilot, pg_temp
as $$
declare v_profile_id uuid; v_session copilot.repair_sessions%rowtype; v_events jsonb;
begin
  v_profile_id := copilot.technician_profile_id(p_auth_user_id);
  if p_session_id is null then
    select rs.* into v_session from copilot.repair_sessions rs
    where rs.technician_id=v_profile_id and rs.status='active'
    order by rs.last_activity_at desc limit 1;
  else
    select rs.* into v_session from copilot.repair_sessions rs
    where rs.id=p_session_id and rs.technician_id=v_profile_id;
  end if;
  if not found then return jsonb_build_object('session',null,'events','[]'::jsonb); end if;
  if not copilot.technician_is_assigned(p_auth_user_id,v_profile_id,v_session.shop_id,v_session.work_order_id,null) then
    raise exception 'copilot_work_order_assignment_required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'repairSessionId',e.session_id,'eventSeq',e.event_seq,'eventType',e.event_type,
    'source',c.origin,'payload',c.details,'operationId',c.operation_id,'occurredAt',e.occurred_at
  ) order by e.event_seq),'[]'::jsonb) into v_events
  from copilot.repair_session_events e join copilot.repair_session_event_context c on c.event_id=e.id
  where e.session_id=v_session.id;
  return jsonb_build_object('session',jsonb_build_object(
    'id',v_session.id,'shopId',v_session.shop_id,'technicianId',v_session.technician_id,
    'workOrderId',v_session.work_order_id,'activeWorkOrderLineId',v_session.active_work_order_line_id,
    'vehicleId',v_session.vehicle_id,'serviceVisitId',v_session.service_visit_id,'mode',v_session.mode,
    'status',v_session.status,'currentTask',v_session.current_task,'contextVersion',v_session.context_version,
    'lastEventSeq',v_session.last_event_seq,'startedAt',v_session.started_at,'lastActivityAt',v_session.last_activity_at,
    'endedAt',v_session.ended_at),'events',v_events);
end;
$$;

create or replace function copilot.technician_session_start_internal(p_auth_user_id uuid,p_work_order_id uuid,p_work_order_line_id uuid,p_mode text,p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_profile_id uuid; v_shop_id uuid; v_vehicle_id uuid; v_existing_session_id uuid;
  v_active_session_id uuid; v_target_session_id uuid; v_event jsonb;
begin
  if p_mode not in ('shop','field','fleet') then raise exception 'copilot_invalid_session_mode' using errcode='22023'; end if;
  v_profile_id := copilot.technician_profile_id(p_auth_user_id);
  select p.shop_id into v_shop_id from public.profiles p where p.id=v_profile_id;
  select wo.vehicle_id into v_vehicle_id from public.work_orders wo where wo.id=p_work_order_id and wo.shop_id=v_shop_id;
  if not found then raise exception 'copilot_work_order_not_found' using errcode='P0001'; end if;
  if not copilot.technician_is_assigned(p_auth_user_id,v_profile_id,v_shop_id,p_work_order_id,p_work_order_line_id) then
    raise exception 'copilot_work_order_assignment_required' using errcode='42501';
  end if;
  select e.session_id into v_existing_session_id
  from copilot.repair_session_event_context c join copilot.repair_session_events e on e.id=c.event_id
  where c.operation_id=p_operation_id and e.technician_id=v_profile_id;
  if found then return jsonb_build_object('sessionId',v_existing_session_id,'replayed',true); end if;

  select rs.id into v_active_session_id from copilot.repair_sessions rs
  where rs.technician_id=v_profile_id and rs.status='active' for update;
  if found and exists(select 1 from copilot.repair_sessions rs where rs.id=v_active_session_id and rs.work_order_id=p_work_order_id) then
    update copilot.repair_sessions set active_work_order_line_id=coalesce(p_work_order_line_id,active_work_order_line_id),last_activity_at=now(),updated_at=now()
    where id=v_active_session_id;
    return jsonb_build_object('sessionId',v_active_session_id,'replayed',false,'alreadyActive',true);
  end if;
  if v_active_session_id is not null then
    v_event := copilot.append_repair_event_internal(v_active_session_id,v_shop_id,v_profile_id,'session.paused','system',md5(p_operation_id::text||':auto-pause')::uuid,jsonb_build_object('reason','switched_work_order'),now());
    update copilot.repair_sessions set status='paused',updated_at=now() where id=v_active_session_id;
  end if;

  select rs.id into v_target_session_id from copilot.repair_sessions rs
  where rs.technician_id=v_profile_id and rs.work_order_id=p_work_order_id and rs.status='paused'
  order by rs.last_activity_at desc limit 1 for update;
  if found then
    update copilot.repair_sessions set status='active',active_work_order_line_id=coalesce(p_work_order_line_id,active_work_order_line_id),ended_at=null,last_activity_at=now(),updated_at=now()
    where id=v_target_session_id;
    v_event := copilot.append_repair_event_internal(v_target_session_id,v_shop_id,v_profile_id,'session.resumed','system',p_operation_id,jsonb_build_object('workOrderId',p_work_order_id,'workOrderLineId',p_work_order_line_id),now());
  else
    insert into copilot.repair_sessions(shop_id,technician_id,work_order_id,active_work_order_line_id,vehicle_id,mode,status)
    values(v_shop_id,v_profile_id,p_work_order_id,p_work_order_line_id,v_vehicle_id,p_mode,'active') returning id into v_target_session_id;
    v_event := copilot.append_repair_event_internal(v_target_session_id,v_shop_id,v_profile_id,'session.started','system',p_operation_id,jsonb_build_object('workOrderId',p_work_order_id,'workOrderLineId',p_work_order_line_id,'mode',p_mode),now());
  end if;
  return jsonb_build_object('sessionId',v_target_session_id,'replayed',coalesce((v_event->>'replayed')::boolean,false));
end;
$$;

create or replace function copilot.technician_event_append_internal(p_auth_user_id uuid,p_session_id uuid,p_event_type text,p_origin text,p_operation_id uuid,p_details jsonb,p_occurred_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare v_profile_id uuid; v_shop_id uuid; v_work_order_id uuid; v_result jsonb;
begin
  if p_event_type not in ('conversation.user','conversation.assistant','task.changed','complaint.recorded','observation.recorded','measurement.recorded','dtc.observed','evidence.attached','component.removed','component.installed','component.disconnected','component.connected','fluid.drained','fluid.filled','action.pending','action.completed') then
    raise exception 'copilot_event_type_not_allowed' using errcode='22023';
  end if;
  if p_origin not in ('voice','ui','system','offline','integration','copilot') then raise exception 'copilot_event_origin_not_allowed' using errcode='22023'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' or octet_length(p_details::text)>262144 then raise exception 'copilot_event_details_invalid' using errcode='22023'; end if;
  v_profile_id := copilot.technician_profile_id(p_auth_user_id);
  select rs.shop_id,rs.work_order_id into v_shop_id,v_work_order_id from copilot.repair_sessions rs
  where rs.id=p_session_id and rs.technician_id=v_profile_id and rs.status<>'closed';
  if not found then raise exception 'copilot_session_not_found' using errcode='P0001'; end if;
  if not copilot.technician_is_assigned(p_auth_user_id,v_profile_id,v_shop_id,v_work_order_id,null) then raise exception 'copilot_work_order_assignment_required' using errcode='42501'; end if;
  v_result := copilot.append_repair_event_internal(p_session_id,v_shop_id,v_profile_id,p_event_type,p_origin,p_operation_id,p_details,p_occurred_at);
  if coalesce((v_result->>'replayed')::boolean,false)=false and p_event_type='task.changed' then
    update copilot.repair_sessions set current_task=nullif(trim(p_details->>'task'),''),updated_at=now() where id=p_session_id;
  end if;
  return v_result;
end;
$$;

commit;
