-- Technician CoPilot job-completion slice.
-- Extend the existing private assigned-line bridge with one closed action that
-- delegates completion and punch-out to the canonical technician-screen RPC.

begin;

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
  v_line_updated_at timestamptz;
  v_line_cause text;
  v_line_correction text;
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
    'job.story.save',
    'job.complete'
  ) then
    raise exception 'copilot_job_action_not_allowed' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('copilot:job-action:' || p_operation_id::text, 0)
  );

  v_profile_id := copilot.technician_profile_id(p_auth_user_id);

  -- Match the canonical punch function's profile-then-line lock order.
  perform 1
  from public.profiles p
  where p.id = v_profile_id
  for update;

  select
      rs.shop_id,
      rs.work_order_id,
      lower(btrim(wol.status::text)),
      wol.updated_at,
      wol.cause,
      wol.correction
    into
      v_shop_id,
      v_work_order_id,
      v_line_status,
      v_line_updated_at,
      v_line_cause,
      v_line_correction
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

  v_operation_key := 'technician-copilot:' || p_operation_id::text;

  -- Completion makes the line non-actionable. Resolve a bound finish replay
  -- before rechecking current assignment/actionability, while still requiring
  -- the same active session, shop, actor, line, and operation identity.
  if v_action = 'job.complete'
    and exists (
      select 1
      from public.profiles p
      where p.id = v_profile_id
        and p.shop_id = v_shop_id
    )
    and exists (
      select 1
      from public.work_order_lines wol
      where wol.id = p_work_order_line_id
        and wol.shop_id = v_shop_id
        and wol.work_order_id = v_work_order_id
        and (
          wol.assigned_tech_id in (p_auth_user_id, v_profile_id)
          or wol.assigned_to in (p_auth_user_id, v_profile_id)
          or exists (
            select 1
            from public.work_order_line_technicians wolt
            where wolt.work_order_line_id = wol.id
              and wolt.technician_id in (p_auth_user_id, v_profile_id)
          )
        )
    )
  then
    select
        wok.operation_name,
        wok.actor_user_id,
        wok.work_order_line_id,
        wok.result
      into
        v_operation_name,
        v_existing_actor_id,
        v_existing_line_id,
        v_existing_result
    from public.workforce_operation_keys wok
    where wok.shop_id = v_shop_id
      and wok.operation_key = v_operation_key;

    if found then
      if v_operation_name is distinct from 'job_punch:finish'
        or v_existing_actor_id is distinct from v_profile_id
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
      when 'job.release_hold' then 'job_punch:resume'
      else 'job_punch:finish'
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
  elsif v_action = 'job.complete' then
    perform 1
    from public.work_order_line_labor_segments segment
    where segment.shop_id = v_shop_id
      and (
        segment.work_order_line_id = p_work_order_line_id
        or (segment.technician_id = v_profile_id and segment.ended_at is null)
      )
    for update;

    if v_line_status not in ('active', 'in_progress') then
      raise exception 'copilot_job_not_active' using errcode = '55000';
    end if;
    if not exists (
      select 1
      from public.work_order_line_labor_segments segment
      where segment.shop_id = v_shop_id
        and segment.work_order_line_id = p_work_order_line_id
        and segment.technician_id = v_profile_id
        and segment.ended_at is null
    ) then
      raise exception 'copilot_job_punch_not_active' using errcode = '55000';
    end if;
    if p_expected_line_updated_at is null then
      raise exception 'copilot_line_version_required' using errcode = '22023';
    end if;
    if v_line_updated_at is distinct from p_expected_line_updated_at then
      raise exception 'copilot_line_version_conflict' using errcode = '55000';
    end if;
    if coalesce(nullif(btrim(p_cause), ''), nullif(btrim(v_line_cause), '')) is null then
      raise exception 'Cause is required before finishing this job.' using errcode = '22023';
    end if;
    if coalesce(nullif(btrim(p_correction), ''), nullif(btrim(v_line_correction), '')) is null then
      raise exception 'Correction is required before finishing this job.' using errcode = '22023';
    end if;

    v_result := public.apply_job_punch_transition_atomic(
      p_shop_id => v_shop_id,
      p_work_order_line_id => p_work_order_line_id,
      p_action => 'finish',
      p_technician_id => v_profile_id,
      p_actor_user_id => v_profile_id,
      p_operation_key => v_operation_key,
      p_at => now(),
      p_cause => p_cause,
      p_correction => p_correction,
      p_event => 'job_completed_via_technician_copilot',
      p_details => jsonb_build_object(
        'source', 'technician_copilot',
        'repair_session_id', p_session_id
      )
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
  'Private assigned-technician bridge to canonical job punch, completion, and story mutation functions.';

do $technician_copilot_job_completion_postcheck$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'copilot.technician_job_action_internal(uuid,uuid,uuid,text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_definition;

  if v_definition is null
    or position('''job.complete''' in v_definition) = 0
    or position('p_action => ''finish''' in v_definition) = 0
    or position('copilot_line_version_conflict' in v_definition) = 0
    or position('copilot_job_punch_not_active' in v_definition) = 0
    or position('apply_job_punch_transition_atomic' in v_definition) = 0
  then
    raise exception 'Technician CoPilot canonical job completion is incomplete';
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
    raise exception 'Technician CoPilot private job completion has an unsafe direct grant';
  end if;
end
$technician_copilot_job_completion_postcheck$;

notify pgrst, 'reload schema';

commit;
