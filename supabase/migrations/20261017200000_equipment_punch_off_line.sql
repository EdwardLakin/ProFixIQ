begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local check_function_bodies = false;

-- ===========================================================================
-- EQUIPMENT PUNCH-OFF (isolated addition)
--
-- Rule: the last technician to punch off the job closes the line.
--
-- Wraps the canonical apply_job_punch_transition_atomic without changing it:
--   * a technician punching off while another technician is still on the job
--     only ends their own labor (canonical `pause`, line status preserved,
--     reason `punched_off`);
--   * the last technician to punch off completes the line (canonical `finish`,
--     which still requires cause, correction, labor time and a completed
--     inspection).
-- "Still on the job" = another technician with a running labor segment on this
-- line. A technician who is paused or on hold is not working, so does not
-- block closing. Technicians assigned but never punched on do not block either.
--
-- equipment_close_line_atomic is the office override for a forgotten timer.
-- Time and notes are never discarded: every segment is kept.
-- ===========================================================================

create or replace function public.equipment_punch_off_line_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_cause text default null,
  p_correction text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tech public.profiles%rowtype;
  v_line public.work_order_lines%rowtype;
  v_operation public.scheduler_operation_keys%rowtype;
  v_request jsonb;
  v_hash text;
  v_blocking jsonb;
  v_punch jsonb;
  v_result jsonb;
  v_closed boolean;
