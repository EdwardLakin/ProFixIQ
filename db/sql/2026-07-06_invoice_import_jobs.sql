-- Invoice CSV guided import support: allow invoice import jobs and speed duplicate checks.
alter table public.import_jobs drop constraint if exists import_jobs_import_type_check;
alter table public.import_jobs
  add constraint import_jobs_import_type_check
  check (import_type in ('vehicle_history', 'invoices'));

create index if not exists invoices_shop_invoice_number_idx
  on public.invoices(shop_id, invoice_number)
  where invoice_number is not null;
