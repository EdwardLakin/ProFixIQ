-- First-class workforce operations: canonical time away, role-aware RLS,
-- atomic payroll snapshots, and durable flat-rate credit evidence.
-- This is intentionally operational time evidence, not wage or leave entitlement logic.

create or replace function public.profixiq_workforce_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(p.role::text, ''))
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function public.profixiq_can_manage_workforce()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.profixiq_workforce_role() in ('owner', 'admin', 'manager')
$$;

create or replace function public.profixiq_can_finalize_workforce()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.profixiq_workforce_role() in ('owner', 'admin')
$$;

grant execute on function public.profixiq_workforce_role() to authenticated;
grant execute on function public.profixiq_can_manage_workforce() to authenticated;
grant execute on function public.profixiq_can_finalize_workforce() to authenticated;

-- These tables existed in generated types and some live environments, but were
-- never owned by the forward migration chain. CREATE IF NOT EXISTS preserves
-- existing data while making clean replay deterministic.
create table if not exists public.staff_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_working_day boolean not null default true,
  start_time time,
  end_time time,
  unpaid_break_minutes integer not null default 0 check (unpaid_break_minutes >= 0),
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id, day_of_week)
);

create table if not exists public.staff_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  schedule_date date not null,
  start_time timestamptz,
  end_time timestamptz,
  unpaid_break_minutes integer not null default 0 check (unpaid_break_minutes >= 0),
  notes text,
  source_type text not null default 'manual_override',
  status text not null default 'scheduled',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_time_off_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_partial_day boolean not null default false,
  status text not null default 'pending',
  reason text,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status in ('pending', 'approved', 'declined', 'cancelled'))
);

create table if not exists public.staff_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  block_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (shop_id, source_type, source_id)
);

create index if not exists staff_time_off_shop_status_dates_idx
  on public.staff_time_off_requests(shop_id, status, starts_at, ends_at);
create index if not exists staff_time_off_user_dates_idx
  on public.staff_time_off_requests(shop_id, user_id, starts_at, ends_at);
create index if not exists staff_availability_user_dates_idx
  on public.staff_availability_blocks(shop_id, user_id, starts_at, ends_at);
create index if not exists staff_schedule_override_user_date_idx
  on public.staff_schedule_overrides(shop_id, user_id, schedule_date);

alter table public.staff_schedule_templates enable row level security;
alter table public.staff_schedule_overrides enable row level security;
alter table public.staff_time_off_requests enable row level security;
alter table public.staff_availability_blocks enable row level security;

drop policy if exists staff_schedule_templates_shop_all on public.staff_schedule_templates;
drop policy if exists staff_schedule_templates_shop_select on public.staff_schedule_templates;
drop policy if exists staff_schedule_templates_shop_write on public.staff_schedule_templates;
create policy staff_schedule_templates_shop_select on public.staff_schedule_templates
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (user_id = auth.uid() or public.profixiq_can_manage_workforce())
  );
create policy staff_schedule_templates_shop_write on public.staff_schedule_templates
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce())
  with check (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce());

drop policy if exists staff_schedule_overrides_shop_all on public.staff_schedule_overrides;
drop policy if exists staff_schedule_overrides_shop_select on public.staff_schedule_overrides;
drop policy if exists staff_schedule_overrides_shop_write on public.staff_schedule_overrides;
create policy staff_schedule_overrides_shop_select on public.staff_schedule_overrides
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (user_id = auth.uid() or public.profixiq_can_manage_workforce())
  );
create policy staff_schedule_overrides_shop_write on public.staff_schedule_overrides
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce())
  with check (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce());

drop policy if exists staff_time_off_requests_shop_all on public.staff_time_off_requests;
drop policy if exists staff_time_off_requests_shop_select on public.staff_time_off_requests;
drop policy if exists staff_time_off_requests_manager_update on public.staff_time_off_requests;
create policy staff_time_off_requests_shop_select on public.staff_time_off_requests
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (user_id = auth.uid() or public.profixiq_can_manage_workforce())
  );
create policy staff_time_off_requests_manager_update on public.staff_time_off_requests
  for update to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce())
  with check (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce());

