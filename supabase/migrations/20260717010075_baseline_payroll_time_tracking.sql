-- Restore the payroll-time domain required by audited shift corrections and
-- workforce administration. Existing databases are validated and left
-- unchanged; clean bootstraps receive the canonical attendance-first schema.

do $$
declare
  v_mode text;
  v_missing text[];
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    select array_agg(required_table order by required_table)
      into v_missing
    from unnest(array[
      'shop_payroll_settings',
      'payroll_pay_periods',
      'payroll_time_entries',
      'payroll_time_exceptions',
      'payroll_export_batches',
      'payroll_export_rows',
      'payroll_employee_mappings'
    ]::text[]) as required(required_table)
    where to_regclass('public.' || required_table) is null;

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: payroll-time tables are missing: '
          || array_to_string(v_missing, ', ');
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

create table if not exists public.shop_payroll_settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  cadence text not null default 'biweekly'
    check (cadence in ('weekly','biweekly','semimonthly','monthly')),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  daily_overtime_after_minutes integer not null default 480 check (daily_overtime_after_minutes >= 0),
  weekly_overtime_after_minutes integer not null default 2400 check (weekly_overtime_after_minutes >= 0),
  suspicious_shift_minutes integer not null default 960 check (suspicious_shift_minutes >= 60),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id)
);

create table if not exists public.payroll_pay_periods (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open'
    check (status in ('draft','open','approved','exported')),
  locked_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  exported_at timestamptz,
  exported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text,
  check (period_end >= period_start),
  unique (shop_id, period_start, period_end)
);

create table if not exists public.payroll_time_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  period_id uuid not null references public.payroll_pay_periods(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  worked_minutes integer not null default 0,
  unpaid_break_minutes integer not null default 0,
  paid_break_minutes integer not null default 0,
  regular_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  attendance_minutes integer not null default 0,
  job_minutes integer not null default 0,
  adjustment_minutes integer not null default 0,
  has_exceptions boolean not null default false,
  blocking_exception_count integer not null default 0,
  warning_exception_count integer not null default 0,
  approval_state text not null default 'draft'
    check (approval_state in ('draft','reviewed','approved','locked')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, user_id, work_date)
);

create table if not exists public.payroll_time_exceptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  period_id uuid not null references public.payroll_pay_periods(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date,
  severity text not null check (severity in ('warning','blocking')),
  code text not null,
  message text not null,
  source_type text not null default 'attendance'
    check (source_type in ('attendance','job_time','manual_adjustment','system')),
  source_ref jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (period_id, user_id, work_date, code, message)
);

create table if not exists public.payroll_export_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  period_id uuid not null references public.payroll_pay_periods(id) on delete cascade,
  provider_type text not null default 'csv'
    check (provider_type in ('csv','wagepoint','payworks','dayforce','generic')),
  status text not null default 'pending'
    check (status in ('pending','generated','failed','exported')),
  exported_at timestamptz,
  exported_by uuid references public.profiles(id) on delete set null,
  row_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_export_rows (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  batch_id uuid not null references public.payroll_export_batches(id) on delete cascade,
  period_id uuid not null references public.payroll_pay_periods(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  employee_external_id text,
  regular_hours numeric(10,2) not null default 0,
  overtime_hours numeric(10,2) not null default 0,
  unpaid_break_hours numeric(10,2) not null default 0,
  total_hours numeric(10,2) not null default 0,
  row_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_employee_mappings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_type text not null default 'generic'
    check (provider_type in ('wagepoint','payworks','dayforce','generic')),
  external_employee_id text,
  pay_group text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id, provider_type)
);

create index if not exists idx_payroll_periods_shop_status
  on public.payroll_pay_periods(shop_id, status, period_start desc);
create index if not exists idx_payroll_entries_period_user
  on public.payroll_time_entries(period_id, user_id, work_date);
create index if not exists idx_payroll_exceptions_period_severity
  on public.payroll_time_exceptions(period_id, severity, resolved);
create index if not exists idx_payroll_export_batches_period
  on public.payroll_export_batches(period_id, created_at desc);

alter table public.shop_payroll_settings enable row level security;
alter table public.payroll_pay_periods enable row level security;
alter table public.payroll_time_entries enable row level security;
alter table public.payroll_time_exceptions enable row level security;
alter table public.payroll_export_batches enable row level security;
alter table public.payroll_export_rows enable row level security;
alter table public.payroll_employee_mappings enable row level security;

do $$ begin
  create policy shop_payroll_settings_shop_all on public.shop_payroll_settings
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payroll_pay_periods_shop_all on public.payroll_pay_periods
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payroll_time_entries_shop_all on public.payroll_time_entries
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payroll_time_exceptions_shop_all on public.payroll_time_exceptions
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payroll_export_batches_shop_all on public.payroll_export_batches
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payroll_export_rows_shop_all on public.payroll_export_rows
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payroll_employee_mappings_shop_all on public.payroll_employee_mappings
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
