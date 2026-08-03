-- Restore the durable import queue omitted from the historical public-schema
-- dump, and add shop ownership to inspection templates before mobile form imports.

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
    select array_agg(required_object order by required_object)
      into v_missing
    from unnest(array[
      'table:import_jobs',
      'table:import_job_rows',
      'column:inspection_templates.shop_id'
    ]::text[]) as required(required_object)
    where case required_object
      when 'table:import_jobs' then to_regclass('public.import_jobs') is null
      when 'table:import_job_rows' then to_regclass('public.import_job_rows') is null
      when 'column:inspection_templates.shop_id' then not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'inspection_templates'
          and c.column_name = 'shop_id'
      )
      else true
    end;

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: import foundation is missing: '
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

alter table public.inspection_templates
  add column if not exists shop_id uuid references public.shops(id) on delete cascade;

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  import_type text not null,
  status text not null default 'queued',
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  source_storage_path text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint import_jobs_import_type_check
    check (import_type in ('vehicle_history', 'invoices', 'vehicles', 'inspection_form')),
  constraint import_jobs_status_check
    check (status in ('queued', 'processing', 'completed', 'failed'))
);

create table if not exists public.import_job_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  row_number integer not null,
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
create index if not exists inspection_templates_shop_updated_idx
  on public.inspection_templates(shop_id, updated_at desc)
  where shop_id is not null;

alter table public.import_jobs enable row level security;
alter table public.import_job_rows enable row level security;

do $$ begin
  create policy import_jobs_shop_select on public.import_jobs
    for select to authenticated
    using (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy import_jobs_shop_insert on public.import_jobs
    for insert to authenticated
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy import_job_rows_shop_select on public.import_job_rows
    for select to authenticated
    using (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy import_job_rows_shop_insert on public.import_job_rows
    for insert to authenticated
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;

create or replace function public.set_import_job_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
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