drop policy if exists staff_availability_blocks_shop_all on public.staff_availability_blocks;
drop policy if exists staff_availability_blocks_shop_select on public.staff_availability_blocks;
drop policy if exists staff_availability_blocks_shop_write on public.staff_availability_blocks;
create policy staff_availability_blocks_shop_select on public.staff_availability_blocks
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (user_id = auth.uid() or public.profixiq_can_manage_workforce())
  );
create policy staff_availability_blocks_shop_write on public.staff_availability_blocks
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce())
  with check (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce());

-- Replace broad payroll CRUD policies. Staff can inspect their own time evidence;
-- managers can review; only owner/admin can change settings or final artifacts.
drop policy if exists shop_payroll_settings_shop_crud on public.shop_payroll_settings;
drop policy if exists payroll_pay_periods_shop_all on public.payroll_pay_periods;
drop policy if exists payroll_time_entries_shop_all on public.payroll_time_entries;
drop policy if exists payroll_time_exceptions_shop_all on public.payroll_time_exceptions;
drop policy if exists payroll_export_batches_shop_all on public.payroll_export_batches;
drop policy if exists payroll_export_rows_shop_all on public.payroll_export_rows;
drop policy if exists payroll_employee_mappings_shop_all on public.payroll_employee_mappings;

create policy shop_payroll_settings_manager_select on public.shop_payroll_settings
  for select to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce());
create policy shop_payroll_settings_owner_write on public.shop_payroll_settings
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_finalize_workforce())
  with check (shop_id = public.current_shop_id() and public.profixiq_can_finalize_workforce());

create policy payroll_pay_periods_manager_select on public.payroll_pay_periods
  for select to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_manage_workforce());
create policy payroll_time_entries_scoped_select on public.payroll_time_entries
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (user_id = auth.uid() or public.profixiq_can_manage_workforce())
  );
create policy payroll_time_exceptions_scoped_select on public.payroll_time_exceptions
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (user_id = auth.uid() or public.profixiq_can_manage_workforce())
  );
create policy payroll_export_batches_owner_select on public.payroll_export_batches
  for select to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_finalize_workforce());
create policy payroll_export_rows_owner_select on public.payroll_export_rows
  for select to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_finalize_workforce());
create policy payroll_employee_mappings_owner_all on public.payroll_employee_mappings
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.profixiq_can_finalize_workforce())
  with check (shop_id = public.current_shop_id() and public.profixiq_can_finalize_workforce());

