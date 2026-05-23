-- Adds durable linkage from PO lines back to source part_request_items for traceability + idempotency.

alter table public.purchase_order_lines
  add column if not exists part_request_item_id uuid;

comment on column public.purchase_order_lines.part_request_item_id is
  'Source part request item used to create this PO line; supports traceability and idempotent request→PO creation. inventory part_id remains optional.';

do $$
begin
  if to_regclass('public.part_request_items') is null then
    raise notice 'Skipping purchase_order_lines_part_request_item_id_fkey: public.part_request_items does not exist.';
  elsif not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_order_lines_part_request_item_id_fkey'
      and conrelid = 'public.purchase_order_lines'::regclass
  ) then
    alter table public.purchase_order_lines
      add constraint purchase_order_lines_part_request_item_id_fkey
      foreign key (part_request_item_id)
      references public.part_request_items(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_purchase_order_lines_part_request_item_id
  on public.purchase_order_lines (part_request_item_id);

create unique index if not exists uq_purchase_order_lines_po_request_item
  on public.purchase_order_lines (po_id, part_request_item_id)
  where part_request_item_id is not null;
