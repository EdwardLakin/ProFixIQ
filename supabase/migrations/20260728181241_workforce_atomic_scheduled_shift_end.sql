begin;

create or replace function public.complete_scheduled_shift_end_atomic(
  p_shift_id uuid,
  p_shop_id uuid,
  p_user_id uuid,
  p_scheduled_end timestamptz,
  p_execution_time timestamptz default now(),
  p_schedule_source text default 'schedule',
  p_schedule_date date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.tech_shifts%rowtype;
  v_latest_event_type text;
  v_latest_event_at timestamptz;
  v_effective_end timestamptz;
  v_line_id uuid;
  v_transition jsonb;
  v_transitions jsonb := '[]'::jsonb;
  v_closed_line_count integer := 0;
  v_cancelled_resume_count integer := 0;
  v_auto_close_event public.punch_events%rowtype;
  v_end_event public.punch_events%rowtype;
  v_inserted_events jsonb := '[]'::jsonb;
begin
  if p_scheduled_end is null or p_execution_time is null then
    raise exception using
      errcode = 'P0001',
      message = 'Scheduled end and execution time are required.';
  end if;
  if p_scheduled_end > p_execution_time then
    raise exception using
      errcode = 'P0001',
      message = 'Scheduled end has not been reached.';
  end if;

  -- This row lock is shared with job start/resume. Once acquired, no new labor
  -- can race between the labor scan and shift completion.
  perform 1
  from public.profiles p
  where p.id = p_user_id
    and p.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Employee is not available for this shop.';
  end if;

  select *
  into v_shift
  from public.tech_shifts ts
  where ts.id = p_shift_id
    and ts.shop_id = p_shop_id
    and ts.user_id = p_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Shift was not found for this shop and employee.';
  end if;

  if v_shift.status <> 'active' or v_shift.end_time is not null then
    return jsonb_build_object(
      'ok', true,
      'closed', false,
      'idempotent', true,
      'shift_id', v_shift.id,
      'end_time', v_shift.end_time
    );
  end if;

  perform 1
  from public.work_order_line_labor_segments seg
  where seg.shop_id = p_shop_id
    and seg.technician_id = p_user_id
    and seg.ended_at is null
  for update;

  select pe.event_type, pe.timestamp
  into v_latest_event_type, v_latest_event_at
  from public.punch_events pe
  where pe.shift_id = v_shift.id
    and pe.event_type in (
      'start_shift',
      'break_start',
      'break_end',
      'lunch_start',
      'lunch_end',
      'end_shift'
    )
  order by pe.timestamp desc, pe.created_at desc nulls last, pe.id desc
  limit 1;

  select greatest(
    p_scheduled_end,
    v_shift.start_time,
    coalesce(v_latest_event_at, v_shift.start_time),
    coalesce(
      max(seg.started_at) filter (where seg.ended_at is null),
      v_shift.start_time
    )
  )
  into v_effective_end
  from public.work_order_line_labor_segments seg
  where seg.shop_id = p_shop_id
    and seg.technician_id = p_user_id;

  if v_effective_end > p_execution_time then
    raise exception using
      errcode = 'P0001',
      message = 'Active shift or labor contains a future start timestamp.';
  end if;

  for v_line_id in
    select distinct seg.work_order_line_id
    from public.work_order_line_labor_segments seg
    where seg.shop_id = p_shop_id
      and seg.technician_id = p_user_id
      and seg.ended_at is null
      and seg.work_order_line_id is not null
    order by seg.work_order_line_id
  loop
    v_transition := public.apply_job_punch_transition_atomic(
      p_shop_id,
      v_line_id,
      'pause',
      p_user_id,
      p_user_id,
      concat(
        'scheduled-shift-end:',
        v_shift.id::text,
        ':',
        v_line_id::text,
        ':',
        extract(epoch from p_scheduled_end)::text
      ),
      true,
      v_effective_end,
      null,
      'scheduled_shift_end',
      null,
      true,
      false,
      null,
      null,
      'job_stopped_at_scheduled_end_day',
      jsonb_build_object(
        'shift_id', v_shift.id,
        'schedule_source', coalesce(nullif(trim(p_schedule_source), ''), 'schedule'),
        'schedule_date', p_schedule_date,
        'scheduled_end', p_scheduled_end,
        'effective_end', v_effective_end,
        'automatic', true
      )
    );
    v_transitions := v_transitions || jsonb_build_array(v_transition);
    v_closed_line_count := v_closed_line_count + 1;
  end loop;

  update public.workforce_job_resume_contexts
  set status = 'cancelled',
      cancelled_at = v_effective_end,
      cancel_reason = 'scheduled_shift_ended',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'automatic', true,
        'scheduled_end', p_scheduled_end,
        'effective_end', v_effective_end
      ),
      updated_at = p_execution_time
  where shop_id = p_shop_id
    and user_id = p_user_id
    and status = 'pending';
  get diagnostics v_cancelled_resume_count = row_count;

  if v_latest_event_type = 'break_start' then
    insert into public.punch_events (
      shift_id, user_id, profile_id, event_type, timestamp, note
    ) values (
      v_shift.id,
      p_user_id,
      p_user_id,
      'break_end',
      v_effective_end,
      'Automatic scheduled shift end'
    )
    returning * into v_auto_close_event;
  elsif v_latest_event_type = 'lunch_start' then
    insert into public.punch_events (
      shift_id, user_id, profile_id, event_type, timestamp, note
    ) values (
      v_shift.id,
      p_user_id,
      p_user_id,
      'lunch_end',
      v_effective_end,
      'Automatic scheduled shift end'
    )
    returning * into v_auto_close_event;
  end if;

  if v_auto_close_event.id is not null then
    v_inserted_events := v_inserted_events || jsonb_build_array(
      jsonb_build_object(
        'id', v_auto_close_event.id,
        'event_type', v_auto_close_event.event_type,
        'timestamp', v_auto_close_event.timestamp
      )
    );
  end if;

  insert into public.punch_events (
    shift_id, user_id, profile_id, event_type, timestamp, note
  ) values (
    v_shift.id,
    p_user_id,
    p_user_id,
    'end_shift',
    v_effective_end + interval '1 microsecond',
    concat(
      'automatic:scheduled_shift_end; source=',
      coalesce(nullif(trim(p_schedule_source), ''), 'schedule'),
      '; schedule_date=',
      coalesce(p_schedule_date::text, 'unknown')
    )
  )
  returning * into v_end_event;

  v_inserted_events := v_inserted_events || jsonb_build_array(
    jsonb_build_object(
      'id', v_end_event.id,
      'event_type', v_end_event.event_type,
      'timestamp', v_end_event.timestamp,
      'note', v_end_event.note
    )
  );

  update public.tech_shifts
  set status = 'completed',
      end_time = v_effective_end,
      type = 'shift'
  where id = v_shift.id;

  return jsonb_build_object(
    'ok', true,
    'closed', true,
    'idempotent', false,
    'shift_id', v_shift.id,
    'scheduled_end', p_scheduled_end,
    'effective_end', v_effective_end,
    'closed_line_count', v_closed_line_count,
    'cancelled_resume_count', v_cancelled_resume_count,
    'transitions', v_transitions,
    'inserted_events', v_inserted_events
  );
end;
$$;

revoke all on function public.complete_scheduled_shift_end_atomic(
  uuid, uuid, uuid, timestamptz, timestamptz, text, date
) from public, anon, authenticated;
grant execute on function public.complete_scheduled_shift_end_atomic(
  uuid, uuid, uuid, timestamptz, timestamptz, text, date
) to service_role;

notify pgrst, 'reload schema';

commit;