create or replace function public.submit_staff_time_off_request(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_target_user_id uuid,
  p_request_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_partial_day boolean,
  p_reason text
) returns public.staff_time_off_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_request public.staff_time_off_requests%rowtype;
  v_role text;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_profile_id then
    raise exception 'Actor identity mismatch';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Request end must be after request start';
  end if;
  if lower(trim(coalesce(p_request_type, ''))) not in ('vacation', 'personal', 'appointment', 'sick', 'other') then
    raise exception 'Unsupported time-away request type';
  end if;

  select * into v_actor from public.profiles where id = p_actor_profile_id and shop_id = p_shop_id;
  if not found then raise exception 'Actor is not in shop'; end if;
  select * into v_target from public.profiles where id = p_target_user_id and shop_id = p_shop_id;
  if not found then raise exception 'Target employee is not in shop'; end if;

  v_role := lower(coalesce(v_actor.role::text, ''));
  if p_actor_profile_id <> p_target_user_id and v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':' || p_target_user_id::text, 0));
  if exists (
    select 1
    from public.staff_time_off_requests r
    where r.shop_id = p_shop_id
      and r.user_id = p_target_user_id
      and r.status in ('pending', 'approved')
      and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'This employee already has an overlapping active request';
  end if;

  insert into public.staff_time_off_requests (
    shop_id, user_id, request_type, starts_at, ends_at, is_partial_day,
    status, reason, requested_by
  ) values (
    p_shop_id, p_target_user_id, lower(trim(p_request_type)), p_starts_at, p_ends_at,
    coalesce(p_is_partial_day, false), 'pending', nullif(trim(coalesce(p_reason, '')), ''),
    p_actor_profile_id
  ) returning * into v_request;

  insert into public.audit_logs (actor_id, action, target, metadata)
  values (
    p_actor_profile_id,
    'staff.time_off.requested',
    p_target_user_id::text,
    jsonb_build_object('shop_id', p_shop_id, 'request_id', v_request.id, 'starts_at', p_starts_at, 'ends_at', p_ends_at)
  );

  return v_request;
end;
$$;

create or replace function public.transition_staff_time_off_request(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_next_status text,
  p_review_note text
) returns public.staff_time_off_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_request public.staff_time_off_requests%rowtype;
  v_role text;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_profile_id then
    raise exception 'Actor identity mismatch';
  end if;
  if p_next_status not in ('approved', 'declined', 'cancelled') then
    raise exception 'Unsupported request transition';
  end if;

  select * into v_actor from public.profiles where id = p_actor_profile_id and shop_id = p_shop_id;
  if not found then raise exception 'Actor is not in shop'; end if;
  v_role := lower(coalesce(v_actor.role::text, ''));

  select * into v_request
  from public.staff_time_off_requests
  where id = p_request_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Request not found'; end if;
  if v_request.status <> 'pending' then
    raise exception 'Only a pending request can be reviewed or cancelled';
  end if;

  if p_next_status = 'cancelled' then
    if p_actor_profile_id <> v_request.user_id and v_role not in ('owner', 'admin', 'manager') then
      raise exception 'Forbidden';
    end if;
  else
    if v_role not in ('owner', 'admin', 'manager') then raise exception 'Forbidden'; end if;
    if p_actor_profile_id = v_request.user_id then
      raise exception 'Managers cannot approve or decline their own request';
    end if;
  end if;

  update public.staff_time_off_requests
  set status = p_next_status,
      reviewed_at = case when p_next_status in ('approved', 'declined') then now() else reviewed_at end,
      reviewed_by = case when p_next_status in ('approved', 'declined') then p_actor_profile_id else reviewed_by end,
      review_note = case when p_next_status in ('approved', 'declined') then nullif(trim(coalesce(p_review_note, '')), '') else review_note end,
      updated_at = now()
  where id = v_request.id
  returning * into v_request;

  if p_next_status = 'approved' then
    insert into public.staff_availability_blocks (
      shop_id, user_id, source_type, source_id, block_type, starts_at, ends_at, label
    ) values (
      v_request.shop_id, v_request.user_id, 'time_off_request', v_request.id,
      v_request.request_type, v_request.starts_at, v_request.ends_at,
      coalesce(v_request.reason, initcap(v_request.request_type) || ' time away')
    )
    on conflict (shop_id, source_type, source_id)
    do update set
      user_id = excluded.user_id,
      block_type = excluded.block_type,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      label = excluded.label,
      updated_at = now();
  else
    delete from public.staff_availability_blocks
    where shop_id = v_request.shop_id
      and source_type = 'time_off_request'
      and source_id = v_request.id;
  end if;

  insert into public.audit_logs (actor_id, action, target, metadata)
  values (
    p_actor_profile_id,
    'staff.time_off.' || p_next_status,
    v_request.user_id::text,
    jsonb_build_object('shop_id', p_shop_id, 'request_id', v_request.id, 'review_note', p_review_note)
  );

  return v_request;
end;
$$;

revoke all on function public.submit_staff_time_off_request(uuid, uuid, uuid, text, timestamptz, timestamptz, boolean, text) from public;
revoke all on function public.transition_staff_time_off_request(uuid, uuid, uuid, text, text) from public;
grant execute on function public.submit_staff_time_off_request(uuid, uuid, uuid, text, timestamptz, timestamptz, boolean, text) to authenticated, service_role;
grant execute on function public.transition_staff_time_off_request(uuid, uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.replace_staff_schedule_template(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_target_user_id uuid,
  p_templates jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_count integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_profile_id then
    raise exception 'Actor identity mismatch';
  end if;
  select lower(coalesce(role::text, '')) into v_role
  from public.profiles where id = p_actor_profile_id and shop_id = p_shop_id;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id and shop_id = p_shop_id) then
    raise exception 'Target employee is not in shop';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':schedule:' || p_target_user_id::text, 0));
  delete from public.staff_schedule_templates
  where shop_id = p_shop_id and user_id = p_target_user_id;

  insert into public.staff_schedule_templates (
    shop_id, user_id, day_of_week, is_working_day, start_time, end_time,
    unpaid_break_minutes, effective_from, effective_to
  )
  select
    p_shop_id,
    p_target_user_id,
    x.day_of_week,
    coalesce(x.is_working_day, true),
    x.start_time,
    x.end_time,
    greatest(0, coalesce(x.unpaid_break_minutes, 0)),
    x.effective_from,
    x.effective_to
  from jsonb_to_recordset(coalesce(p_templates, '[]'::jsonb)) as x(
    day_of_week smallint,
    is_working_day boolean,
    start_time time,
    end_time time,
    unpaid_break_minutes integer,
    effective_from date,
    effective_to date
  )
  where x.day_of_week between 0 and 6;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (actor_id, action, target, metadata)
  values (
    p_actor_profile_id,
    'staff.schedule.template.updated',
    p_target_user_id::text,
    jsonb_build_object('shop_id', p_shop_id, 'template_rows', v_count)
  );
  return v_count;
