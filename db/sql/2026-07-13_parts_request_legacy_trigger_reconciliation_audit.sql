-- Read-only diagnostics for legacy parts-request trigger reconciliation.
-- This script intentionally performs no writes and should be reviewed before any historical repair.
with movement_rollup as (
  select
    sm.shop_id,
    coalesce(sm.part_request_item_id, case when sm.reference_kind = 'part_request_item' then sm.reference_id end) as request_item_id,
    count(*) filter (where sm.qty_change < 0) as negative_moves,
    count(*) filter (where sm.qty_change < 0 and sm.reason = 'wo_allocate') as negative_wo_allocate_moves,
    count(*) filter (where sm.qty_change < 0 and sm.reason = 'consume') as negative_consume_moves,
    coalesce(sum(sm.qty_change) filter (where sm.reason not in ('wo_allocate','wo_release')), 0) as physical_delta
  from public.stock_moves sm
  where coalesce(sm.part_request_item_id, case when sm.reference_kind = 'part_request_item' then sm.reference_id end) is not null
  group by sm.shop_id, coalesce(sm.part_request_item_id, case when sm.reference_kind = 'part_request_item' then sm.reference_id end)
), stock_move_on_hand as (
  select shop_id, part_id, location_id,
    coalesce(sum(qty_change) filter (where reason not in ('wo_allocate','wo_release')), 0) as stock_move_on_hand
  from public.stock_moves
  group by shop_id, part_id, location_id
), allocation_rollup as (
  select source_request_item_id as request_item_id, coalesce(sum(qty), 0) as allocated_qty
  from public.work_order_part_allocations
  where source_request_item_id is not null
  group by source_request_item_id
), findings as (
  select 'consumed_items_with_multiple_negative_stock_movements' as finding, count(*)::bigint as count
  from public.part_request_items i
  join movement_rollup mr on mr.request_item_id = i.id
  where i.status = 'consumed' and mr.negative_moves > 1
  union all
  select 'items_with_negative_wo_allocate_and_negative_consume_movements', count(*)
  from movement_rollup
  where negative_wo_allocate_moves > 0 and negative_consume_moves > 0
  union all
  select 'items_with_duplicate_physical_deductions', count(*)
  from movement_rollup
  where negative_moves > 1 and physical_delta < 0
  union all
  select 'part_stock_mismatches_stock_move_on_hand', count(*)
  from public.part_stock ps
  full join stock_move_on_hand sm
    on sm.shop_id = ps.shop_id and sm.part_id = ps.part_id and sm.location_id = ps.location_id
  where coalesce(ps.qty_on_hand, 0) <> coalesce(sm.stock_move_on_hand, 0)
  union all
  select 'allocations_inconsistent_with_request_item_reserved_quantities', count(*)
  from public.part_request_items i
  left join allocation_rollup ar on ar.request_item_id = i.id
  where coalesce(i.qty_reserved, 0) <> coalesce(ar.allocated_qty, 0)
  union all
  select 'request_items_consumed_quantity_exceeds_required_quantity', count(*)
  from public.part_request_items
  where coalesce(qty_consumed, 0) > coalesce(qty_requested, qty, 0)
)
select * from findings order by finding;
