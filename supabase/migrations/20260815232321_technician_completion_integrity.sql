-- Canonical job-completion integrity for technician screens and CoPilot.
-- Preserve profile/auth identity boundaries, require explicit inspection
-- signing, recover receipt-bound turns, and close or re-anchor repair sessions.

begin;

create or replace function copilot.technician_has_bound_completion_receipt(
  p_auth_user_id uuid,
  p_session_id uuid,
  p_turn_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, copilot, pg_temp
as $$
  select exists (
    select 1
    from copilot.repair_sessions rs
    join public.profiles p
      on p.id = rs.technician_id
     and (p.id = p_auth_user_id or p.user_id = p_auth_user_id)
    join copilot.repair_session_events e
      on e.repair_session_id = rs.id
     and e.event_type = 'action.pending'
    join copilot.repair_session_event_context c
      on c.event_id = e.id
    join public.workforce_operation_keys wok
      on wok.shop_id = rs.shop_id
     and wok.operation_name = 'job_punch:finish'
     and wok.operation_key = 'technician-copilot:' || (c.details ->> 'key')
     and wok.actor_user_id = p_auth_user_id
     and wok.work_order_id = rs.work_order_id
     and wok.work_order_line_id = case
       when c.details ->> 'workOrderLineId'
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       then (c.details ->> 'workOrderLineId')::uuid
       else null
     end
    where rs.id = p_session_id
      and c.details ->> 'action' = 'job.complete'
      and c.details ->> 'key'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and c.details ->> 'workOrderLineId'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (p_turn_id is null or c.details ->> 'turnId' = p_turn_id)
  )
$$;

create or replace function public.apply_job_punch_transition_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_action text,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_allow_concurrent boolean default false,
  p_at timestamptz default now(),
  p_start_source text default null,
  p_hold_reason text default null,
  p_notes text default null,
  p_preserve_line_status boolean default false,
  p_release_to_awaiting boolean default false,
  p_cause text default null,
  p_correction text default null,
  p_event text default null,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_shift public.tech_shifts%rowtype;
  v_status text;
  v_approval text;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_now timestamptz := coalesce(p_at, now());
  v_existing jsonb;
  v_result jsonb;
  v_final_cause text;
  v_final_correction text;
  v_segment_id uuid;
  v_earliest timestamptz;
  v_latest timestamptz;
  v_has_open boolean;
  v_closed_count integer := 0;
  v_technician_profile_id uuid;
  v_actor_profile_id uuid;
  v_actor_auth_user_id uuid;
  v_existing_actor_user_id uuid;
  v_existing_line_id uuid;
begin
  if v_action not in ('start','resume','pause','finish') then
    raise exception using errcode = 'P0001', message = 'Unsupported job punch action.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select p.id
    into v_technician_profile_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_technician_id or p.user_id = p_technician_id)
  order by case when p.id = p_technician_id then 0 else 1 end
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Technician is not available for this shop.';
  end if;

  select p.id, coalesce(p.user_id, p.id)
    into v_actor_profile_id, v_actor_auth_user_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;
  if not found
    or not exists (
      select 1 from auth.users u where u.id = v_actor_auth_user_id
    )
    or (
      auth.uid() is not null
      and auth.uid() is distinct from v_actor_auth_user_id
    )
  then
    raise exception using errcode = 'P0001', message = 'Actor is not available for this shop.';
  end if;

  select wok.result, wok.actor_user_id, wok.work_order_line_id
    into v_existing, v_existing_actor_user_id, v_existing_line_id
  from public.workforce_operation_keys wok
  where wok.shop_id = p_shop_id
    and wok.operation_name = 'job_punch:' || v_action
    and wok.operation_key = p_operation_key;
  if found then
    if v_existing_actor_user_id is distinct from v_actor_auth_user_id
      or v_existing_line_id is distinct from p_work_order_line_id
    then
      raise exception using errcode = '23505', message = 'JOB_PUNCH_OPERATION_CONFLICT';
    end if;
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select *
    into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id
    and wol.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;
  if v_line.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'Work-order line is missing its work-order anchor.';
  end if;
  if coalesce(v_line.line_type::text, 'job') = 'info' then
    raise exception using errcode = 'P0001', message = 'Info lines are non-actionable.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, v_line.work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: job labor cannot change after invoice finalization.';
  end if;

  v_status := lower(coalesce(v_line.status::text, 'awaiting'));
  v_approval := lower(coalesce(v_line.approval_state::text, ''));

  perform 1
  from public.work_order_line_technicians wolt
  where wolt.work_order_line_id = p_work_order_line_id
  for update;

  perform 1
  from public.work_order_line_labor_segments seg
  where seg.shop_id = p_shop_id
    and (
      seg.work_order_line_id = p_work_order_line_id
      or (seg.technician_id = v_technician_profile_id and seg.ended_at is null)
    )
  for update;

  if v_action in ('start','resume') and p_release_to_awaiting then
    if v_status in ('completed','invoiced') then
      raise exception using errcode = 'P0001', message = 'Cannot release hold on a closed line.';
    end if;

    update public.work_order_lines
    set status = 'awaiting',
        hold_reason = null,
        updated_at = v_now
    where id = p_work_order_line_id;

  elsif v_action in ('start','resume') then
    if v_status in ('completed','invoiced') then
      raise exception using errcode = 'P0001', message = 'Cannot start or resume a closed line.';
    end if;
    if v_status = 'awaiting_approval'
       and v_approval <> 'approved'
       and not coalesce(v_line.punchable, false) then
      raise exception using errcode = 'P0001', message = 'Line is awaiting approval and cannot be started.';
    end if;

    select *
      into v_shift
    from public.tech_shifts ts
    where ts.user_id = v_technician_profile_id
      and ts.shop_id = p_shop_id
      and ts.status::text = 'active'
      and ts.end_time is null
    order by ts.start_time desc, ts.id desc
    limit 1
    for update;
    if not found then
      if exists (
        select 1
        from public.tech_shifts ts
        where ts.user_id = v_technician_profile_id
          and ts.end_time is null
          and (ts.shop_id is null or ts.shop_id <> p_shop_id)
      ) then
        raise exception using errcode = 'P0001', message = 'SHIFT_SHOP_MISMATCH: an open shift exists outside this shop and cannot authorize job labor.';
      end if;
      raise exception using errcode = 'P0001', message = 'You need an active shift in this shop before starting job labor.';
    end if;

    if exists (
      select 1
      from public.work_order_line_labor_segments seg
      where seg.shop_id = p_shop_id
        and seg.technician_id = v_technician_profile_id
        and seg.work_order_line_id = p_work_order_line_id
        and seg.ended_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'Technician already has active labor on this line.';
    end if;

    if not p_allow_concurrent and exists (
      select 1
      from public.work_order_line_labor_segments seg
      where seg.shop_id = p_shop_id
        and seg.technician_id = v_technician_profile_id
        and seg.work_order_line_id <> p_work_order_line_id
        and seg.ended_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'Technician already has an active job punch.';
    end if;

    insert into public.work_order_line_technicians(
      work_order_line_id, technician_id, assigned_by
    ) values (
      p_work_order_line_id, v_technician_profile_id, v_actor_profile_id
    )
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by;

    update public.work_order_lines
    set assigned_tech_id = coalesce(assigned_tech_id, v_technician_profile_id),
        status = 'in_progress',
        hold_reason = null,
        updated_at = v_now
    where id = p_work_order_line_id;

    insert into public.work_order_line_labor_segments(
      shop_id, work_order_id, work_order_line_id, technician_id,
      created_by, started_at, source
    ) values (
      p_shop_id, v_line.work_order_id, p_work_order_line_id, v_technician_profile_id,
      v_actor_profile_id, v_now,
      coalesce(nullif(trim(p_start_source), ''), case when v_action = 'start' then 'job_start' else 'job_resume' end)
    ) returning id into v_segment_id;

  elsif v_action = 'pause' then
    if v_status in ('completed','invoiced') then
      raise exception using errcode = 'P0001', message = 'Cannot pause a closed line.';
    end if;

    update public.work_order_line_labor_segments
    set ended_at = v_now,
        pause_reason = case
          when p_preserve_line_status then coalesce(nullif(trim(p_hold_reason), ''), 'labor_pause')
          when nullif(trim(p_hold_reason), '') is not null then 'hold:' || trim(p_hold_reason)
          else 'hold'
        end
    where shop_id = p_shop_id
      and work_order_line_id = p_work_order_line_id
      and technician_id = v_technician_profile_id
      and ended_at is null;
    get diagnostics v_closed_count = row_count;

    update public.work_order_lines
    set status = case when p_preserve_line_status then status else 'on_hold' end,
        hold_reason = case
          when p_preserve_line_status then hold_reason
          else coalesce(nullif(trim(p_hold_reason), ''), 'Paused by technician')
        end,
        notes = case when p_preserve_line_status then notes else coalesce(p_notes, notes) end,
        updated_at = v_now
    where id = p_work_order_line_id;

  else
    if v_status = 'invoiced' then
      raise exception using errcode = 'P0001', message = 'Cannot finish an invoiced line.';
    end if;

    v_final_cause := coalesce(nullif(trim(p_cause), ''), nullif(trim(v_line.cause), ''));
    v_final_correction := coalesce(nullif(trim(p_correction), ''), nullif(trim(v_line.correction), ''));
    if v_final_cause is null then
      raise exception using errcode = 'P0001', message = 'Cause is required before finishing this job.';
    end if;
    if v_final_correction is null then
      raise exception using errcode = 'P0001', message = 'Correction is required before finishing this job.';
    end if;
    if coalesce(v_line.labor_time, 0) <= 0 then
      raise exception using errcode = 'P0001', message = 'Labor time must be greater than 0 before finishing this job.';
    end if;

    perform 1
    from public.inspections i
    where i.work_order_line_id = p_work_order_line_id
    for update;

    if exists (
      select 1
      from public.inspections i
      where i.work_order_line_id = p_work_order_line_id
        and (
          not coalesce(i.completed, false)
          or coalesce(i.is_draft, true)
          or not coalesce(i.locked, false)
          or lower(coalesce(i.status, 'draft')) not in ('completed', 'finalized', 'signed')
          or i.finalized_at is null
          or i.finalized_by is null
          or not exists (
            select 1
            from public.inspection_signatures s
            where s.inspection_id = i.id
              and s.signing_cycle = coalesce(i.signing_cycle, 0)
          )
        )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'INSPECTION_COMPLETION_REQUIRED: complete and sign the inspection before finishing this job.';
    end if;

    update public.work_order_line_labor_segments
    set ended_at = v_now,
        pause_reason = 'completed'
    where shop_id = p_shop_id
      and work_order_line_id = p_work_order_line_id
      and technician_id = v_technician_profile_id
      and ended_at is null;
    get diagnostics v_closed_count = row_count;

    -- The completed-line constraint is immediate. Persist the punch timeline in
    -- the same row update that changes status so no invalid intermediate row
    -- can be observed by PostgreSQL.
    update public.work_order_lines
    set status = 'completed',
        cause = v_final_cause,
        correction = v_final_correction,
        hold_reason = null,
        punched_in_at = coalesce(
          (
            select min(seg.started_at)
            from public.work_order_line_labor_segments seg
            where seg.work_order_line_id = p_work_order_line_id
          ),
          v_line.punched_in_at
        ),
        punched_out_at = coalesce(
          (
            select max(seg.ended_at)
            from public.work_order_line_labor_segments seg
            where seg.work_order_line_id = p_work_order_line_id
              and seg.ended_at is not null
          ),
          v_line.punched_out_at,
          v_now
        ),
        updated_at = v_now
    where id = p_work_order_line_id;

  end if;

  select min(seg.started_at),
         max(seg.ended_at) filter (where seg.ended_at is not null),
         bool_or(seg.ended_at is null)
    into v_earliest, v_latest, v_has_open
  from public.work_order_line_labor_segments seg
  where seg.work_order_line_id = p_work_order_line_id;

  update public.work_order_lines
  set punched_in_at = coalesce(v_earliest, punched_in_at),
      punched_out_at = case
        when v_action = 'finish' then coalesce(v_latest, punched_out_at, v_now)
        when coalesce(v_has_open, false) then null
        else v_latest
      end,
      updated_at = v_now
  where id = p_work_order_line_id;

  select jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action', v_action,
    'shop_id', p_shop_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'technician_id', v_technician_profile_id,
    'shift_id', v_shift.id,
    'labor_segment_id', v_segment_id,
    'closed_segment_count', v_closed_count,
    'line', (
      select to_jsonb(wol)
      from public.work_order_lines wol
      where wol.id = p_work_order_line_id
    )
  ) into v_result;

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    coalesce(nullif(trim(p_event), ''), v_action),
    v_actor_auth_user_id,
    v_now,
    'work_order_line',
    p_work_order_line_id,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
      'shop_id', p_shop_id,
      'work_order_id', v_line.work_order_id,
      'technician_id', v_technician_profile_id,
      'shift_id', v_shift.id,
      'operation_key', p_operation_key
    )
  );

  insert into public.workforce_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id,
    work_order_id, work_order_line_id, result
  ) values (
    p_shop_id, 'job_punch:' || v_action, p_operation_key, v_actor_auth_user_id,
    v_line.work_order_id, p_work_order_line_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) from public, anon;
