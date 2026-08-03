-- Keep corrected timecard boundaries and punch evidence synchronized.
--
-- The original correction function appended replacement start/end events,
-- leaving multiple boundary punches on one shift. This version updates the
-- canonical boundary events, removes only synthetic duplicates created by the
-- old correction path, uses shop-local payroll dates, and protects every
-- affected locked period before changing attendance.

create or replace function public.apply_shift_correction(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_target_user_id uuid,
  p_shift_id uuid,
  p_correction_type text,
  p_corrected_start_time timestamptz,
  p_corrected_end_time timestamptz,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_shift public.tech_shifts%rowtype;
  v_new_shift public.tech_shifts%rowtype;
  v_original jsonb := '{}'::jsonb;
  v_corrected jsonb := '{}'::jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_original_start timestamptz;
  v_original_end timestamptz;
  v_scope_start_date date;
  v_scope_end_date date;
  v_correction_id uuid;
  v_start_punch_id uuid;
  v_end_punch_id uuid;
  v_shop_timezone text := 'UTC';
  v_payroll_status text := 'not_required';
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_target_user_id is null then
    raise exception 'Shop, actor, and employee are required';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A correction reason of at least 3 characters is required';
  end if;
  if length(trim(p_reason)) > 1000 then
    raise exception 'Correction reason must be 1000 characters or fewer';
  end if;
  if p_correction_type not in (
    'create_missing_shift',
    'adjust_start',
    'adjust_end',
    'adjust_start_and_end',
    'void_shift'
  ) then
    raise exception 'Unsupported correction type';
  end if;

  select *
  into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id;

  if not found
     or lower(coalesce(v_actor.role::text, '')) not in (
       'owner',
       'admin',
       'manager'
     ) then
    raise exception 'Forbidden';
  end if;
  if auth.uid() is not null
     and auth.uid() <> v_actor.id
     and auth.uid() is distinct from v_actor.user_id then
    raise exception 'Actor identity mismatch';
  end if;
  if p_actor_profile_id = p_target_user_id
     and lower(coalesce(v_actor.role::text, '')) <> 'owner' then
    raise exception
      'Only an owner can apply an audited correction to their own shift';
  end if;

  select *
  into v_target
  from public.profiles profile
  where profile.id = p_target_user_id
    and profile.shop_id = p_shop_id;
  if not found then
    raise exception 'Target employee is not in this shop';
  end if;

  select coalesce(shop.timezone, 'UTC')
  into v_shop_timezone
  from public.shops shop
  where shop.id = p_shop_id;
  if not found then
    raise exception 'Shop not found';
  end if;

  if p_correction_type = 'create_missing_shift' then
    v_start := p_corrected_start_time;
    v_end := p_corrected_end_time;
    if v_start is null or v_end is null or v_end <= v_start then
      raise exception 'Corrected shift interval is invalid';
    end if;
    v_scope_start_date := (v_start at time zone v_shop_timezone)::date;
    v_scope_end_date := (v_end at time zone v_shop_timezone)::date;
  else
    select *
    into v_shift
    from public.tech_shifts shift_row
    where shift_row.id = p_shift_id
      and shift_row.shop_id = p_shop_id
      and shift_row.user_id = p_target_user_id
    for update;

    if not found then
      raise exception 'Shift not found for target employee in shop';
    end if;

    v_original := to_jsonb(v_shift);
    v_original_start := v_shift.start_time;
    v_original_end := v_shift.end_time;
    v_start := coalesce(p_corrected_start_time, v_shift.start_time);
    v_end := coalesce(p_corrected_end_time, v_shift.end_time);

    if p_correction_type = 'void_shift'
       and v_shift.end_time is null then
      raise exception 'End the active shift before voiding its timecard';
    end if;

    v_scope_start_date := (
      least(v_original_start, v_start) at time zone v_shop_timezone
    )::date;
    v_scope_end_date := (
      greatest(
        coalesce(v_original_end, v_original_start),
        coalesce(v_end, v_start)
      ) at time zone v_shop_timezone
    )::date;
  end if;

  if exists (
    select 1
    from public.payroll_pay_periods period
    where period.shop_id = p_shop_id
      and period.status in ('approved', 'exported')
      and period.period_start <= v_scope_end_date
      and period.period_end >= v_scope_start_date
  ) then
    raise exception
      'Approved/exported payroll periods are locked; reopen before correcting attendance';
  end if;

  if p_correction_type = 'create_missing_shift' then
    if exists (
      select 1
      from public.tech_shifts other
      where other.shop_id = p_shop_id
        and other.user_id = p_target_user_id
        and coalesce(other.excluded_from_payroll, false) = false
        and tstzrange(
          other.start_time,
          coalesce(other.end_time, 'infinity'::timestamptz),
          '[)'
        ) && tstzrange(v_start, v_end, '[)')
    ) then
      raise exception 'Corrected shift overlaps another non-voided shift';
    end if;

    insert into public.tech_shifts (
      shop_id,
      user_id,
      status,
      type,
      start_time,
      end_time,
      excluded_from_payroll
    ) values (
      p_shop_id,
      p_target_user_id,
      'completed',
      'shift',
      v_start,
      v_end,
      false
    )
    returning * into v_new_shift;

    insert into public.punch_events (
      shift_id,
      user_id,
      profile_id,
      event_type,
      timestamp,
      note
    ) values
      (
        v_new_shift.id,
        p_target_user_id,
        p_target_user_id,
        'start_shift',
        v_start,
        'Admin correction: missing shift start'
      ),
      (
        v_new_shift.id,
        p_target_user_id,
        p_target_user_id,
        'end_shift',
        v_end,
        'Admin correction: missing shift end'
      );

    p_shift_id := v_new_shift.id;
    v_corrected := jsonb_build_object(
      'shift_id', p_shift_id,
      'start_time', v_start,
      'end_time', v_end,
      'status', 'completed',
      'excluded_from_payroll', false
    );
  elsif p_correction_type = 'void_shift' then
    update public.tech_shifts
    set excluded_from_payroll = true
    where id = v_shift.id;

    v_corrected := jsonb_build_object(
      'shift_id', v_shift.id,
      'excluded_from_payroll', true,
      'start_time', v_shift.start_time,
      'end_time', v_shift.end_time
    );
  else
    if v_start is null
       or (v_end is not null and v_end <= v_start) then
      raise exception 'Corrected shift interval is invalid';
    end if;

    if exists (
      select 1
      from public.tech_shifts other
      where other.shop_id = p_shop_id
        and other.user_id = p_target_user_id
        and other.id <> v_shift.id
        and coalesce(other.excluded_from_payroll, false) = false
        and tstzrange(
          other.start_time,
          coalesce(other.end_time, 'infinity'::timestamptz),
          '[)'
        ) && tstzrange(
          v_start,
          coalesce(v_end, 'infinity'::timestamptz),
          '[)'
        )
    ) then
      raise exception 'Corrected shift overlaps another non-voided shift';
    end if;

    update public.tech_shifts
    set
      start_time = v_start,
      end_time = v_end,
      status = case when v_end is null then 'active' else 'completed' end,
      excluded_from_payroll = false
    where id = v_shift.id;

    select event.id
    into v_start_punch_id
    from public.punch_events event
    where event.shift_id = v_shift.id
      and event.event_type = 'start_shift'
    order by event.created_at asc nulls last, event.id asc
    limit 1
    for update;

    if v_start_punch_id is null then
      insert into public.punch_events (
        shift_id,
        user_id,
        profile_id,
        event_type,
        timestamp,
        note
      ) values (
        v_shift.id,
        p_target_user_id,
        p_target_user_id,
        'start_shift',
        v_start,
        'Admin correction: effective boundary start'
      )
      returning id into v_start_punch_id;
    else
      update public.punch_events
      set
        timestamp = v_start,
        note = concat_ws(
          E'\n',
          nullif(note, ''),
          'Admin correction: effective boundary start'
        )
      where id = v_start_punch_id;
    end if;

    delete from public.punch_events event
    where event.shift_id = v_shift.id
      and event.event_type = 'start_shift'
      and event.id <> v_start_punch_id
      and event.note like 'Admin correction: effective boundary start%';

    if v_end is not null then
      select event.id
      into v_end_punch_id
      from public.punch_events event
      where event.shift_id = v_shift.id
        and event.event_type = 'end_shift'
      order by event.created_at asc nulls last, event.id asc
      limit 1
      for update;

      if v_end_punch_id is null then
        insert into public.punch_events (
          shift_id,
          user_id,
          profile_id,
          event_type,
          timestamp,
          note
        ) values (
          v_shift.id,
          p_target_user_id,
          p_target_user_id,
          'end_shift',
          v_end,
          'Admin correction: effective boundary end'
        )
        returning id into v_end_punch_id;
      else
        update public.punch_events
        set
          timestamp = v_end,
          note = concat_ws(
            E'\n',
            nullif(note, ''),
            'Admin correction: effective boundary end'
          )
        where id = v_end_punch_id;
      end if;

      delete from public.punch_events event
      where event.shift_id = v_shift.id
        and event.event_type = 'end_shift'
        and event.id <> v_end_punch_id
        and event.note like 'Admin correction: effective boundary end%';
    end if;

    v_corrected := jsonb_build_object(
      'shift_id', v_shift.id,
      'start_time', v_start,
      'end_time', v_end,
      'status', case when v_end is null then 'active' else 'completed' end,
      'excluded_from_payroll', false
    );
  end if;

  if exists (
    select 1
    from public.payroll_pay_periods period
    where period.shop_id = p_shop_id
      and period.status in ('draft', 'open')
      and period.period_start <= v_scope_end_date
      and period.period_end >= v_scope_start_date
  ) then
    update public.payroll_pay_periods period
    set
      notes = concat_ws(
        E'\n',
        period.notes,
        'Attendance correction applied; rebuild required.'
      ),
      updated_at = now()
    where period.shop_id = p_shop_id
      and period.status in ('draft', 'open')
      and period.period_start <= v_scope_end_date
      and period.period_end >= v_scope_start_date;
    v_payroll_status := 'rebuild_required';
  end if;

  insert into public.shift_corrections (
    shop_id,
    shift_id,
    target_user_id,
    actor_profile_id,
    correction_type,
    reason,
    original_data,
    corrected_data,
    payroll_rebuild_status
  ) values (
    p_shop_id,
    p_shift_id,
    p_target_user_id,
    p_actor_profile_id,
    p_correction_type,
    trim(p_reason),
    v_original,
    v_corrected,
    v_payroll_status
  )
  returning id into v_correction_id;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    'shift_correction.applied',
    p_shift_id::text,
    jsonb_build_object(
      'correction_id', v_correction_id,
      'shop_id', p_shop_id,
      'target_user_id', p_target_user_id,
      'correction_type', p_correction_type,
      'reason', trim(p_reason),
      'payroll_rebuild_status', v_payroll_status
    )
  );

  return jsonb_build_object(
    'id', v_correction_id,
    'shift_id', p_shift_id,
    'correction_type', p_correction_type,
    'corrected_by', p_actor_profile_id,
    'corrected_at', now(),
    'reason', trim(p_reason),
    'payroll_rebuild_status', v_payroll_status
  );
end;
$$;

revoke all on function public.apply_shift_correction(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text
) from public, anon, authenticated;

grant execute on function public.apply_shift_correction(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text
) to service_role;

comment on function public.apply_shift_correction(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text
) is
  'Applies an audited, payroll-safe timecard correction while keeping canonical boundary punches synchronized.';
