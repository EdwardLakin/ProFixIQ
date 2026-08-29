begin;

alter table public.work_orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid;

create index if not exists work_orders_shop_archived_at_idx
  on public.work_orders (shop_id, archived_at desc)
  where archived_at is not null;

create or replace function public.archive_work_order_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_work_order public.work_orders%rowtype;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_actor_auth_user_id uuid;
  v_now timestamptz := coalesce(p_at, now());
begin
  select p.id,
         lower(trim(coalesce(p.role, ''))),
         coalesce(p.user_id, p.id)
    into v_actor_profile_id, v_actor_role, v_actor_auth_user_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found
    or v_actor_auth_user_id is distinct from p_actor_user_id
    or not exists (select 1 from auth.users u where u.id = v_actor_auth_user_id)
    or (auth.uid() is not null and auth.uid() is distinct from v_actor_auth_user_id)
  then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_FORBIDDEN: actor is not available for this shop.';
  end if;

  if v_actor_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor',
    'service advisor', 'lead_hand', 'leadhand', 'lead hand', 'lead', 'foreman'
  ) then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_FORBIDDEN: actor cannot manage work orders.';
  end if;

  select *
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_NOT_FOUND: work order not found for shop.';
  end if;

  if v_work_order.archived_at is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'archived', true,
      'work_order_id', v_work_order.id,
      'customer_id', v_work_order.customer_id,
      'archived_at', v_work_order.archived_at,
      'archived_by_user_id', v_work_order.archived_by_user_id
    );
  end if;

  if lower(trim(coalesce(v_work_order.record_type, ''))) = 'estimate' then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_ESTIMATE: estimates cannot be archived through the work-order action.';
  end if;

  if v_work_order.source_fleet_service_request_id is not null then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_FLEET_LINKED: close or cancel the linked Fleet service request through the Fleet workflow.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id)
     or lower(trim(coalesce(v_work_order.status, ''))) = 'invoiced'
  then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_FINANCIALLY_LOCKED: this work order is financially locked.';
  end if;

  perform 1
  from public.service_visits sv
  where sv.shop_id = p_shop_id
    and sv.work_order_id = p_work_order_id
    and coalesce(lower(trim(sv.status)), '') not in ('completed', 'cancelled', 'canceled')
    and sv.completed_at is null
    and sv.cancelled_at is null
  for update;

  if found then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_ACTIVE_SERVICE_VISIT: close or cancel the active Service Visit before archiving this work order.';
  end if;

  perform 1
  from public.work_order_line_labor_segments seg
  where seg.shop_id = p_shop_id
    and seg.work_order_id = p_work_order_id
    and seg.ended_at is null
  for update;

  if found then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_ACTIVE_LABOR: end active labor before archiving this work order.';
  end if;

  update public.work_orders
  set archived_at = v_now,
      archived_by_user_id = v_actor_auth_user_id,
      updated_at = v_now
  where id = p_work_order_id
    and shop_id = p_shop_id;

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'work_order_archived',
    v_actor_auth_user_id,
    v_now,
    'work_orders',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'status_preserved', v_work_order.status,
      'customer_id', v_work_order.customer_id,
      'vehicle_id', v_work_order.vehicle_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'archived', true,
    'work_order_id', p_work_order_id,
    'customer_id', v_work_order.customer_id,
    'archived_at', v_now,
    'archived_by_user_id', v_actor_auth_user_id
  );
end;
$function$;

