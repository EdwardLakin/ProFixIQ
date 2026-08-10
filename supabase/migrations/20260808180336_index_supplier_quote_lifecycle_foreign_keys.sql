begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create index if not exists parts_supplier_quote_requests_work_order_fk_idx
  on public.parts_supplier_quote_requests(work_order_id);
create index if not exists parts_supplier_quote_requests_supplier_fk_idx
  on public.parts_supplier_quote_requests(supplier_id);
create index if not exists parts_supplier_quote_requests_created_by_fk_idx
  on public.parts_supplier_quote_requests(created_by)
  where created_by is not null;
create index if not exists parts_supplier_quote_requests_responded_by_fk_idx
  on public.parts_supplier_quote_requests(responded_by)
  where responded_by is not null;
create index if not exists parts_supplier_quote_requests_draft_po_fk_idx
  on public.parts_supplier_quote_requests(draft_po_id)
  where draft_po_id is not null;
create index if not exists parts_supplier_quote_requests_po_contacted_by_fk_idx
  on public.parts_supplier_quote_requests(po_contacted_by)
  where po_contacted_by is not null;

create index if not exists purchase_orders_supplier_fk_idx
  on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_work_order_fk_idx
  on public.purchase_orders(work_order_id)
  where work_order_id is not null;
create index if not exists purchase_orders_supplier_contacted_by_fk_idx
  on public.purchase_orders(supplier_contacted_by)
  where supplier_contacted_by is not null;

-- The unique partial index covers the same lookup and FK path.
drop index if exists public.purchase_orders_supplier_quote_request_idx;

commit;