end;
$$;

revoke all on function public.replace_staff_schedule_template(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.replace_staff_schedule_template(uuid, uuid, uuid, jsonb) to authenticated, service_role;

alter table public.payroll_time_entries
  add column if not exists flagged_minutes integer not null default 0;

create table if not exists public.work_order_line_flat_rate_credits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete restrict,
  credit_hours numeric(12,4) not null check (credit_hours >= 0),
  credit_source text not null default 'automatic_actual_time_split'
    check (credit_source in ('automatic_single_tech', 'automatic_actual_time_split', 'manager_adjustment')),
  actual_job_seconds bigint not null default 0,
  credited_at timestamptz not null default now(),
  adjusted_by uuid references public.profiles(id) on delete set null,
  adjustment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_line_id, technician_id)
);

create index if not exists flat_rate_credits_shop_tech_date_idx
  on public.work_order_line_flat_rate_credits(shop_id, technician_id, credited_at);
create index if not exists flat_rate_credits_line_idx
  on public.work_order_line_flat_rate_credits(work_order_line_id);

alter table public.work_order_line_flat_rate_credits enable row level security;
create policy flat_rate_credits_scoped_select on public.work_order_line_flat_rate_credits
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (technician_id = auth.uid() or public.profixiq_can_manage_workforce())
  );