begin
  if nullif(trim(coalesce(p_operation_key, '')), '') is null
     or length(trim(p_operation_key)) < 8 then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select p.* into v_tech
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_technician_id or p.user_id = p_technician_id)
  order by case when p.id = p_technician_id then 0 else 1 end
  limit 1;

  -- A technician punches themselves off, exactly like the canonical command.
  if not found
     or p_actor_user_id not in (v_tech.id, coalesce(v_tech.user_id, v_tech.id))
     or not public.scheduler_actor_matches(coalesce(v_tech.user_id, v_tech.id)) then
    raise exception using errcode = '42501', message = 'Punch-off denied.';
  end if;

  v_request := jsonb_build_object(
    'shop_id', p_shop_id,
    'line_id', p_work_order_line_id,
    'technician_id', v_tech.id,
    'cause', nullif(trim(coalesce(p_cause, '')), ''),
    'correction', nullif(trim(coalesce(p_correction, '')), ''),
    'notes', nullif(trim(coalesce(p_notes, '')), '')
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Serialize every punch-off on a line. Without this, two technicians
  -- punching off together would each see the other still running, and nobody
  -- would close the line.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_shop_id::text || ':equipment_punch_off_key:' || p_operation_key, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_shop_id::text || ':equipment_punch_off_line:' || p_work_order_line_id::text, 0));

  select k.* into v_operation
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = 'equipment_punch_off'
    and k.operation_key = p_operation_key;
  if found then
    if v_operation.actor_user_id is distinct from v_tech.id
       or coalesce(v_operation.result ->> '_request_hash', '') <> v_hash then
      raise exception using errcode = '22023', message = 'EQUIPMENT_PUNCH_OFF_OPERATION_KEY_CONFLICT';
    end if;
    return (v_operation.result - '_request_hash') || jsonb_build_object('idempotent', true);
  end if;

  select * into v_line
  from public.work_order_lines l
  where l.id = p_work_order_line_id and l.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;
  if lower(coalesce(v_line.status::text, '')) in ('completed', 'invoiced') then
    raise exception using errcode = 'P0001', message = 'This line is already closed.';
  end if;

  if not exists (
    select 1 from public.work_order_line_labor_segments s
    where s.shop_id = p_shop_id
      and s.work_order_line_id = p_work_order_line_id
      and s.technician_id = v_tech.id
      and s.ended_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'You have no running timer on this line to punch off.';
  end if;

  -- Other technicians with a running timer.
  select coalesce(jsonb_agg(jsonb_build_object(
           'technicianId', s.technician_id,
           'state', 'running'
         ) order by s.technician_id), '[]'::jsonb)
  into v_blocking
  from (
    select distinct s2.technician_id
    from public.work_order_line_labor_segments s2
    where s2.shop_id = p_shop_id
      and s2.work_order_line_id = p_work_order_line_id
      and s2.technician_id <> v_tech.id
      and s2.ended_at is null
  ) s;

  v_closed := jsonb_array_length(v_blocking) = 0;

  if v_closed then
    v_punch := public.apply_job_punch_transition_atomic(
      p_shop_id, p_work_order_line_id, 'finish', v_tech.id, p_actor_user_id,
      'equipment-punch-off:' || p_operation_key || ':finish',
      false, now(), null, null, p_notes, false, false,
      p_cause, p_correction, null, '{}'::jsonb
    );
  else
    v_punch := public.apply_job_punch_transition_atomic(
      p_shop_id, p_work_order_line_id, 'pause', v_tech.id, p_actor_user_id,
      'equipment-punch-off:' || p_operation_key || ':pause',
      false, now(), null, 'punched_off', p_notes, true, false,
      null, null, null, '{}'::jsonb
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'lineId', p_work_order_line_id,
    'lineClosed', v_closed,
    'remaining', v_blocking,
    'idempotent', false
  );
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (
    p_shop_id, 'equipment_punch_off', p_operation_key, v_tech.id,
    v_result || jsonb_build_object('_request_hash', v_hash)
  );
  return v_result;
end;
$$;

revoke all on function public.equipment_punch_off_line_atomic(
  uuid,uuid,uuid,uuid,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.equipment_punch_off_line_atomic(
  uuid,uuid,uuid,uuid,text,text,text,text
) to service_role;

-- Office override: close a line whose technician forgot to punch off. Ends
-- every running timer at the close time (time is kept, reason office_closed) and
-- completes the line through the canonical finish, which still requires cause,
-- correction, labor time and a signed inspection. A written reason is required
-- and is recorded on the activity log.
create or replace function public.equipment_close_line_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_reason text,
  p_cause text default null,
  p_correction text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.profiles%rowtype;
  v_line public.work_order_lines%rowtype;
  v_operation public.scheduler_operation_keys%rowtype;
  v_request jsonb;
  v_hash text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_tech uuid;
  v_closed integer := 0;
  v_result jsonb;
  v_now timestamptz := now();
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_manage(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Close line denied.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null
     or length(trim(p_operation_key)) < 8 then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if v_reason is null or length(v_reason) < 3 then
    raise exception using errcode = 'P0001', message = 'A reason is required to close a line for a technician.';
  end if;

  select p.* into v_actor
  from public.profiles p
  where p.shop_id = p_shop_id and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;

  v_request := jsonb_build_object(
    'shop_id', p_shop_id, 'line_id', p_work_order_line_id, 'reason', v_reason,
    'cause', nullif(trim(coalesce(p_cause, '')), ''),
    'correction', nullif(trim(coalesce(p_correction, '')), '')
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_request::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_shop_id::text || ':equipment_close_key:' || p_operation_key, 0));
  -- Same lock as punch-off so an override and a punch-off cannot interleave.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_shop_id::text || ':equipment_punch_off_line:' || p_work_order_line_id::text, 0));

  select k.* into v_operation
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id and k.operation_name = 'equipment_close_line'
    and k.operation_key = p_operation_key;
  if found then
    if v_operation.actor_user_id is distinct from v_actor.id
       or coalesce(v_operation.result ->> '_request_hash', '') <> v_hash then
      raise exception using errcode = '22023', message = 'EQUIPMENT_CLOSE_LINE_OPERATION_KEY_CONFLICT';
    end if;
    return (v_operation.result - '_request_hash') || jsonb_build_object('idempotent', true);
  end if;

  select * into v_line
  from public.work_order_lines l
  where l.id = p_work_order_line_id and l.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;
  if lower(coalesce(v_line.status::text, '')) in ('completed', 'invoiced') then
    raise exception using errcode = 'P0001', message = 'This line is already closed.';
  end if;

  -- The technician recorded on the completion: whoever had the latest labor on
  -- the line, falling back to the primary technician.
  select s.technician_id into v_tech
  from public.work_order_line_labor_segments s
  where s.shop_id = p_shop_id and s.work_order_line_id = p_work_order_line_id
  order by s.started_at desc, s.id desc
  limit 1;
  v_tech := coalesce(v_tech, v_line.assigned_tech_id);
  if v_tech is null then
    raise exception using errcode = 'P0001', message = 'This line has no technician labor to close.';
  end if;

  -- One transaction: if the canonical finish refuses (missing cause or
  -- inspection, no labor), the timers below stay running.
  update public.work_order_line_labor_segments
  set ended_at = v_now, pause_reason = 'office_closed'
  where shop_id = p_shop_id and work_order_line_id = p_work_order_line_id and ended_at is null;
  get diagnostics v_closed = row_count;

  -- Core finish: the shared guard binds actor to technician, so the override
  -- uses the core directly after this function's own office authorization.
  perform private.apply_job_punch_transition_atomic_core(
    p_shop_id, p_work_order_line_id, 'finish', v_tech, v_actor.id,
    'equipment-close-line:' || p_operation_key,
    false, v_now, null, null, null, false, false,
    p_cause, p_correction, 'office_close_line',
    jsonb_build_object('reason', v_reason, 'closed_by', v_actor.id, 'timers_closed', v_closed)
  );

  v_result := jsonb_build_object(
    'ok', true, 'lineId', p_work_order_line_id, 'lineClosed', true,
    'timersClosed', v_closed, 'idempotent', false
  );
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (p_shop_id, 'equipment_close_line', p_operation_key, v_actor.id,
          v_result || jsonb_build_object('_request_hash', v_hash));
  return v_result;
end;
$$;

revoke all on function public.equipment_close_line_atomic(uuid,uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.equipment_close_line_atomic(uuid,uuid,uuid,text,text,text,text)
  to service_role;

notify pgrst, 'reload schema';

commit;
