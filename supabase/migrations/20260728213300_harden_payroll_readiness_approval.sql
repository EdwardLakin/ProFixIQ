-- Keep recorded attendance visible while preventing an incomplete employee
-- setup from silently entering an approved payroll snapshot.
--
-- The application rebuild writes a readable blocking exception. This
-- transaction-level check is the final authority so resolving or bypassing a
-- stale exception cannot approve recorded time for a person who is not active
-- and payroll-ready.

create or replace function public.approve_payroll_period_atomic(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_period_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_period public.payroll_pay_periods%rowtype;
  v_blocking_count integer := 0;
  v_recorded_entry_count integer := 0;
  v_setup_incomplete_count integer := 0;
  v_approved_entry_count integer := 0;
  v_now timestamptz := now();
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_period_id is null then
    raise exception 'Shop, actor, and pay period are required';
  end if;

  select *
  into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id;

  if not found then
    raise exception 'Actor is not a member of this shop';
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_actor.id
     and auth.uid() is distinct from v_actor.user_id then
    raise exception 'Actor identity mismatch';
  end if;

  if lower(coalesce(v_actor.role::text, '')) not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can approve payroll';
  end if;

  select *
  into v_period
  from public.payroll_pay_periods period
  where period.id = p_period_id
    and period.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Pay period not found';
  end if;
  if v_period.status not in ('draft', 'open') then
    raise exception 'Only an open pay period can be approved';
  end if;

  select count(*)::integer
  into v_blocking_count
  from public.payroll_time_exceptions exception
  where exception.shop_id = p_shop_id
    and exception.period_id = p_period_id
    and exception.severity = 'blocking'
    and exception.resolved = false;

  if v_blocking_count > 0 then
    raise exception 'Cannot approve period with unresolved blocking exceptions';
  end if;

  select count(*)::integer
  into v_recorded_entry_count
  from public.payroll_time_entries entry
  where entry.shop_id = p_shop_id
    and entry.period_id = p_period_id
    and (
      entry.worked_minutes > 0
      or entry.attendance_minutes > 0
      or entry.job_minutes > 0
      or entry.flagged_minutes > 0
    );

  if v_recorded_entry_count = 0 then
    raise exception 'Cannot approve a payroll period with no recorded employee time';
  end if;

  select count(distinct entry.user_id)::integer
  into v_setup_incomplete_count
  from public.payroll_time_entries entry
  where entry.shop_id = p_shop_id
    and entry.period_id = p_period_id
    and (
      entry.worked_minutes > 0
      or entry.attendance_minutes > 0
      or entry.job_minutes > 0
      or entry.flagged_minutes > 0
    )
    and not exists (
      select 1
      from public.people_workforce_profiles workforce
      where workforce.shop_id = p_shop_id
        and workforce.user_id = entry.user_id
        and workforce.employment_status = 'active'
        and workforce.payroll_ready = true
    );

  if v_setup_incomplete_count > 0 then
    raise exception
      'Cannot approve payroll while recorded employees have incomplete payroll setup';
  end if;

  update public.payroll_time_entries entry
  set
    approval_state = 'approved',
    approved_at = v_now,
    approved_by = p_actor_profile_id
  where entry.shop_id = p_shop_id
    and entry.period_id = p_period_id;
  get diagnostics v_approved_entry_count = row_count;

  update public.payroll_pay_periods period
  set
    status = 'approved',
    approved_at = v_now,
    approved_by = p_actor_profile_id,
    locked_at = v_now,
    updated_at = v_now
  where period.id = p_period_id
    and period.shop_id = p_shop_id;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    'payroll.period_approved',
    p_period_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'payroll_pay_period',
      'approved_entry_count', v_approved_entry_count,
      'recorded_entry_count', v_recorded_entry_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'period_id', p_period_id,
    'approved_entry_count', v_approved_entry_count,
    'recorded_entry_count', v_recorded_entry_count
  );
end;
$$;

revoke all on function public.approve_payroll_period_atomic(
  uuid,
  uuid,
  uuid
) from public, anon;
grant execute on function public.approve_payroll_period_atomic(
  uuid,
  uuid,
  uuid
) to authenticated, service_role;

comment on function public.approve_payroll_period_atomic(
  uuid,
  uuid,
  uuid
) is
  'Atomically approves payroll only when recorded employees have active payroll-ready workforce profiles.';
