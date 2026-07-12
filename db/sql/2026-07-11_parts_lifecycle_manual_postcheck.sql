-- Read-only postcheck for the consolidated manual parts lifecycle migration.
-- Run after db/sql/2026-07-11_parts_lifecycle_consolidated_manual.sql.
-- This script reports missing final schema instead of crashing when a final
-- column/function is absent.

with recursive replacement_walk as (
  select
    (to_jsonb(w)->>'id')::uuid as id,
    nullif(to_jsonb(w)->>'replaced_by_work_order_part_id','')::uuid as replaced_by_work_order_part_id,
    array[(to_jsonb(w)->>'id')::uuid] as path,
    false as cycle
  from public.work_order_parts w
  where nullif(to_jsonb(w)->>'replaced_by_work_order_part_id','') is not null
  union all
  select w.id, nullif(to_jsonb(next)->>'replaced_by_work_order_part_id','')::uuid, w.path || next.id, next.id = any(w.path)
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
), column_presence as (
  select rc.table_name, rc.column_name, c.column_name is not null as exists
  from required_columns rc
  left join information_schema.columns c on c.table_schema='public' and c.table_name=rc.table_name and c.column_name=rc.column_name
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
    ('public.parts_attach_request_item(uuid)'),
    ('public.parts_allocate_request_item(uuid,uuid,numeric,text)'),
    ('public.parts_release_allocation(uuid,uuid,numeric,text)'),
    ('public.parts_create_po_line_for_request(uuid,uuid,numeric,numeric,uuid,text)'),
    ('public.parts_receive_request_item(uuid,uuid,numeric,uuid,numeric,text)'),
    ('public.parts_issue_work_order_part(uuid,uuid,numeric,text)'),
    ('public.parts_return_to_stock(uuid,uuid,numeric,text)'),
    ('public.parts_cancel_request_item(uuid,text)'),
    ('public.parts_replace_request_item(uuid,uuid,uuid,numeric,text)'),
    ('public.parts_on_hand(uuid,uuid,uuid)'),
    ('public.parts_allocated(uuid,uuid,uuid)'),
    ('public.parts_available(uuid,uuid,uuid)')
  ) as f(signature)
), wop as (
  select to_jsonb(w) as row from public.work_order_parts w
), alloc as (
  select to_jsonb(a) as row from public.work_order_part_allocations a
), stock as (
  select to_jsonb(sm) as row from public.stock_moves sm
), stock_balances as (
  select
    p.shop_id,
    p.id as part_id,
    coalesce(sum((stock.row->>'qty_change')::numeric) filter (where stock.row->>'reason' not in ('wo_allocate','wo_release')),0) as on_hand,
    coalesce((select sum((a.row->>'qty')::numeric) from alloc a where (a.row->>'shop_id')::uuid=p.shop_id and (a.row->>'part_id')::uuid=p.id),0) as allocated
  from public.parts p
  left join stock on (stock.row->>'shop_id')::uuid=p.shop_id and (stock.row->>'part_id')::uuid=p.id
  group by p.shop_id, p.id
), findings as (
  select 'missing_required_columns' finding, count(*)::bigint count, 'blocker' severity
  from column_presence where not exists
  union all select 'missing_required_constraints', count(*), 'blocker'
  from required_constraints rc left join pg_constraint pc on pc.conname=rc.conname where pc.conname is null
  union all select 'missing_required_indexes', count(*), 'blocker'
  from required_indexes ri left join pg_indexes pi on pi.schemaname='public' and pi.indexname=ri.indexname where pi.indexname is null
  union all select 'legacy_broad_stock_move_reference_reason_index_present', count(*), 'blocker'
  from pg_indexes where schemaname='public' and indexname='uq_stock_moves_reference_reason'
  union all select 'missing_required_functions', count(*), 'blocker'
  from required_functions rf where to_regprocedure(rf.signature) is null
  union all select 'lifecycle_functions_executable_by_anon', count(*), 'blocker'
  from information_schema.routine_privileges
  where routine_schema='public' and grantee='anon' and routine_name in ('parts_attach_request_item','parts_allocate_request_item','parts_release_allocation','parts_receive_request_item','parts_issue_work_order_part','parts_return_to_stock','parts_cancel_request_item','parts_replace_request_item','upsert_part_allocation_from_request_item','receive_part_request_item')
  union all select 'unresolved_allocation_work_order_part_links', count(*), 'review'
  from alloc where nullif(row->>'work_order_part_id','') is null
  union all select 'active_duplicate_work_order_parts_per_request_item', count(*), 'blocker'
  from (select row->>'source_parts_request_item_id' source_item from wop where nullif(row->>'source_parts_request_item_id','') is not null and coalesce((row->>'is_active')::boolean,true) group by 1 having count(*) > 1) d
  union all select 'cross_scope_allocation_links', count(*), 'blocker'
  from alloc a join public.work_order_parts wop_row on wop_row.id = nullif(a.row->>'work_order_part_id','')::uuid
  where nullif(a.row->>'shop_id','')::uuid is distinct from wop_row.shop_id
     or nullif(a.row->>'work_order_id','')::uuid is distinct from wop_row.work_order_id
     or nullif(a.row->>'work_order_line_id','')::uuid is distinct from nullif(to_jsonb(wop_row)->>'work_order_line_id','')::uuid
  union all select 'invalid_negative_lifecycle_quantities', count(*), 'blocker'
  from wop where least(
    coalesce(nullif(row->>'quantity_requested','')::numeric,0), coalesce(nullif(row->>'quantity_ordered','')::numeric,0),
    coalesce(nullif(row->>'quantity_received','')::numeric,0), coalesce(nullif(row->>'quantity_allocated','')::numeric,0),
    coalesce(nullif(row->>'quantity_consumed','')::numeric,0), coalesce(nullif(row->>'quantity_returned','')::numeric,0),
    coalesce(nullif(row->>'quantity_cancelled','')::numeric,0)
  ) < 0
  union all select 'stock_available_below_zero', count(*), 'review'
  from stock_balances where on_hand - allocated < 0
  union all select 'stock_allocated_greater_than_on_hand', count(*), 'review'
  from stock_balances where allocated > on_hand
  union all select 'replacement_link_self_or_cycle', count(*), 'blocker'
  from wop where row->>'id' = row->>'replaced_from_work_order_part_id' or row->>'id' = row->>'replaced_by_work_order_part_id'
  union all select 'replacement_link_cycles', count(*), 'blocker'
  from replacement_walk where cycle
  union all select 'replacement_link_scope_mismatches', count(*), 'blocker'
  from public.work_order_parts wop_row join public.work_order_parts other on other.id = coalesce(nullif(to_jsonb(wop_row)->>'replaced_from_work_order_part_id','')::uuid, nullif(to_jsonb(wop_row)->>'replaced_by_work_order_part_id','')::uuid)
  where nullif(to_jsonb(wop_row)->>'source_parts_request_item_id','')::uuid is distinct from nullif(to_jsonb(other)->>'source_parts_request_item_id','')::uuid
     or wop_row.shop_id is distinct from other.shop_id
     or wop_row.work_order_id is distinct from other.work_order_id
     or nullif(to_jsonb(wop_row)->>'work_order_line_id','')::uuid is distinct from nullif(to_jsonb(other)->>'work_order_line_id','')::uuid
  union all select 'zero_quantity_reservation_audit_missing_lifecycle_quantity', count(*), 'blocker'
  from stock where row->>'reason' in ('wo_allocate','wo_release') and coalesce(nullif(row->>'qty_change','')::numeric,0) = 0 and coalesce(nullif(row->>'lifecycle_quantity','')::numeric,0) <= 0
  union all select 'invoice_parts_missing_canonical_work_order_part_refs', count(*), 'review'
  from public.part_request_items i join public.invoices inv on inv.work_order_id=i.work_order_id left join public.work_order_parts wop_row on nullif(to_jsonb(wop_row)->>'source_parts_request_item_id','')::uuid=i.id where i.part_id is not null and wop_row.id is null
)
select * from findings order by severity, finding;