create or replace function public.sync_work_order_line_flat_rate_credits(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
begin
  select * into v_line from public.work_order_lines where id = p_line_id for update;
  if not found then return; end if;

  if coalesce(v_line.status, '') not in ('completed', 'ready_to_invoice', 'invoiced')
     or coalesce(v_line.labor_time, 0) <= 0 then
    delete from public.work_order_line_flat_rate_credits
    where work_order_line_id = p_line_id and credit_source <> 'manager_adjustment';
    return;
  end if;

  delete from public.work_order_line_flat_rate_credits
  where work_order_line_id = p_line_id and credit_source <> 'manager_adjustment';

  with assigned as (
    select distinct t.technician_id
    from public.work_order_line_technicians t
    where t.work_order_line_id = p_line_id
    union
    select v_line.assigned_tech_id
    where v_line.assigned_tech_id is not null
      and not exists (
        select 1 from public.work_order_line_technicians t where t.work_order_line_id = p_line_id
      )
  ),
  actual as (
    select
      a.technician_id,
      coalesce(sum(greatest(0, extract(epoch from (coalesce(s.ended_at, s.started_at) - s.started_at))))::bigint, 0) as actual_seconds
    from assigned a
    left join public.work_order_line_labor_segments s
      on s.work_order_line_id = p_line_id and s.technician_id = a.technician_id
    where a.technician_id is not null
    group by a.technician_id
  ),
  weighted as (
    select
      technician_id,
      actual_seconds,
      count(*) over () as tech_count,
      sum(actual_seconds) over () as total_seconds,
      row_number() over (order by technician_id) as rn
    from actual
  ),
  credits as (
    select
      *,
      case
        when tech_count = 1 then round(v_line.labor_time::numeric, 4)
        when total_seconds > 0 then round((v_line.labor_time::numeric * actual_seconds::numeric / total_seconds::numeric), 4)
        else round((v_line.labor_time::numeric / tech_count::numeric), 4)
      end as proposed
    from weighted
  ),
  balanced as (
    select
      *,
      case
        when rn = tech_count then
          round(v_line.labor_time::numeric - coalesce(sum(proposed) over (rows between unbounded preceding and 1 preceding), 0), 4)
        else proposed
      end as final_credit
    from credits
  )
  insert into public.work_order_line_flat_rate_credits (
    shop_id, work_order_id, work_order_line_id, technician_id, credit_hours,
    credit_source, actual_job_seconds, credited_at
  )
  select
    v_line.shop_id,
    v_line.work_order_id,
    p_line_id,
    technician_id,
    greatest(0, final_credit),
    case when tech_count = 1 then 'automatic_single_tech' else 'automatic_actual_time_split' end,
    actual_seconds,
    coalesce(v_line.punched_out_at, v_line.updated_at, now())
  from balanced
  on conflict (work_order_line_id, technician_id)
  do update set
    credit_hours = excluded.credit_hours,
    credit_source = excluded.credit_source,
    actual_job_seconds = excluded.actual_job_seconds,
    credited_at = excluded.credited_at,
    updated_at = now()
  where public.work_order_line_flat_rate_credits.credit_source <> 'manager_adjustment';
end;
$$;

create or replace function public.trg_sync_flat_rate_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_work_order_line_flat_rate_credits(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

create or replace function public.trg_sync_flat_rate_credits_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_work_order_line_flat_rate_credits(
    coalesce(new.work_order_line_id, old.work_order_line_id)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists work_order_lines_sync_flat_rate_credits on public.work_order_lines;
create trigger work_order_lines_sync_flat_rate_credits
after insert or update of status, labor_time, assigned_tech_id, punched_out_at
on public.work_order_lines
for each row execute function public.trg_sync_flat_rate_credits();

drop trigger if exists work_order_line_technicians_sync_flat_rate_credits on public.work_order_line_technicians;
create trigger work_order_line_technicians_sync_flat_rate_credits
after insert or update or delete on public.work_order_line_technicians
for each row execute function public.trg_sync_flat_rate_credits_from_assignment();

drop trigger if exists work_order_line_labor_segments_sync_flat_rate_credits on public.work_order_line_labor_segments;
create trigger work_order_line_labor_segments_sync_flat_rate_credits
after insert or update or delete on public.work_order_line_labor_segments
for each row execute function public.trg_sync_flat_rate_credits_from_assignment();

-- Existing completed work receives deterministic credits on migration. Manager
-- adjustments, if already present on a re-run, are preserved by the sync function.
do $$
declare
  v_line_id uuid;
begin
  for v_line_id in
    select id
    from public.work_order_lines
    where status in ('completed', 'ready_to_invoice', 'invoiced')
      and coalesce(labor_time, 0) > 0
  loop
    perform public.sync_work_order_line_flat_rate_credits(v_line_id);
  end loop;
end
$$;

grant execute on function public.sync_work_order_line_flat_rate_credits(uuid) to service_role;

-- Manager adjustments replace the full split in one transaction. The total must
-- continue to equal the approved labor hours, and finalized periods are immutable.
create or replace function public.replace_work_order_line_flat_rate_credits(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_line_id uuid,
  p_credits jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_line public.work_order_lines%rowtype;
  v_credit record;
  v_total numeric(12,4);
  v_credit_date date;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_profile_id then
    raise exception 'Actor identity mismatch';
  end if;

  select lower(coalesce(role::text, ''))
  into v_actor_role
  from public.profiles
  where id = p_actor_profile_id and shop_id = p_shop_id;

  if v_actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Not authorized to adjust flat-rate credits';
  end if;

  select *
  into v_line
  from public.work_order_lines
  where id = p_line_id and shop_id = p_shop_id
  for update;

  if not found then raise exception 'Work-order line not found'; end if;
  if coalesce(v_line.status, '') not in ('completed', 'ready_to_invoice', 'invoiced') then
    raise exception 'Only completed work can receive flat-rate credits';
  end if;
  if jsonb_typeof(p_credits) <> 'array' or jsonb_array_length(p_credits) = 0 then
    raise exception 'At least one technician credit is required';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'An adjustment reason is required';
  end if;

  select
    coalesce(sum((item->>'credit_hours')::numeric), 0),
    coalesce(v_line.punched_out_at, v_line.updated_at, now())::date
  into v_total, v_credit_date
  from jsonb_array_elements(p_credits) item;

  if exists (
    select 1
    from jsonb_array_elements(p_credits) item
    where (item->>'credit_hours')::numeric < 0
       or nullif(item->>'technician_id', '') is null
  ) then
    raise exception 'Technician credits must be valid and non-negative';
  end if;

  if abs(v_total - coalesce(v_line.labor_time, 0)::numeric) > 0.0001 then
    raise exception 'Flat-rate credits must total the line labor hours';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_credits) item
    left join public.profiles p
      on p.id = (item->>'technician_id')::uuid and p.shop_id = p_shop_id
    where p.id is null
  ) then
    raise exception 'All credited technicians must belong to this shop';
  end if;

  if exists (
    select 1
    from public.payroll_pay_periods period
    where period.shop_id = p_shop_id
      and v_credit_date between period.period_start and period.period_end
      and period.status in ('approved', 'exported')
  ) then
    raise exception 'The matching pay period is locked';
  end if;

  delete from public.work_order_line_flat_rate_credits
  where work_order_line_id = p_line_id;

  for v_credit in
    select
      (item->>'technician_id')::uuid as technician_id,
      round((item->>'credit_hours')::numeric, 4) as credit_hours
    from jsonb_array_elements(p_credits) item
  loop
    insert into public.work_order_line_flat_rate_credits (
      shop_id,
      work_order_id,
      work_order_line_id,
      technician_id,
      credit_hours,
      credit_source,
      actual_job_seconds,
      credited_at,
      adjusted_by,
      adjustment_reason
    )
    values (
      p_shop_id,
      v_line.work_order_id,
      p_line_id,
      v_credit.technician_id,
      v_credit.credit_hours,
      'manager_adjustment',
      coalesce((
        select sum(greatest(0, extract(epoch from (coalesce(s.ended_at, s.started_at) - s.started_at))))::bigint
        from public.work_order_line_labor_segments s
        where s.work_order_line_id = p_line_id
          and s.technician_id = v_credit.technician_id
      ), 0),
      coalesce(v_line.punched_out_at, v_line.updated_at, now()),
      p_actor_profile_id,
      trim(p_reason)
    );
  end loop;

  insert into public.audit_logs (
    actor_id, action, target, metadata
  ) values (
    p_actor_profile_id,
    'workforce.flat_rate_credits_adjusted',
    p_line_id::text,
    jsonb_build_object('shop_id', p_shop_id, 'reason', trim(p_reason), 'credits', p_credits)
  );

  return jsonb_build_object('ok', true, 'credited_hours', v_total);
end;
$$;

revoke all on function public.replace_work_order_line_flat_rate_credits(uuid, uuid, uuid, jsonb, text) from public;
grant execute on function public.replace_work_order_line_flat_rate_credits(uuid, uuid, uuid, jsonb, text) to authenticated, service_role;

create table if not exists public.work_order_line_labor_segment_corrections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  segment_id uuid not null references public.work_order_line_labor_segments(id) on delete restrict,
  correction_type text not null
    check (correction_type in ('add', 'correct', 'move', 'void')),
  original_values jsonb not null default '{}'::jsonb,
  corrected_values jsonb not null default '{}'::jsonb,
  reason text not null,
  corrected_by uuid not null references public.profiles(id) on delete restrict,
  corrected_at timestamptz not null default now()
);

create index if not exists labor_segment_corrections_segment_idx
  on public.work_order_line_labor_segment_corrections(segment_id, corrected_at desc);

alter table public.work_order_line_labor_segment_corrections enable row level security;
create policy labor_segment_corrections_scoped_select
  on public.work_order_line_labor_segment_corrections
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and public.profixiq_can_manage_workforce()
  );

