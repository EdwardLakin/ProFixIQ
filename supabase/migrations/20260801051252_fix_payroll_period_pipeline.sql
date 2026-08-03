-- Repair the payroll period contract without rewriting earlier migrations.
--
-- Production carries legacy start_date/end_date columns alongside the
-- canonical period_start/period_end columns. The application writes the
-- canonical pair, while the legacy pair was later made NOT NULL. Keep both
-- pairs synchronized during the rolling deployment, restore the canonical
-- uniqueness invariant, materialize periods that cover recorded source time,
-- and remove direct database mutation paths that bypass the payroll APIs.

update public.payroll_pay_periods
set
  start_date = period_start,
  end_date = period_end
where start_date is distinct from period_start
   or end_date is distinct from period_end;

do $payroll_period_date_precheck$
begin
  if exists (
    select 1
    from public.payroll_pay_periods period
    where period.period_start is null
       or period.period_end is null
       or period.start_date is null
       or period.end_date is null
       or period.period_end < period.period_start
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Payroll period dates must be complete and ordered before synchronization can be enabled';
  end if;
end
$payroll_period_date_precheck$;

create or replace function public.sync_payroll_period_date_aliases()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_canonical_changed boolean;
  v_legacy_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.period_start is not null
       and new.start_date is not null
       and new.period_start <> new.start_date then
      raise exception 'Payroll period start dates disagree';
    end if;
    if new.period_end is not null
       and new.end_date is not null
       and new.period_end <> new.end_date then
      raise exception 'Payroll period end dates disagree';
    end if;

    new.period_start := coalesce(new.period_start, new.start_date);
    new.period_end := coalesce(new.period_end, new.end_date);
    new.start_date := new.period_start;
    new.end_date := new.period_end;
  else
    v_canonical_changed :=
      new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end;
    v_legacy_changed :=
      new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date;

    if v_canonical_changed and v_legacy_changed then
      if new.period_start is distinct from new.start_date
         or new.period_end is distinct from new.end_date then
        raise exception 'Payroll period date aliases cannot be changed to different values';
      end if;
    elsif v_canonical_changed then
      new.start_date := new.period_start;
      new.end_date := new.period_end;
    elsif v_legacy_changed then
      new.period_start := new.start_date;
      new.period_end := new.end_date;
    end if;
  end if;

  if new.period_start is null
     or new.period_end is null
     or new.start_date is null
     or new.end_date is null then
    raise exception 'Payroll period start and end dates are required';
  end if;
  if new.period_end < new.period_start then
    raise exception 'Payroll period end date cannot precede its start date';
  end if;

  return new;
end;
$function$;

drop trigger if exists payroll_pay_periods_sync_date_aliases
  on public.payroll_pay_periods;
create trigger payroll_pay_periods_sync_date_aliases
before insert or update of period_start, period_end, start_date, end_date
on public.payroll_pay_periods
for each row
execute function public.sync_payroll_period_date_aliases();

revoke all on function public.sync_payroll_period_date_aliases()
  from public, anon, authenticated;

alter table public.payroll_pay_periods
  drop constraint if exists payroll_pay_periods_date_aliases_chk;
alter table public.payroll_pay_periods
  add constraint payroll_pay_periods_date_aliases_chk
  check (
    start_date = period_start
    and end_date = period_end
  ) not valid;
alter table public.payroll_pay_periods
  validate constraint payroll_pay_periods_date_aliases_chk;

create unique index if not exists payroll_pay_periods_shop_period_key
  on public.payroll_pay_periods (shop_id, period_start, period_end);

-- Backfill open period shells for every shop-local source date. This never
-- updates an existing period, so approved/exported history remains immutable.
with source_dates as (
  select
    shift.shop_id,
    (shift.start_time at time zone coalesce(shop.timezone, 'UTC'))::date as work_date
  from public.tech_shifts shift
  join public.shops shop on shop.id = shift.shop_id
  where shift.start_time is not null
    and coalesce(shift.excluded_from_payroll, false) = false

  union all

  select
    segment.shop_id,
    (segment.started_at at time zone coalesce(shop.timezone, 'UTC'))::date as work_date
  from public.work_order_line_labor_segments segment
  join public.shops shop on shop.id = segment.shop_id
  where segment.started_at is not null

  union all

  select
    credit.shop_id,
    (credit.credited_at at time zone coalesce(shop.timezone, 'UTC'))::date as work_date
  from public.work_order_line_flat_rate_credits credit
  join public.shops shop on shop.id = credit.shop_id
  where credit.credited_at is not null
),
source_bounds as (
  select shop_id, min(work_date) as first_work_date
  from source_dates
  group by shop_id
),
payroll_rules as (
  select
    bounds.shop_id,
    bounds.first_work_date,
    (now() at time zone coalesce(shop.timezone, 'UTC'))::date as current_work_date,
    coalesce(settings.cadence, 'biweekly') as cadence,
    coalesce(settings.week_starts_on, 1)::integer as week_starts_on,
    coalesce(settings.period_anchor_date, date '2024-01-01') as anchor_date
  from source_bounds bounds
  join public.shops shop on shop.id = bounds.shop_id
  left join public.shop_payroll_settings settings
    on settings.shop_id = bounds.shop_id
),
source_calendar as (
  select
    rule.*,
    generated.work_date::date
  from payroll_rules rule
  cross join lateral generate_series(
    rule.first_work_date,
    greatest(rule.first_work_date, rule.current_work_date),
    interval '1 day'
  ) as generated(work_date)
),
period_starts as (
  select
    calendar.shop_id,
    calendar.cadence,
    calendar.work_date,
    case calendar.cadence
      when 'weekly' then
        calendar.work_date
          - ((extract(dow from calendar.work_date)::integer - calendar.week_starts_on + 7) % 7)
      when 'biweekly' then
        calendar.anchor_date
          + (floor((calendar.work_date - calendar.anchor_date) / 14.0)::integer * 14)
      when 'semimonthly' then
        case
          when extract(day from calendar.work_date) <= 15
            then date_trunc('month', calendar.work_date)::date
          else (date_trunc('month', calendar.work_date)::date + 15)
        end
      else date_trunc('month', calendar.work_date)::date
    end as period_start
  from source_calendar calendar
),
period_ranges as (
  select distinct
    period.shop_id,
    period.period_start,
    case period.cadence
      when 'weekly' then period.period_start + 6
      when 'biweekly' then period.period_start + 13
      when 'semimonthly' then
        case
          when extract(day from period.period_start) = 1
            then period.period_start + 14
          else (date_trunc('month', period.period_start)::date + interval '1 month - 1 day')::date
        end
      else (date_trunc('month', period.period_start)::date + interval '1 month - 1 day')::date
    end as period_end
  from period_starts period
)
insert into public.payroll_pay_periods (
  shop_id,
  period_start,
  period_end,
  start_date,
  end_date,
  processed,
  status,
  notes
)
select
  period.shop_id,
  period.period_start,
  period.period_end,
  period.period_start,
  period.period_end,
  false,
  'open',
  'Automatically created from recorded Workforce time.'
from period_ranges period
on conflict (shop_id, period_start, period_end) do nothing;

-- Payroll period/settings mutations are server-only because the API enforces
-- reviewer capabilities and Owner PIN requirements. Retain scoped reads.
drop policy if exists payroll_pay_periods_shop_all
  on public.payroll_pay_periods;
drop policy if exists payroll_pay_periods__shop_insert
  on public.payroll_pay_periods;
drop policy if exists payroll_pay_periods__shop_update
  on public.payroll_pay_periods;
drop policy if exists payroll_pay_periods__shop_delete
  on public.payroll_pay_periods;
drop policy if exists payroll_pay_periods__shop_select
  on public.payroll_pay_periods;
drop policy if exists payroll_pay_periods_manager_select
  on public.payroll_pay_periods;

create policy payroll_pay_periods_manager_select
  on public.payroll_pay_periods
  for select to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (select public.profixiq_can_manage_workforce())
  );

