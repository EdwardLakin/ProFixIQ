begin;

-- The live schema already carries this import/idempotency identity, but the
-- replayable migration baseline omitted it. Restore it before portal quote
-- migrations create filtered indexes and write portal_quote operation keys.
alter table public.work_orders
  add column if not exists source_row_id text;

create index if not exists work_orders_source_row_id_idx
  on public.work_orders(source_row_id)
  where source_row_id is not null;

commit;