-- Canonical job-time correction. Voiding preserves the source segment as a
-- zero-duration row and records its prior values; nothing is hard-deleted.
create or replace function public.correct_work_order_line_labor_segment(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_action text,
  p_segment_id uuid,
  p_technician_id uuid,
  p_work_order_line_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_segment public.work_order_line_labor_segments%rowtype;
  v_line public.work_order_lines%rowtype;
  v_original jsonb := '{}'::jsonb;
  v_corrected jsonb;
  v_segment_id uuid;
  v_work_date date;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_profile_id then
    raise exception 'Actor identity mismatch';
  end if;

  select lower(coalesce(role::text, ''))
  into v_actor_role
  from public.profiles
  where id = p_actor_profile_id and shop_id = p_shop_id;

  if v_actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Not authorized to correct job time';
  end if;
  if p_action not in ('add', 'correct', 'move', 'void') then
    raise exception 'Unsupported correction action';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A correction reason is required';
  end if;

  if p_action = 'add' then
    if p_segment_id is not null then raise exception 'New segments cannot supply an id'; end if;
    if p_technician_id is null or p_work_order_line_id is null or p_started_at is null or p_ended_at is null then
      raise exception 'Technician, work-order line, start, and end are required';
    end if;
  else
    select *
    into v_segment
    from public.work_order_line_labor_segments
    where id = p_segment_id and shop_id = p_shop_id
    for update;
    if not found then raise exception 'Labor segment not found'; end if;
    v_original := to_jsonb(v_segment);
  end if;

  if p_action = 'void' then
    p_technician_id := v_segment.technician_id;
    p_work_order_line_id := v_segment.work_order_line_id;
    p_started_at := v_segment.started_at;
    p_ended_at := v_segment.started_at;
  else
    p_technician_id := coalesce(p_technician_id, v_segment.technician_id);
    p_work_order_line_id := coalesce(p_work_order_line_id, v_segment.work_order_line_id);
    p_started_at := coalesce(p_started_at, v_segment.started_at);
    p_ended_at := coalesce(p_ended_at, v_segment.ended_at);
  end if;

  if p_ended_at is null or p_ended_at <= p_started_at then
    if p_action <> 'void' then raise exception 'End time must be after start time'; end if;
  end if;

  select *
  into v_line
  from public.work_order_lines
  where id = p_work_order_line_id and shop_id = p_shop_id;
  if not found then raise exception 'Work-order line not found'; end if;

  if not exists (
    select 1 from public.profiles
    where id = p_technician_id and shop_id = p_shop_id
  ) then
    raise exception 'Technician must belong to this shop';
  end if;

  v_work_date := p_started_at::date;
  if exists (
    select 1
    from public.payroll_pay_periods period
    where period.shop_id = p_shop_id
      and v_work_date between period.period_start and period.period_end
      and period.status in ('approved', 'exported')
  ) then
    raise exception 'The matching pay period is locked';
  end if;

  if p_action <> 'void' and exists (
    select 1
    from public.work_order_line_labor_segments other
    where other.shop_id = p_shop_id
      and other.technician_id = p_technician_id
      and other.id <> coalesce(p_segment_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and other.ended_at > p_started_at
      and other.started_at < p_ended_at
  ) then
    raise exception 'Corrected job time overlaps another labor segment';
  end if;

  if p_action = 'add' then
    insert into public.work_order_line_labor_segments (
      shop_id,
      work_order_id,
      work_order_line_id,
      technician_id,
      started_at,
      ended_at,
      source,
      created_by
    ) values (
      p_shop_id,
      v_line.work_order_id,
      p_work_order_line_id,
      p_technician_id,
      p_started_at,
      p_ended_at,
      'manager_correction',
      p_actor_profile_id
    )
    returning id into v_segment_id;
  else
    update public.work_order_line_labor_segments
    set
      work_order_id = v_line.work_order_id,
      work_order_line_id = p_work_order_line_id,
      technician_id = p_technician_id,
      started_at = p_started_at,
      ended_at = p_ended_at,
      source = case when p_action = 'void' then 'manager_void' else 'manager_correction' end,
      pause_reason = case
        when p_action = 'void' then 'Voided: ' || trim(p_reason)
        else pause_reason
      end,
      updated_at = now()
    where id = p_segment_id;
    v_segment_id := p_segment_id;
  end if;

  select to_jsonb(segment)
  into v_corrected
  from public.work_order_line_labor_segments segment
  where segment.id = v_segment_id;

  insert into public.work_order_line_labor_segment_corrections (
    shop_id,
    segment_id,
    correction_type,
    original_values,
    corrected_values,
    reason,
    corrected_by
  ) values (
    p_shop_id,
    v_segment_id,
    p_action,
    v_original,
    v_corrected,
    trim(p_reason),
    p_actor_profile_id
  );

  insert into public.audit_logs (
    actor_id, action, target, metadata
  ) values (
    p_actor_profile_id,
    'workforce.job_time_corrected',
    v_segment_id::text,
    jsonb_build_object('shop_id', p_shop_id, 'action', p_action, 'reason', trim(p_reason))
  );

  return jsonb_build_object('ok', true, 'segment_id', v_segment_id);
end;
$$;

revoke all on function public.correct_work_order_line_labor_segment(uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.correct_work_order_line_labor_segment(uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, text) to authenticated, service_role;

-- Atomic replacement for an open period snapshot. The route calculates the
-- deterministic rows; this function commits entries, exceptions, and period state
-- together so a failed refresh never leaves a half-empty period.
create or replace function public.replace_payroll_period_snapshot(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_period_id uuid,
  p_entries jsonb,
  p_exceptions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_period public.payroll_pay_periods%rowtype;
  v_entry_count integer := 0;
  v_exception_count integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_profile_id then
    raise exception 'Actor identity mismatch';
  end if;
  select lower(coalesce(role::text, '')) into v_actor_role
  from public.profiles where id = p_actor_profile_id and shop_id = p_shop_id;
  if v_actor_role not in ('owner', 'admin', 'manager') then raise exception 'Forbidden'; end if;

  select * into v_period
  from public.payroll_pay_periods
  where id = p_period_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Pay period not found'; end if;
  if v_period.status in ('approved', 'exported') then raise exception 'Approved/exported periods are locked'; end if;

  delete from public.payroll_time_exceptions where shop_id = p_shop_id and period_id = p_period_id;
  delete from public.payroll_time_entries where shop_id = p_shop_id and period_id = p_period_id;

  insert into public.payroll_time_entries (
    shop_id, period_id, user_id, work_date, worked_minutes, attendance_minutes,
    unpaid_break_minutes, paid_break_minutes, regular_minutes, overtime_minutes,
    job_minutes, flagged_minutes, adjustment_minutes, has_exceptions,
    warning_exception_count, blocking_exception_count, approval_state, source_snapshot
  )
  select
    p_shop_id, p_period_id, x.user_id, x.work_date, x.worked_minutes, x.attendance_minutes,
    x.unpaid_break_minutes, x.paid_break_minutes, x.regular_minutes, x.overtime_minutes,
    x.job_minutes, x.flagged_minutes, x.adjustment_minutes, x.has_exceptions,
    x.warning_exception_count, x.blocking_exception_count, 'draft', x.source_snapshot
  from jsonb_to_recordset(coalesce(p_entries, '[]'::jsonb)) as x(
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
    shop_id, period_id, user_id, work_date, severity, code, message, source_type, source_ref
  )
  select
    p_shop_id, p_period_id, x.user_id, x.work_date, x.severity, x.code, x.message, x.source_type, x.source_ref
  from jsonb_to_recordset(coalesce(p_exceptions, '[]'::jsonb)) as x(
    user_id uuid,
    work_date date,
    severity text,
    code text,
    message text,
    source_type text,
    source_ref jsonb
  );
  get diagnostics v_exception_count = row_count;

  update public.payroll_pay_periods
  set status = 'open', updated_at = now()
  where id = p_period_id and shop_id = p_shop_id;

  return jsonb_build_object('rows', v_entry_count, 'exceptions', v_exception_count);
end;
$$;

revoke all on function public.replace_payroll_period_snapshot(uuid, uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.replace_payroll_period_snapshot(uuid, uuid, uuid, jsonb, jsonb) to authenticated, service_role;