grant execute on function public.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) to authenticated, service_role;


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
        or v_existing_actor_id is distinct from p_auth_user_id
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
          or wok.actor_user_id is distinct from p_auth_user_id
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
      if v_existing_actor_id is distinct from p_auth_user_id
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
      p_actor_user_id => p_auth_user_id,
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
      p_actor_user_id => p_auth_user_id,
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
      p_actor_user_id => p_auth_user_id,
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
      p_actor_user_id => p_auth_user_id,
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
    and v_session.status <> 'closed'
    and not copilot.technician_is_assigned(
      p_auth_user_id,
      v_profile_id,
      v_session.shop_id,
      v_session.work_order_id,
      null
    )
    and not copilot.technician_has_bound_completion_receipt(
      p_auth_user_id,
      v_session.id,
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
  ) and not (
    p_event_type in ('action.completed', 'conversation.assistant')
    and copilot.technician_has_bound_completion_receipt(
      p_auth_user_id,
      p_session_id,
      nullif(btrim(p_details ->> 'turnId'), '')
    )
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

create or replace function copilot.technician_session_close_internal(
  p_auth_user_id uuid,
  p_session_id uuid,
  p_operation_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_profile_id uuid;
  v_session copilot.repair_sessions%rowtype;
  v_existing_session_id uuid;
  v_event jsonb;
begin
  if p_operation_id is null then
    raise exception 'copilot_operation_id_required' using errcode = '22023';
  end if;

  v_profile_id := copilot.technician_profile_id(p_auth_user_id);
  perform pg_advisory_xact_lock(
    hashtextextended('copilot:technician:' || v_profile_id::text, 0)
  );

  select rs.*
    into v_session
  from copilot.repair_sessions rs
  where rs.id = p_session_id
    and rs.technician_id = v_profile_id
  for update;

  if not found then
    raise exception 'copilot_session_not_found' using errcode = 'P0001';
  end if;

  select e.repair_session_id
    into v_existing_session_id
  from copilot.repair_session_event_context c
  join copilot.repair_session_events e on e.id = c.event_id
  where c.operation_id = p_operation_id;

  if found then
    if v_existing_session_id is distinct from p_session_id then
      raise exception 'copilot_operation_id_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'sessionId', p_session_id,
      'status', v_session.status,
      'replayed', true
    );
  end if;

  if v_session.status = 'closed' then
    return jsonb_build_object(
      'sessionId', p_session_id,
      'status', 'closed',
      'replayed', true
    );
  end if;

  if v_session.status <> 'active' then
    raise exception 'copilot_session_not_active' using errcode = '55000';
  end if;

  if not copilot.technician_is_assigned(
    p_auth_user_id,
    v_profile_id,
    v_session.shop_id,
    v_session.work_order_id,
    null
  ) and not copilot.technician_has_bound_completion_receipt(
    p_auth_user_id,
    p_session_id,
    null
  ) then
    raise exception 'copilot_work_order_assignment_required'
      using errcode = '42501';
  end if;

  v_event := copilot.append_repair_event_internal(
    p_session_id,
    v_session.shop_id,
    v_profile_id,
    'session.closed',
    'system',
    p_operation_id,
    jsonb_build_object(
      'reason',
      coalesce(nullif(btrim(p_reason), ''), 'completed')
    ),
    now()
  );

  update copilot.repair_sessions
  set status = 'closed',
      active_work_order_line_id = null,
      ended_at = now(),
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'sessionId', p_session_id,
    'status', 'closed',
    'replayed', coalesce((v_event ->> 'replayed')::boolean, false)
  );
