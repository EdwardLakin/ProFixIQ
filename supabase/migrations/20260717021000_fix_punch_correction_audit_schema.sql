-- Align punch-correction auditing with the canonical audit_logs schema.
-- Tenant and target context remain durable inside metadata.

create or replace function public.apply_punch_correction(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_punch_id uuid,
  p_corrected_timestamp timestamptz,
  p_reason text
)
returns public.punch_corrections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_punch public.punch_events%rowtype;
  v_shift public.tech_shifts%rowtype;
  v_shop public.shops%rowtype;
  v_period public.payroll_pay_periods%rowtype;
  v_result public.punch_corrections%rowtype;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_work_date date;
begin
  if p_corrected_timestamp is null then
    raise exception 'Corrected punch time is required';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A correction reason of at least 3 characters is required';
  end if;

  select * into v_actor
  from public.profiles
  where id = p_actor_profile_id and shop_id = p_shop_id;
  if not found or coalesce(v_actor.role, '') not in ('owner', 'admin', 'manager') then
    raise exception 'Forbidden';
  end if;

  select pe.* into v_punch
  from public.punch_events pe
  join public.tech_shifts ts on ts.id = pe.shift_id
  where pe.id = p_punch_id and ts.shop_id = p_shop_id
  for update of pe;
  if not found then raise exception 'Punch not found in this shop'; end if;

  select * into v_shift
  from public.tech_shifts
  where id = v_punch.shift_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Shift not found in this shop'; end if;

  if v_punch.user_id <> v_shift.user_id then
    raise exception 'Punch user does not match shift user';
  end if;
  if v_actor.id = v_shift.user_id and coalesce(v_actor.role, '') <> 'owner' then
    raise exception 'Only an owner can correct their own punch';
  end if;

  select * into v_shop from public.shops where id = p_shop_id;
  v_work_date := (p_corrected_timestamp at time zone coalesce(v_shop.timezone, 'UTC'))::date;

  select * into v_period
  from public.payroll_pay_periods
  where shop_id = p_shop_id
    and (
      v_work_date between period_start and period_end
      or (v_punch.timestamp at time zone coalesce(v_shop.timezone, 'UTC'))::date between period_start and period_end
    )
  order by period_start desc
  limit 1;

  if found and v_period.status in ('approved', 'exported') then
    raise exception 'Approved/exported payroll periods are locked';
  end if;

  v_new_start := case when v_punch.event_type = 'start_shift' then p_corrected_timestamp else v_shift.start_time end;
  v_new_end := case when v_punch.event_type = 'end_shift' then p_corrected_timestamp else v_shift.end_time end;

  if v_new_start is null then raise exception 'Shift start is required'; end if;
  if v_new_end is not null and v_new_end <= v_new_start then
    raise exception 'Punch correction would make the shift interval invalid';
  end if;
  if v_punch.event_type not in ('start_shift', 'end_shift')
     and (p_corrected_timestamp < v_shift.start_time or (v_shift.end_time is not null and p_corrected_timestamp > v_shift.end_time)) then
    raise exception 'Break and lunch punches must stay inside the shift';
  end if;

  if v_punch.event_type in ('start_shift', 'end_shift') and exists (
    select 1
    from public.tech_shifts other
    where other.shop_id = p_shop_id
      and other.user_id = v_shift.user_id
      and other.id <> v_shift.id
      and coalesce(other.excluded_from_payroll, false) = false
      and tstzrange(other.start_time, coalesce(other.end_time, 'infinity'::timestamptz), '[)')
          && tstzrange(v_new_start, coalesce(v_new_end, 'infinity'::timestamptz), '[)')
  ) then
    raise exception 'Punch correction would overlap another shift';
  end if;

  update public.punch_events
  set timestamp = p_corrected_timestamp,
      note = concat_ws(E'\n', nullif(note, ''), 'Admin correction: ' || trim(p_reason))
  where id = v_punch.id;

  if v_punch.event_type = 'start_shift' then
    update public.tech_shifts set start_time = p_corrected_timestamp where id = v_shift.id;
  elsif v_punch.event_type = 'end_shift' then
    update public.tech_shifts
    set end_time = p_corrected_timestamp, status = 'completed'
    where id = v_shift.id;
  end if;

  insert into public.punch_corrections (
    shop_id, punch_id, shift_id, target_user_id, actor_profile_id,
    reason, original_timestamp, corrected_timestamp, event_type
  ) values (
    p_shop_id, v_punch.id, v_shift.id, v_shift.user_id, v_actor.id,
    trim(p_reason), v_punch.timestamp, p_corrected_timestamp, v_punch.event_type
  )
  returning * into v_result;

  if found then
    update public.payroll_pay_periods
    set notes = concat_ws(E'\n', notes, 'Punch correction applied; rebuild required.'),
        updated_at = now()
    where id = v_period.id;
  end if;

  insert into public.audit_logs (
    actor_id, action, target, metadata
  ) values (
    v_actor.id,
    'workforce.punch.corrected',
    v_punch.id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_table', 'punch_events',
      'target_id', v_punch.id,
      'shift_id', v_shift.id,
      'target_user_id', v_shift.user_id,
      'event_type', v_punch.event_type,
      'original_timestamp', v_punch.timestamp,
      'corrected_timestamp', p_corrected_timestamp,
      'reason', trim(p_reason)
    )
  );

  return v_result;
end;
$$;

revoke all on function public.apply_punch_correction(uuid, uuid, uuid, timestamptz, text) from public;
grant execute on function public.apply_punch_correction(uuid, uuid, uuid, timestamptz, text) to service_role;
