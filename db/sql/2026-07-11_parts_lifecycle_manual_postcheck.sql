-- Read-only postcheck for the consolidated manual parts lifecycle migration.
-- Run after db/sql/2026-07-11_parts_lifecycle_consolidated_manual.sql.

with recursive replacement_walk as (
  select id, replaced_by_work_order_part_id, array[id] as path, false as cycle
  from public.work_order_parts
  where replaced_by_work_order_part_id is not null
  union all
  select w.id, next.replaced_by_work_order_part_id, w.path || next.id, next.id = any(w.path)
  from replacement_walk w
  join public.work_order_parts next on next.id = w.replaced_by_work_order_part_id
  where not w.cycle and array_length(w.path, 1) < 25
), required_columns as (
  select * from (values
    ('work_order_parts','work_order_line_id'),('work_order_parts','source_parts_request_id'),('work_order_parts','source_parts_request_item_id'),
    ('work_order_parts','description_snapshot'),('work_order_parts','manufacturer_snapshot'),('work_order_parts','part_number_snapshot'),
    ('work_order_parts','quantity_requested'),('work_order_parts','quantity_ordered'),('work_order_parts','quantity_received'),
    ('work_order_parts','quantity_allocated'),('work_order_parts','quantity_consumed'),('work_order_parts','quantity_returned'),
    ('work_order_parts','quantity_cancelled'),('work_order_parts','unit_cost_snapshot'),('work_order_parts','unit_sell_price_snapshot'),
    ('work_order_parts','lifecycle_status'),('work_order_parts','is_active'),('work_order_parts','replaced_from_work_order_part_id'),('work_order_parts','replaced_by_work_order_part_id'),
    ('work_order_part_allocations','work_order_part_id'),('work_order_part_allocations','source_request_item_id'),('work_order_part_allocations','shop_id'),('work_order_part_allocations','work_order_id'),
    ('stock_moves','idempotency_key'),('stock_moves','work_order_part_id'),('stock_moves','part_request_item_id'),('stock_moves','purchase_order_line_id'),('stock_moves','metadata'),('stock_moves','lifecycle_quantity'),
    ('purchase_order_lines','part_request_item_id'),('purchase_order_lines','work_order_part_id'),('purchase_order_lines','idempotency_key')
  ) as c(table_name, column_name)
), required_constraints as (
  select * from (values
    ('work_order_parts_source_request_item_id_fkey'),('work_order_parts_source_request_id_fkey'),('work_order_parts_work_order_line_id_fkey'),
    ('work_order_parts_replaced_from_fkey'),('work_order_parts_replaced_by_fkey'),('work_order_part_allocations_work_order_part_id_fkey'),
    ('work_order_part_allocations_source_request_item_id_fkey'),('stock_moves_work_order_part_id_fkey'),('stock_moves_part_request_item_id_fkey'),
    ('stock_moves_purchase_order_line_id_fkey'),('purchase_order_lines_part_request_item_id_fkey'),('purchase_order_lines_work_order_part_id_fkey'),
    ('work_order_parts_no_self_replacement')
  ) as c(conname)
), required_indexes as (
  select * from (values
    ('uq_work_order_parts_active_source_request_item'),('uq_wopa_work_order_part_location'),('uq_stock_moves_shop_idempotency_key'),
    ('uq_purchase_order_lines_idempotency'),('idx_stock_moves_work_order_part_id'),('idx_purchase_order_lines_work_order_part_id')
  ) as i(indexname)
), required_functions as (
  select * from (values
    ('public.parts_attach_request_item(uuid)'::regprocedure),
    ('public.parts_allocate_request_item(uuid,uuid,numeric,text)'::regprocedure),
    ('public.parts_release_allocation(uuid,uuid,numeric,text)'::regprocedure),
    ('public.parts_create_po_line_for_request(uuid,uuid,numeric,numeric,uuid,text)'::regprocedure),
    ('public.parts_receive_request_item(uuid,uuid,numeric,uuid,numeric,text)'::regprocedure),
    ('public.parts_issue_work_order_part(uuid,uuid,numeric,text)'::regprocedure),
    ('public.parts_return_to_stock(uuid,uuid,numeric,text)'::regprocedure),
    ('public.parts_cancel_request_item(uuid,text)'::regprocedure),
    ('public.parts_replace_request_item(uuid,uuid,uuid,numeric,text)'::regprocedure),
    ('public.parts_on_hand(uuid,uuid,uuid)'::regprocedure),
    ('public.parts_allocated(uuid,uuid,uuid)'::regprocedure),
    ('public.parts_available(uuid,uuid,uuid)'::regprocedure)
  ) as f(regproc)
), stock_balances as (
  select p.shop_id, p.id as part_id,
    public.parts_on_hand(p.shop_id, p.id, null) as on_hand,
    public.parts_allocated(p.shop_id, p.id, null) as allocated,
    public.parts_available(p.shop_id, p.id, null) as available
  from public.parts p
), findings as (
  select 'missing_required_columns' finding, count(*)::bigint count, 'blocker' severity
  from required_columns rc left join information_schema.columns c on c.table_schema='public' and c.table_name=rc.table_name and c.column_name=rc.column_name where c.column_name is null
  union all select 'missing_required_constraints', count(*), 'blocker'
  from required_constraints rc left join pg_constraint pc on pc.conname=rc.conname where pc.conname is null
  union all select 'missing_required_indexes', count(*), 'blocker'
  from required_indexes ri left join pg_indexes pi on pi.schemaname='public' and pi.indexname=ri.indexname where pi.indexname is null
  union all select 'legacy_broad_stock_move_reference_reason_index_present', count(*), 'blocker'
  from pg_indexes where schemaname='public' and indexname='uq_stock_moves_reference_reason'
  union all select 'missing_required_functions', count(*), 'blocker'
  from required_functions rf where to_regprocedure(rf.regproc::text) is null
  union all select 'lifecycle_functions_executable_by_anon', count(*), 'blocker'
  from information_schema.routine_privileges
  where routine_schema='public' and grantee='anon' and routine_name in ('parts_attach_request_item','parts_allocate_request_item','parts_release_allocation','parts_receive_request_item','parts_issue_work_order_part','parts_return_to_stock','parts_cancel_request_item','parts_replace_request_item','upsert_part_allocation_from_request_item','receive_part_request_item')
  union all select 'unresolved_allocation_work_order_part_links', count(*), 'review'
  from public.work_order_part_allocations where work_order_part_id is null
  union all select 'active_duplicate_work_order_parts_per_request_item', count(*), 'blocker'
  from (select source_parts_request_item_id from public.work_order_parts where source_parts_request_item_id is not null and coalesce(is_active,true) group by 1 having count(*) > 1) d
  union all select 'cross_scope_allocation_links', count(*), 'blocker'
  from public.work_order_part_allocations a join public.work_order_parts wop on wop.id=a.work_order_part_id
  where a.shop_id is distinct from wop.shop_id or a.work_order_id is distinct from wop.work_order_id or a.work_order_line_id is distinct from wop.work_order_line_id
  union all select 'invalid_negative_lifecycle_quantities', count(*), 'blocker'
  from public.work_order_parts where least(quantity_requested, quantity_ordered, quantity_received, quantity_allocated, quantity_consumed, quantity_returned, quantity_cancelled) < 0
  union all select 'stock_available_below_zero', count(*), 'review'
  from stock_balances where available < 0
  union all select 'stock_allocated_greater_than_on_hand', count(*), 'review'
  from stock_balances where allocated > on_hand
  union all select 'replacement_link_self_or_cycle', count(*), 'blocker'
  from public.work_order_parts wop where wop.id = wop.replaced_from_work_order_part_id or wop.id = wop.replaced_by_work_order_part_id
  union all select 'replacement_link_cycles', count(*), 'blocker'
  from replacement_walk where cycle
  union all select 'replacement_link_scope_mismatches', count(*), 'blocker'
  from public.work_order_parts wop join public.work_order_parts other on other.id = coalesce(wop.replaced_from_work_order_part_id, wop.replaced_by_work_order_part_id)
  where wop.source_parts_request_item_id is distinct from other.source_parts_request_item_id or wop.shop_id is distinct from other.shop_id or wop.work_order_id is distinct from other.work_order_id or wop.work_order_line_id is distinct from other.work_order_line_id
  union all select 'zero_quantity_reservation_audit_missing_lifecycle_quantity', count(*), 'blocker'
  from public.stock_moves where reason in ('wo_allocate','wo_release') and qty_change = 0 and coalesce(lifecycle_quantity,0) <= 0
  union all select 'invoice_parts_missing_canonical_work_order_part_refs', count(*), 'review'
  from public.part_request_items i join public.invoices inv on inv.work_order_id=i.work_order_id left join public.work_order_parts wop on wop.source_parts_request_item_id=i.id where i.part_id is not null and wop.id is null
)
select * from findings order by severity, finding;