end;
$$;

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
      when 'session.close' then
        v_result := copilot.technician_session_close_internal(
          v_auth_user_id,
          (new.payload ->> 'sessionId')::uuid,
          (new.payload ->> 'operationId')::uuid,
          nullif(new.payload ->> 'reason', '')
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

revoke all on function copilot.technician_has_bound_completion_receipt(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function copilot.technician_session_read_internal(
  uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function copilot.technician_event_append_internal(
  uuid, uuid, text, text, uuid, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function copilot.technician_session_close_internal(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

comment on function copilot.technician_session_close_internal(
  uuid, uuid, uuid, text
) is
  'Closes one owned active repair session after assignment ends only when a bound canonical completion receipt exists.';

do $technician_completion_integrity_postcheck$
declare
  v_finish_definition text;
  v_action_definition text;
  v_read_definition text;
  v_event_definition text;
  v_close_definition text;
  v_command_definition text;
begin
  select pg_get_functiondef(
    'public.apply_job_punch_transition_atomic(uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,boolean,boolean,text,text,text,jsonb)'::regprocedure
  ) into v_finish_definition;
  select pg_get_functiondef(
    'copilot.technician_job_action_internal(uuid,uuid,uuid,text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_action_definition;
  select pg_get_functiondef(
    'copilot.technician_session_read_internal(uuid,uuid)'::regprocedure
  ) into v_read_definition;
  select pg_get_functiondef(
    'copilot.technician_event_append_internal(uuid,uuid,text,text,uuid,jsonb,timestamptz)'::regprocedure
  ) into v_event_definition;
  select pg_get_functiondef(
    'copilot.technician_session_close_internal(uuid,uuid,uuid,text)'::regprocedure
  ) into v_close_definition;
  select pg_get_functiondef(
    'copilot.process_ai_action_command()'::regprocedure
  ) into v_command_definition;

  if position('INSPECTION_COMPLETION_REQUIRED' in v_finish_definition) = 0
    or position('update public.inspections' in v_finish_definition) > 0
    or position('v_actor_auth_user_id' in v_finish_definition) = 0
    or position('p_actor_user_id => p_auth_user_id' in v_action_definition) = 0
    or position('technician_has_bound_completion_receipt' in v_read_definition) = 0
    or position('technician_has_bound_completion_receipt' in v_event_definition) = 0
    or position('session.closed' in v_close_definition) = 0
    or position('when ''session.close''' in v_command_definition) = 0
  then
    raise exception 'Technician completion-integrity runtime is incomplete';
  end if;

  if has_function_privilege(
    'authenticated',
    'copilot.technician_session_close_internal(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'copilot.technician_session_close_internal(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Technician completion session close has an unsafe direct grant';
  end if;
end
$technician_completion_integrity_postcheck$;

notify pgrst, 'reload schema';

commit;
