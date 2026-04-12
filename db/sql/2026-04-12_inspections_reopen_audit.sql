-- Add reopen audit fields for locked/finalized inspections.
-- Incremental and non-breaking: nullable columns, no constraint backfills required.

alter table if exists public.inspections
  add column if not exists reopened_at timestamptz null,
  add column if not exists reopened_by uuid null,
  add column if not exists reopen_reason text null;

create index if not exists inspections_reopened_at_idx
  on public.inspections (reopened_at desc)
  where reopened_at is not null;

create index if not exists inspections_reopened_by_idx
  on public.inspections (reopened_by)
  where reopened_by is not null;
