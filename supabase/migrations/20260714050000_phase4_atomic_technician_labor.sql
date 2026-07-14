begin;

create table if not exists public.workforce_operation_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  operation_name text not null,
  operation_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  work_order_line_id uuid references public.work_order_lines(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, operation_name, operation_key)
);

create index if not exists workforce_operation_keys_line_idx
  on public.workforce_operation_keys(shop_id, work_order_line_id, created_at desc);

alter table public.workforce_operation_keys enable row level security;

drop policy if exists workforce_operation_keys_shop_select on public.workforce_operation_keys;
create policy workforce_operation_keys_shop_select
  on public.workforce_operation_keys
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = workforce_operation_keys.shop_id
    )
  );

create or replace function public.assign_work_order_line_technician_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_technician_id uuid,
  p_assigned_by uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_role text;
  v_existing jsonb;
  v_result jsonb;
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select wok.result
    into v_existing
  from public.workforce_operation_keys wok
  where wok.shop_id = p_shop_id
    and wok.operation_name = 'assign_line_technician'
    and wok.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  perform 1
  from public.profiles p
  where p.id = p_assigned_by
    and p.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Assigning user is not available for this shop.';
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
  if coalesce(v_line.line_type::text, 'job') = 'info' then
    raise exception using errcode = 'P0001', message = 'Info lines cannot be technician-assigned.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, v_line.work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: assignment cannot change after invoice finalization.';
  end if;

  select lower(coalesce(p.role::text, ''))
    into v_role
  from public.profiles p
  where p.id = p_technician_id
    and p.shop_id = p_shop_id
  for update;
  if not found or v_role not in ('mechanic','tech','technician','foreman','lead_hand','lead hand','leadhand') then
    raise exception using errcode = 'P0001', message = 'Technician is not assignable for this shop.';
  end if;

  insert into public.work_order_line_technicians(
    work_order_line_id,
    technician_id,
    assigned_by
  ) values (
    p_work_order_line_id,
    p_technician_id,
    p_assigned_by
  )
  on conflict (work_order_line_id, technician_id)
  do update set assigned_by = excluded.assigned_by;

  update public.work_order_lines
  set assigned_tech_id = p_technician_id,
      updated_at = now()
  where id = p_work_order_line_id
    and shop_id = p_shop_id;

  select jsonb_build_object(
    'ok', true,
    'shop_id', p_shop_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'primary_technician_id', p_technician_id,
    'technician_ids', coalesce(
      (
        select jsonb_agg(wolt.technician_id order by wolt.technician_id)
        from public.work_order_line_technicians wolt
        where wolt.work_order_line_id = p_work_order_line_id
      ),
      '[]'::jsonb
    ),
    'assignment_mode', 'additive_multi_tech_primary_mirror',
    'idempotent', false
  ) into v_result;

  insert into public.workforce_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id,
    work_order_id, work_order_line_id, result
  ) values (
    p_shop_id, 'assign_line_technician', p_operation_key, p_assigned_by,
    v_line.work_order_id, p_work_order_line_id, v_result
  );

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'technician_assigned', p_assigned_by, now(), 'work_order_line', p_work_order_line_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'work_order_id', v_line.work_order_id,
      'technician_id', p_technician_id,
      'assignment_mode', 'additive_multi_tech_primary_mirror'
    )
  );

  return v_result;
end;
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
begin
  if v_action not in ('start','resume','pause','finish') then
    raise exception using errcode = 'P0001', message = 'Unsupported job punch action.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select wok.result
    into v_existing
  from public.workforce_operation_keys wok
  where wok.shop_id = p_shop_id
    and wok.operation_name = 'job_punch:' || v_action
    and wok.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  perform 1
  from public.profiles p
  where p.id = p_actor_user_id
    and p.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Actor is not available for this shop.';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_technician_id
    and p.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Technician is not available for this shop.';
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
      or (seg.technician_id = p_technician_id and seg.ended_at is null)
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
    where ts.user_id = p_technician_id
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
        where ts.user_id = p_technician_id
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
        and seg.technician_id = p_technician_id
        and seg.work_order_line_id = p_work_order_line_id
        and seg.ended_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'Technician already has active labor on this line.';
    end if;

    if not p_allow_concurrent and exists (
      select 1
      from public.work_order_line_labor_segments seg
      where seg.shop_id = p_shop_id
        and seg.technician_id = p_technician_id
        and seg.work_order_line_id <> p_work_order_line_id
        and seg.ended_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'Technician already has an active job punch.';
    end if;

    insert into public.work_order_line_technicians(
      work_order_line_id, technician_id, assigned_by
    ) values (
      p_work_order_line_id, p_technician_id, p_actor_user_id
    )
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by;

    update public.work_order_lines
    set assigned_tech_id = coalesce(assigned_tech_id, p_technician_id),
        status = 'in_progress',
        hold_reason = null,
        updated_at = v_now
    where id = p_work_order_line_id;

    insert into public.work_order_line_labor_segments(
      shop_id, work_order_id, work_order_line_id, technician_id,
      created_by, started_at, source
    ) values (
      p_shop_id, v_line.work_order_id, p_work_order_line_id, p_technician_id,
      p_actor_user_id, v_now,
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
      and technician_id = p_technician_id
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

    update public.work_order_line_labor_segments
    set ended_at = v_now,
        pause_reason = 'completed'
    where shop_id = p_shop_id
      and work_order_line_id = p_work_order_line_id
      and technician_id = p_technician_id
      and ended_at is null;
    get diagnostics v_closed_count = row_count;

    update public.work_order_lines
    set status = 'completed',
        cause = v_final_cause,
        correction = v_final_correction,
        hold_reason = null,
        updated_at = v_now
    where id = p_work_order_line_id;

    update public.inspections
    set completed = true,
        is_draft = false,
        locked = true,
        status = 'completed',
        finalized_at = v_now,
        finalized_by = p_technician_id,
        updated_at = v_now
    where work_order_line_id = p_work_order_line_id;
  end if;

  select min(seg.started_at),
         max(seg.ended_at) filter (where seg.ended_at is not null),
         bool_or(seg.ended_at is null)
    into v_earliest, v_latest, v_has_open
  from public.work_order_line_labor_segments seg
  where seg.work_order_line_id = p_work_order_line_id;

  update public.work_order_lines
  set punched_in_at = v_earliest,
      punched_out_at = case when coalesce(v_has_open, false) then null else v_latest end,
      updated_at = v_now
  where id = p_work_order_line_id;

  select jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action', v_action,
    'shop_id', p_shop_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'technician_id', p_technician_id,
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
    p_actor_user_id,
    v_now,
    'work_order_line',
    p_work_order_line_id,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
      'shop_id', p_shop_id,
      'work_order_id', v_line.work_order_id,
      'technician_id', p_technician_id,
      'shift_id', v_shift.id,
      'operation_key', p_operation_key
    )
  );

  insert into public.workforce_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id,
    work_order_id, work_order_line_id, result
  ) values (
    p_shop_id, 'job_punch:' || v_action, p_operation_key, p_actor_user_id,
    v_line.work_order_id, p_work_order_line_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.assign_work_order_line_technician_atomic(uuid,uuid,uuid,uuid,text) from public, anon;
revoke all on function public.apply_job_punch_transition_atomic(uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,boolean,boolean,text,text,text,jsonb) from public, anon;
grant execute on function public.assign_work_order_line_technician_atomic(uuid,uuid,uuid,uuid,text) to authenticated, service_role;
grant execute on function public.apply_job_punch_transition_atomic(uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,boolean,boolean,text,text,text,jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
