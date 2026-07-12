-- Read-only parts lifecycle audit. This script intentionally performs no writes.
with stock_balances as (
  select p.shop_id, p.id as part_id,
    coalesce(sum(sm.qty_change) filter (where sm.reason not in ('wo_allocate','wo_release')),0) as on_hand,
    coalesce((select sum(a.qty) from public.work_order_part_allocations a where a.shop_id=p.shop_id and a.part_id=p.id),0) as allocated
  from public.parts p
  left join public.stock_moves sm on sm.shop_id=p.shop_id and sm.part_id=p.id
  group by p.shop_id, p.id
), active_wop as (
  select * from public.work_order_parts where coalesce(is_active, true)
), replacement_walk as (
  select id, replaced_by_work_order_part_id, array[id] as path, false as cycle
  from public.work_order_parts
  where replaced_by_work_order_part_id is not null
  union all
  select w.id, next.replaced_by_work_order_part_id, w.path || next.id, next.id = any(w.path)
  from replacement_walk w
  join public.work_order_parts next on next.id = w.replaced_by_work_order_part_id
  where not w.cycle and array_length(w.path, 1) < 25
), findings as (
  select 'request_items_without_work_order_line' finding, count(*)::bigint count from public.part_request_items where work_order_line_id is null
  union all select 'request_items_without_parent_request', count(*) from public.part_request_items i left join public.part_requests r on r.id=i.request_id where r.id is null
  union all select 'work_order_parts_without_valid_work_order', count(*) from public.work_order_parts wop left join public.work_orders wo on wo.id=wop.work_order_id where wop.work_order_id is not null and wo.id is null
  union all select 'work_order_parts_without_valid_line', count(*) from public.work_order_parts wop left join public.work_order_lines wol on wol.id=wop.work_order_line_id where wop.work_order_line_id is not null and wol.id is null
  union all select 'duplicate_work_order_parts_per_source_request_item', count(*) from (select source_parts_request_item_id from public.work_order_parts where source_parts_request_item_id is not null group by 1 having count(*) > 1) d
  union all select 'active_duplicate_work_order_parts_per_request_item', count(*) from (select source_parts_request_item_id from active_wop where source_parts_request_item_id is not null group by 1 having count(*) > 1) d
  union all select 'allocations_without_valid_work_order_part', count(*) from public.work_order_part_allocations a left join public.work_order_parts wop on wop.id=a.work_order_part_id where a.work_order_part_id is null or wop.id is null
  union all select 'allocations_without_valid_request_item', count(*) from public.work_order_part_allocations a left join public.part_request_items i on i.id=a.source_request_item_id where a.source_request_item_id is not null and i.id is null
  union all select 'duplicate_active_allocations', count(*) from (select work_order_part_id, location_id from public.work_order_part_allocations where work_order_part_id is not null group by 1,2 having count(*) > 1) d
  union all select 'cross_shop_request_part_links', count(*) from public.part_request_items i join public.parts p on p.id=i.part_id where i.shop_id is distinct from p.shop_id
  union all select 'cross_shop_work_order_part_links', count(*) from public.work_order_parts wop join public.work_orders wo on wo.id=wop.work_order_id where wop.shop_id is distinct from wo.shop_id
  union all select 'allocations_work_order_part_scope_mismatch', count(*) from public.work_order_part_allocations a join public.work_order_parts wop on wop.id=a.work_order_part_id where a.shop_id is distinct from wop.shop_id or a.work_order_id is distinct from wop.work_order_id or a.work_order_line_id is distinct from wop.work_order_line_id
  union all select 'negative_on_hand', count(*) from stock_balances where on_hand < 0
  union all select 'negative_allocated_quantity', count(*) from public.work_order_part_allocations where qty < 0
  union all select 'allocated_greater_than_on_hand', count(*) from stock_balances where allocated > on_hand
  union all select 'available_below_zero', count(*) from stock_balances where on_hand - allocated < 0
  union all select 'received_greater_than_ordered', count(*) from public.work_order_parts where quantity_ordered > 0 and quantity_received > quantity_ordered
  union all select 'consumed_greater_than_received_and_allocated_source', count(*) from public.work_order_parts where quantity_received > 0 and quantity_consumed > quantity_received
  union all select 'returned_greater_than_consumed', count(*) from public.work_order_parts where quantity_returned > quantity_consumed
  union all select 'lifecycle_quantities_below_zero', count(*) from public.work_order_parts where least(quantity_requested, quantity_ordered, quantity_received, quantity_allocated, quantity_consumed, quantity_returned, quantity_cancelled) < 0
  union all select 'cancelled_with_active_allocated_quantity', count(*) from active_wop where lifecycle_status='cancelled' and quantity_allocated > 0
  union all select 'billable_quantity_below_zero', count(*) from public.work_order_parts where (case when quantity_consumed > 0 then quantity_consumed - quantity_returned else quantity - quantity_cancelled end) < 0
  union all select 'po_lines_disconnected_from_requests', count(*) from public.purchase_order_lines where part_request_item_id is null and work_order_part_id is null
  union all select 'legacy_po_items_without_matching_po_line', count(*) from public.purchase_order_items poi where not exists (select 1 from public.purchase_order_lines pol where pol.po_id=poi.po_id and pol.part_id=poi.part_id)
  union all select 'stock_movements_without_source', count(*) from public.stock_moves where reference_kind is null or reference_id is null
  union all select 'duplicate_movement_idempotency_keys', count(*) from (select shop_id, idempotency_key from public.stock_moves where idempotency_key is not null group by 1,2 having count(*) > 1) d
  union all select 'zero_quantity_reservation_audit_missing_lifecycle_quantity', count(*) from public.stock_moves where reason in ('wo_allocate','wo_release') and qty_change = 0 and coalesce(lifecycle_quantity,0) <= 0
  union all select 'stock_moves_unknown_reason', count(*) from public.stock_moves where reason::text not in ('receive','adjust','consume','return','transfer_out','transfer_in','wo_allocate','wo_release','seed')
  union all select 'work_order_part_snapshot_inconsistent_with_part', count(*) from active_wop wop join public.parts p on p.id=wop.part_id where (coalesce(wop.description_snapshot,'') <> '' and wop.description_snapshot is distinct from p.name) or (coalesce(wop.part_number_snapshot,'') <> '' and wop.part_number_snapshot is distinct from p.part_number)
  union all select 'replacement_link_cycles', count(*) from replacement_walk where cycle
  union all select 'invoice_part_duplicates', count(*) from (select work_order_id, source_parts_request_item_id from public.work_order_parts where source_parts_request_item_id is not null and (case when quantity_consumed > 0 then quantity_consumed - quantity_returned else quantity - quantity_cancelled end) > 0 group by 1,2 having count(*) filter (where coalesce(is_active,true)) > 1) d
  union all select 'invoice_parts_missing_canonical_work_order_part_refs', count(*) from public.part_request_items i join public.invoices inv on inv.work_order_id=i.work_order_id left join public.work_order_parts wop on wop.source_parts_request_item_id=i.id where i.part_id is not null and wop.id is null
)
select * from findings order by finding;
