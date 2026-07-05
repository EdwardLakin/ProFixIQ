-- Vehicle History import jobs: async staging and progress tracking.
-- Backfill first so duplicate detection can be shop-scoped without large customer_id.in(...) filters.
alter table public.history add column if not exists shop_id uuid;

update public.history h
set shop_id = c.shop_id
from public.customers c
where h.customer_id = c.id
  and h.shop_id is null
  and c.shop_id is not null;

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
  constraint import_jobs_import_type_check check (import_type in ('vehicle_history')),
  constraint import_jobs_status_check check (status in ('queued', 'processing', 'completed', 'failed'))
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
  constraint import_job_rows_status_check check (status in ('queued', 'imported', 'skipped', 'failed')),
  constraint import_job_rows_job_row_unique unique (job_id, row_number)
);

create index if not exists import_jobs_shop_status_idx on public.import_jobs(shop_id, status, created_at);
create index if not exists import_jobs_type_status_idx on public.import_jobs(import_type, status, created_at);
create index if not exists import_job_rows_job_status_row_idx on public.import_job_rows(job_id, status, row_number);
create index if not exists import_job_rows_shop_idx on public.import_job_rows(shop_id);
create index if not exists history_shop_work_order_number_idx on public.history(shop_id, work_order_number) where work_order_number is not null;
create index if not exists history_shop_invoice_number_idx on public.history(shop_id, invoice_number) where invoice_number is not null;

alter table public.import_jobs enable row level security;
alter table public.import_job_rows enable row level security;

create policy "Shop members can read import jobs"
  on public.import_jobs for select
  using (shop_id in (select profiles.shop_id from public.profiles where profiles.id = auth.uid()));

create policy "Shop members can create import jobs"
  on public.import_jobs for insert
  with check (shop_id in (select profiles.shop_id from public.profiles where profiles.id = auth.uid()));

create policy "Shop members can read import job rows"
  on public.import_job_rows for select
  using (shop_id in (select profiles.shop_id from public.profiles where profiles.id = auth.uid()));

create policy "Shop members can create import job rows"
  on public.import_job_rows for insert
  with check (shop_id in (select profiles.shop_id from public.profiles where profiles.id = auth.uid()));

create or replace function public.set_import_job_updated_at()
returns trigger language plpgsql as $$
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
