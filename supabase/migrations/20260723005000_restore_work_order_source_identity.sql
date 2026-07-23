begin;

-- The live schema already carries these import/idempotency identities, but
-- the replayable migration baseline omitted them. Restore both before portal
-- quote migrations create filtered indexes and write operation keys.
alter table public.work_orders
  add column if not exists source_row_id text,
  add column if not exists external_id text;

create index if not exists work_orders_source_row_id_idx
  on public.work_orders(source_row_id)
  where source_row_id is not null;

commit;