drop policy if exists shop_payroll_settings_shop_crud
  on public.shop_payroll_settings;
drop policy if exists shop_payroll_settings_shop_insert
  on public.shop_payroll_settings;
drop policy if exists shop_payroll_settings_shop_update
  on public.shop_payroll_settings;
drop policy if exists shop_payroll_settings_shop_delete
  on public.shop_payroll_settings;
drop policy if exists shop_payroll_settings_shop_select
  on public.shop_payroll_settings;
drop policy if exists shop_payroll_settings_owner_write
  on public.shop_payroll_settings;
drop policy if exists shop_payroll_settings_manager_select
  on public.shop_payroll_settings;

create policy shop_payroll_settings_manager_select
  on public.shop_payroll_settings
  for select to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (select public.profixiq_can_manage_workforce())
  );

revoke insert, update, delete on table public.payroll_pay_periods
  from anon, authenticated;
revoke insert, update, delete on table public.shop_payroll_settings
  from anon, authenticated;

-- Snapshot replacement remains privileged because it replaces the entire open
-- period atomically. Only the server's service role may call it, and the actor,
-- shop, period, employee identities, dates, and non-negative values are checked
-- again inside the transaction.
create or replace function public.replace_payroll_period_snapshot(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_period_id uuid,
  p_entries jsonb,
  p_exceptions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_period public.payroll_pay_periods%rowtype;
  v_entry_count integer := 0;
  v_exception_count integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_period_id is null then
    raise exception 'Shop, actor, and pay period are required';
  end if;
  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_exceptions, '[]'::jsonb)) <> 'array' then
    raise exception 'Payroll entries and exceptions must be arrays';
  end if;

  select lower(coalesce(profile.role::text, ''))
  into v_actor_role
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id;
  if not found then
    raise exception 'Actor is not a member of this shop';
  end if;
  if v_actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Forbidden';
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
  if v_period.status in ('approved', 'exported') then
    raise exception 'Approved/exported periods are locked';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_entries, '[]'::jsonb)) as entry(
      user_id uuid,
      work_date date,
      worked_minutes integer,
      attendance_minutes integer,
      unpaid_break_minutes integer,
      paid_break_minutes integer,
      regular_minutes integer,
      overtime_minutes integer,
      job_minutes integer,
      flagged_minutes integer,
      adjustment_minutes integer,
      has_exceptions boolean,
      warning_exception_count integer,
      blocking_exception_count integer,
      source_snapshot jsonb
    )
    left join public.profiles profile
      on profile.id = entry.user_id
     and profile.shop_id = p_shop_id
    where profile.id is null
       or entry.work_date is null
       or entry.work_date < v_period.period_start
       or entry.work_date > v_period.period_end
       or entry.worked_minutes < 0
       or entry.attendance_minutes < 0
       or entry.unpaid_break_minutes < 0
       or entry.paid_break_minutes < 0
       or entry.regular_minutes < 0
       or entry.overtime_minutes < 0
       or entry.job_minutes < 0
       or entry.flagged_minutes < 0
       or entry.warning_exception_count < 0
       or entry.blocking_exception_count < 0
  ) then
    raise exception 'Payroll snapshot contains an invalid employee, date, or minute value';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_exceptions, '[]'::jsonb)) as exception(
      user_id uuid,
      work_date date,
      severity text,
      code text,
      message text,
      source_type text,
      source_ref jsonb
    )
    left join public.profiles profile
      on profile.id = exception.user_id
     and profile.shop_id = p_shop_id
    where profile.id is null
       or (
         exception.work_date is not null
         and (
           exception.work_date < v_period.period_start
           or exception.work_date > v_period.period_end
         )
       )
       or exception.severity not in ('warning', 'blocking')
       or exception.source_type not in ('attendance', 'job_time', 'manual_adjustment', 'system')
       or nullif(trim(exception.code), '') is null
       or nullif(trim(exception.message), '') is null
  ) then
    raise exception 'Payroll snapshot contains an invalid exception';
  end if;

  delete from public.payroll_time_exceptions exception
  where exception.shop_id = p_shop_id
    and exception.period_id = p_period_id;
  delete from public.payroll_time_entries entry
  where entry.shop_id = p_shop_id
    and entry.period_id = p_period_id;

  insert into public.payroll_time_entries (
    shop_id,
    period_id,
    user_id,
    work_date,
    worked_minutes,
    attendance_minutes,
    unpaid_break_minutes,
    paid_break_minutes,
    regular_minutes,
    overtime_minutes,
    job_minutes,
    flagged_minutes,
    adjustment_minutes,
    has_exceptions,
    warning_exception_count,
    blocking_exception_count,
    approval_state,
    source_snapshot
  )
  select
    p_shop_id,
    p_period_id,
    entry.user_id,
    entry.work_date,
    entry.worked_minutes,
    entry.attendance_minutes,
    entry.unpaid_break_minutes,
    entry.paid_break_minutes,
    entry.regular_minutes,
    entry.overtime_minutes,
    entry.job_minutes,
    entry.flagged_minutes,
    entry.adjustment_minutes,
    entry.has_exceptions,
    entry.warning_exception_count,
    entry.blocking_exception_count,
    'draft',
    entry.source_snapshot
  from jsonb_to_recordset(coalesce(p_entries, '[]'::jsonb)) as entry(
    user_id uuid,
    work_date date,
    worked_minutes integer,
    attendance_minutes integer,
    unpaid_break_minutes integer,
    paid_break_minutes integer,
    regular_minutes integer,
    overtime_minutes integer,
    job_minutes integer,
    flagged_minutes integer,
    adjustment_minutes integer,
    has_exceptions boolean,
    warning_exception_count integer,
    blocking_exception_count integer,
    source_snapshot jsonb
  );
  get diagnostics v_entry_count = row_count;

  insert into public.payroll_time_exceptions (
    shop_id,
    period_id,
    user_id,
    work_date,
    severity,
    code,
    message,
    source_type,
    source_ref
  )
  select
    p_shop_id,
    p_period_id,
    exception.user_id,
    exception.work_date,
    exception.severity,
    exception.code,
    exception.message,
    exception.source_type,
    exception.source_ref
  from jsonb_to_recordset(coalesce(p_exceptions, '[]'::jsonb)) as exception(
    user_id uuid,
    work_date date,
    severity text,
    code text,
    message text,
    source_type text,
    source_ref jsonb
  );
  get diagnostics v_exception_count = row_count;

  update public.payroll_pay_periods period
  set status = 'open', updated_at = now()
  where period.id = p_period_id
    and period.shop_id = p_shop_id;

  return jsonb_build_object(
    'rows', v_entry_count,
    'exceptions', v_exception_count
  );
end;
$function$;

revoke all on function public.replace_payroll_period_snapshot(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) from public, anon, authenticated;
grant execute on function public.replace_payroll_period_snapshot(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) to service_role;

comment on function public.replace_payroll_period_snapshot(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) is
  'Atomically replaces an open payroll snapshot through the authorized server API only.';
