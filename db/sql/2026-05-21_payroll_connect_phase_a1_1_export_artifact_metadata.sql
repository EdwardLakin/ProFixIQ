-- Payroll Connect Phase A1.1: export artifact metadata (migration only)
-- Additive schema only; preserves existing inline CSV export behavior from A0.

alter table public.payroll_export_batches
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists file_sha256 text,
  add column if not exists download_count integer not null default 0,
  add column if not exists last_downloaded_at timestamptz,
  add column if not exists last_downloaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists provider_template_version text,
  add column if not exists handoff_status text not null default 'generated',
  add column if not exists handed_off_at timestamptz,
  add column if not exists handed_off_by uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.payroll_export_batches
    add constraint payroll_export_batches_download_count_nonnegative
    check (download_count >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.payroll_export_batches
    add constraint payroll_export_batches_file_size_bytes_nonnegative
    check (file_size_bytes is null or file_size_bytes >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.payroll_export_batches
    add constraint payroll_export_batches_handoff_status_valid
    check (handoff_status in ('generated','downloaded','handed_off','failed'));
exception when duplicate_object then null; end $$;

create index if not exists idx_payroll_export_batches_shop_period_created
  on public.payroll_export_batches(shop_id, period_id, created_at desc);

create index if not exists idx_payroll_export_batches_shop_handoff_status
  on public.payroll_export_batches(shop_id, handoff_status);

comment on column public.payroll_export_batches.storage_bucket is
  'Private storage bucket for payroll export CSV artifacts; A1 preserves A0 inline CSV response compatibility. Do not store public URLs.';

comment on column public.payroll_export_batches.storage_path is
  'Private storage object path for payroll export CSV artifacts; A1 preserves A0 inline CSV response compatibility. Do not store public URLs.';

comment on column public.payroll_export_batches.file_size_bytes is
  'Stored payroll export CSV artifact size in bytes for private artifact metadata; no public URL storage.';

comment on column public.payroll_export_batches.file_sha256 is
  'SHA-256 checksum for private payroll export CSV artifact integrity; no public URL storage.';
