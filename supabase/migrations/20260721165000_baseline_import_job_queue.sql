-- Restore the canonical shop-scoped import job queue before mobile inspection
-- form imports extend it. Existing databases are validated and left unchanged.

do $$
declare
  v_mode text;
  v_missing_tables text[];
  v_missing_columns text[];
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
      into v_missing_tables
    from unnest(array['import_jobs', 'import_job_rows']::text[])
      as required(required_table)
    where to_regclass('public.' || required_table) is null;

    if coalesce(array_length(v_missing_tables, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: import job queue tables are missing: '
          || array_to_string(v_missing_tables, ', ');
    end if;

    select array_agg(table_name || '.' || required_column order by table_name, required_column)
      into v_missing_columns
    from (
      values
        ('import_jobs', 'id'),
        ('import_jobs', 'shop_id'),
        ('import_jobs', 'created_by'),
        ('import_jobs', 'import_type'),
        ('import_jobs', 'status'),
        ('import_jobs', 'total_rows'),
        ('import_jobs', 'processed_rows'),
        ('import_jobs', 'imported_count'),
        ('import_jobs', 'skipped_count'),
        ('import_jobs', 'failed_count'),
        ('import_jobs', 'error_message'),
        ('import_jobs', 'source_storage_path'),
        ('import_jobs', 'summary'),
        ('import_jobs', 'created_at'),
        ('import_jobs', 'updated_at'),
        ('import_jobs', 'completed_at'),
        ('import_job_rows', 'id'),
        ('import_job_rows', 'job_id'),
        ('import_job_rows', 'shop_id'),
        ('import_job_rows', 'row_number'),
        ('import_job_rows', 'raw_row'),
        ('import_job_rows', 'status'),
        ('import_job_rows', 'error_message'),
        ('import_job_rows', 'created_at'),
        ('import_job_rows', 'updated_at')
    ) as required(table_name, required_column)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = required.table_name
        and c.column_name = required.required_column
    );

    if coalesce(array_length(v_missing_columns, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: import job queue columns are missing: '
          || array_to_string(v_missing_columns, ', ');
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  import_type text not null,
  status text not null default 'queued',
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_message text,
  source_storage_path text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint import_jobs_import_type_check
    check (import_type in ('vehicle_history', 'invoices', 'vehicles')),
  constraint import_jobs_status_check
    check (status in ('queued', 'processing', 'completed', 'failed'))
);

create table if not exists public.import_job_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  row_number integer not null check (row_number >= 0),
  raw_row jsonb not null,
  status text not null default 'queued',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_job_rows_status_check
    check (status in ('queued', 'processing', 'imported', 'skipped', 'failed')),
  constraint import_job_rows_job_row_unique unique (job_id, row_number)
);

create index if not exists import_jobs_shop_status_idx
  on public.import_jobs(shop_id, status, created_at);
create index if not exists import_jobs_type_status_idx
  on public.import_jobs(import_type, status, created_at);
create index if not exists import_job_rows_job_status_row_idx
  on public.import_job_rows(job_id, status, row_number);
create index if not exists import_job_rows_shop_idx
  on public.import_job_rows(shop_id);

alter table public.import_jobs enable row level security;
alter table public.import_job_rows enable row level security;

drop policy if exists import_jobs_shop_select on public.import_jobs;
create policy import_jobs_shop_select on public.import_jobs
  for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists import_jobs_shop_insert on public.import_jobs;
create policy import_jobs_shop_insert on public.import_jobs
  for insert to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists import_job_rows_shop_select on public.import_job_rows;
create policy import_job_rows_shop_select on public.import_job_rows
  for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists import_job_rows_shop_insert on public.import_job_rows;
create policy import_job_rows_shop_insert on public.import_job_rows
  for insert to authenticated
  with check (shop_id = public.current_shop_id());

create or replace function public.set_import_job_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_import_jobs_updated_at on public.import_jobs;
create trigger set_import_jobs_updated_at
before update on public.import_jobs
for each row execute function public.set_import_job_updated_at();

drop trigger if exists set_import_job_rows_updated_at on public.import_job_rows;
create trigger set_import_job_rows_updated_at
before update on public.import_job_rows
for each row execute function public.set_import_job_updated_at();
