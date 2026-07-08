-- Vehicle CSV async import support: allow vehicle import jobs.
-- Existing rows are already limited to vehicle_history/invoices by the prior check;
-- this migration only widens the accepted import_type values.
alter table public.import_jobs drop constraint if exists import_jobs_import_type_check;
alter table public.import_jobs
  add constraint import_jobs_import_type_check
  check (import_type in ('vehicle_history', 'invoices', 'vehicles'));
