-- Read-only preflight for the consolidated manual parts lifecycle migration.
-- Run this before db/sql/2026-07-11_parts_lifecycle_consolidated_manual.sql.
-- Any row with severity = 'blocker' should be reviewed before migration.

with table_presence as (
  select name, to_regclass('public.' || name) is not null as exists
  from (values
    ('part_requests'), ('part_request_items'), ('work_order_lines'), ('work_orders'),
    ('work_order_parts'), ('work_order_part_allocations'), ('parts'), ('stock_moves'),
    ('stock_locations'), ('purchase_orders'), ('purchase_order_lines'), ('profiles')
  ) as t(name)
), wop as (
  select
    id,
    work_order_id,
    shop_id,
    part_id,
    to_jsonb(work_order_parts)->>'work_order_line_id' as work_order_line_id,
    to_jsonb(work_order_parts)->>'source_parts_request_item_id' as source_parts_request_item_id,
    coalesce((to_jsonb(work_order_parts)->>'is_active')::boolean, true) as is_active,
    to_jsonb(work_order_parts)->>'replaced_from_work_order_part_id' as replaced_from_work_order_part_id,
    to_jsonb(work_order_parts)->>'replaced_by_work_order_part_id' as replaced_by_work_order_part_id
  from public.work_order_parts
  where to_regclass('public.work_order_parts') is not null
), alloc as (
  select
    id,
    work_order_line_id,
    part_id,
    location_id,
    qty,
    to_jsonb(work_order_part_allocations)->>'shop_id' as shop_id,
    to_jsonb(work_order_part_allocations)->>'work_order_id' as work_order_id,
    to_jsonb(work_order_part_allocations)->>'source_request_item_id' as source_request_item_id,
    to_jsonb(work_order_part_allocations)->>'work_order_part_id' as work_order_part_id
  from public.work_order_part_allocations
  where to_regclass('public.work_order_part_allocations') is not null
), unambiguous_alloc_matches as (
  select a.id as allocation_id, count(w.id) as match_count
  from alloc a
  join public.part_request_items i on i.id::text = a.source_request_item_id
  join public.work_order_lines wl on wl.id = a.work_order_line_id
  join wop w on w.source_parts_request_item_id = a.source_request_item_id
    and w.part_id = a.part_id
    and w.work_order_id = wl.work_order_id
    and w.work_order_line_id = a.work_order_line_id::text
    and w.shop_id::text = coalesce(a.shop_id, i.shop_id::text)
    and w.is_active
  where a.source_request_item_id is not null
  group by a.id
), findings as (
  select 'required_table_missing' as finding, count(*)::bigint as count, 'blocker' as severity
  from table_presence where not exists
  union all
  select 'active_duplicate_work_order_parts_per_request_item', count(*)::bigint, 'blocker'
  from (select source_parts_request_item_id from wop where source_parts_request_item_id is not null and is_active group by 1 having count(*) > 1) d
  union all
  select 'allocation_backfill_unambiguous', count(*)::bigint, 'info'
  from alloc a join unambiguous_alloc_matches m on m.allocation_id = a.id and m.match_count = 1
  where a.work_order_part_id is null
  union all
  select 'allocation_backfill_ambiguous', count(*)::bigint, 'review'
  from alloc a join unambiguous_alloc_matches m on m.allocation_id = a.id and m.match_count > 1
  where a.work_order_part_id is null
  union all
  select 'allocation_backfill_unresolved', count(*)::bigint, 'review'
  from alloc a left join unambiguous_alloc_matches m on m.allocation_id = a.id
  where a.work_order_part_id is null and m.allocation_id is null
  union all
  select 'allocation_cross_scope_existing', count(*)::bigint, 'blocker'
  from alloc a
  join public.work_order_lines wl on wl.id = a.work_order_line_id
  join public.work_orders wo on wo.id = wl.work_order_id
  left join public.part_request_items i on i.id::text = a.source_request_item_id
  where (a.shop_id is not null and a.shop_id <> wo.shop_id::text)
     or (a.work_order_id is not null and a.work_order_id <> wo.id::text)
     or (i.id is not null and i.shop_id is distinct from wo.shop_id)
  union all
  select 'duplicate_allocation_work_order_part_location', count(*)::bigint, 'blocker'
  from (select work_order_part_id, location_id from alloc where work_order_part_id is not null group by 1,2 having count(*) > 1) d
  union all
  select 'duplicate_stock_move_idempotency_keys', count(*)::bigint, 'blocker'
  from (select shop_id, idempotency_key from public.stock_moves where idempotency_key is not null group by 1,2 having count(*) > 1) d
  union all
  select 'duplicate_po_line_idempotency_keys', count(*)::bigint, 'blocker'
  from (select po_id, idempotency_key from public.purchase_order_lines where idempotency_key is not null group by 1,2 having count(*) > 1) d
  union all
  select 'negative_allocation_qty', count(*)::bigint, 'blocker'
  from alloc where qty < 0
  union all
  select 'self_replacement_links_existing', count(*)::bigint, 'blocker'
  from wop where id::text = replaced_from_work_order_part_id or id::text = replaced_by_work_order_part_id
  union all
  select 'existing_broad_stock_move_reference_reason_index', count(*)::bigint, 'info'
  from pg_indexes where schemaname='public' and indexname='uq_stock_moves_reference_reason'
)
select * from findings order by severity, finding;