revoke all on function public.archive_work_order_atomic(uuid, uuid, uuid, timestamptz) from public;
revoke all on function public.archive_work_order_atomic(uuid, uuid, uuid, timestamptz) from anon;
grant execute on function public.archive_work_order_atomic(uuid, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.archive_work_order_atomic(uuid, uuid, uuid, timestamptz) to service_role;

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
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_line public.work_order_lines%rowtype;
  v_work_order public.work_orders%rowtype;
  v_shift public.tech_shifts%rowtype;
  v_status text;
  v_approval text;
  v_action text := lower(trim(coalesce(p_action, ''));
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
    or not exists (select 1 from auth.users u where u.id = v_actor_auth_user_id)
    or (auth.uid() is not null and auth.uid() is distinct from v_actor_auth_user_id)
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

  select *
    into v_work_order
  from public.work_orders wo
  where wo.id = v_line.work_order_id
    and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Parent work order not found for shop.';
  end if;
  if v_action in ('start','resume') and v_work_order.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_ARCHIVED: archived work orders cannot start or resume labor.';
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
    set status = 'awaiting', hold_reason = null, updated_at = v_now
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
        select 1 from public.tech_shifts ts
        where ts.user_id = v_technician_profile_id
          and ts.end_time is null
          and (ts.shop_id is null or ts.shop_id <> p_shop_id)
      ) then
        raise exception using errcode = 'P0001', message = 'SHIFT_SHOP_MISMATCH: an open shift exists outside this shop and cannot authorize job labor.';
      end if;
      raise exception using errcode = 'P0001', message = 'You need an active shift in this shop before starting job labor.';
    end if;

    if exists (
      select 1 from public.work_order_line_labor_segments seg
      where seg.shop_id = p_shop_id
        and seg.technician_id = v_technician_profile_id
        and seg.work_order_line_id = p_work_order_line_id
        and seg.ended_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'Technician already has active labor on this line.';
    end if;

    if not p_allow_concurrent and exists (
      select 1 from public.work_order_line_labor_segments seg
      where seg.shop_id = p_shop_id
        and seg.technician_id = v_technician_profile_id
        and seg.work_order_line_id <> p_work_order_line_id
        and seg.ended_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'Technician already has an active job punch.';
    end if;

    insert into public.work_order_line_technicians(work_order_line_id, technician_id, assigned_by)
    values (p_work_order_line_id, v_technician_profile_id, v_actor_profile_id)
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by;

    update public.work_order_lines
    set assigned_tech_id = coalesce(assigned_tech_id, v_technician_profile_id),
        status = 'in_progress', hold_reason = null, updated_at = v_now
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
      and i.is_canonical
    for update;

    if exists (
      select 1
      from public.inspections i
      where i.work_order_line_id = p_work_order_line_id
        and i.is_canonical
        and (
          not coalesce(i.completed, false)
          or coalesce(i.is_draft, true)
          or not coalesce(i.locked, false)
          or lower(coalesce(i.status, 'draft')) not in ('completed', 'finalized', 'signed')
          or i.finalized_at is null
          or i.finalized_by is null
          or not exists (
            select 1 from public.inspection_signatures s
            where s.inspection_id = i.id
              and s.signing_cycle = coalesce(i.signing_cycle, 0)
          )
        )
    ) then
      raise exception using errcode = 'P0001', message = 'INSPECTION_COMPLETION_REQUIRED: complete and sign the inspection before finishing this job.';
    end if;

    update public.work_order_line_labor_segments
    set ended_at = v_now, pause_reason = 'completed'
    where shop_id = p_shop_id
      and work_order_line_id = p_work_order_line_id
      and technician_id = v_technician_profile_id
      and ended_at is null;
    get diagnostics v_closed_count = row_count;

    update public.work_order_lines
    set status = 'completed',
        cause = v_final_cause,
        correction = v_final_correction,
        hold_reason = null,
        punched_in_at = coalesce((select min(seg.started_at) from public.work_order_line_labor_segments seg where seg.work_order_line_id = p_work_order_line_id), v_line.punched_in_at),
        punched_out_at = coalesce((select max(seg.ended_at) from public.work_order_line_labor_segments seg where seg.work_order_line_id = p_work_order_line_id and seg.ended_at is not null), v_line.punched_out_at, v_now),
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
    'line', (select to_jsonb(wol) from public.work_order_lines wol where wol.id = p_work_order_line_id)
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
$function$;

commit;
