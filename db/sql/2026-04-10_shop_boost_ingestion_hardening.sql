-- Shop Boost ingestion hardening (additive, non-breaking)
-- 1) Add part-level idempotency + traceability fields.
alter table public.parts
  add column if not exists normalized_part_key text,
  add column if not exists source_intake_id uuid,
  add column if not exists external_id text,
  add column if not exists import_notes text;

-- 2) Backfill normalized_part_key for existing rows where possible.
update public.parts
set normalized_part_key = lower(
  coalesce(regexp_replace(part_number, '[^a-zA-Z0-9]+', '', 'g'), '') || '|' ||
  coalesce(regexp_replace(sku, '[^a-zA-Z0-9]+', '', 'g'), '') || '|' ||
  coalesce(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g'), '') || '|' ||
  coalesce(regexp_replace(supplier, '[^a-zA-Z0-9]+', '', 'g'), '') || '|' ||
  coalesce(regexp_replace(category, '[^a-zA-Z0-9]+', '', 'g')
))
where normalized_part_key is null;

-- 3) Lightweight indexes to support rerun dedupe + intake trace lookups.
create index if not exists idx_parts_shop_normalized_part_key
  on public.parts (shop_id, normalized_part_key);

create index if not exists idx_parts_source_intake_id
  on public.parts (source_intake_id);

create index if not exists idx_parts_shop_external_id
  on public.parts (shop_id, external_id);
