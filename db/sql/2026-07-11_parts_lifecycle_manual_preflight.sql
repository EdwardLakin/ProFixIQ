-- Read-only preflight for the consolidated manual parts lifecycle migration.
-- Run this BEFORE db/sql/2026-07-11_parts_lifecycle_consolidated_manual.sql.
-- This file must execute on the legacy/pre-migration schema. Future columns are
-- accessed through to_jsonb(...) or catalog checks so PostgreSQL never parses a
-- not-yet-created column name.

with table_presence as (
  select name, to_regclass('public.' || name) is not null as exists
  from (values
    ('part_requests'), ('part_request_items'), ('work_order_lines'), ('work_orders'),
    ('work_order_parts'), ('work_order_part_allocations'), ('parts'), ('stock_moves'),
    ('stock_locations'), ('purchase_orders'), ('purchase_order_lines'), ('profiles')
  ) as t(name)
), future_columns as (
  select * from (values
    ('work_order_parts','source_parts_request_item_id'),
    ('work_order_parts','is_active'),
    ('work_order_parts','replaced_from_work_order_part_id'),
    ('work_order_parts','replaced_by_work_order_part_id'),
    ('work_order_part_allocations','work_order_part_id'),
    ('stock_moves','idempotency_key'),
    ('stock_moves','lifecycle_quantity'),
    ('stock_moves','work_order_part_id'),
    ('stock_moves','part_request_item_id'),
    ('purchase_order_lines','part_request_item_id'),
    ('purchase_order_lines','work_order_part_id'),
    ('purchase_order_lines','idempotency_key')
  ) as c(table_name, column_name)
), future_column_presence as (
  select fc.table_name, fc.column_name, (c.column_name is not null) as exists
  from future_columns fc
  left join information_schema.columns c
    on c.table_schema='public' and c.table_name=fc.table_name and c.column_name=fc.column_name
), wop as (
  select
    w.id,
    w.work_order_id,
    w.shop_id,
    w.part_id,
    to_jsonb(w)->>'work_order_line_id' as work_order_line_id,
    to_jsonb(w)->>'source_parts_request_item_id' as source_parts_request_item_id,
    coalesce((to_jsonb(w)->>'is_active')::boolean, true) as is_active,
    to_jsonb(w)->>'replaced_from_work_order_part_id' as replaced_from_work_order_part_id,
    to_jsonb(w)->>'replaced_by_work_order_part_id' as replaced_by_work_order_part_id
  from public.work_order_parts w
), alloc as (
  select
    a.id,
    a.work_order_line_id,
    a.part_id,
    a.location_id,
    a.qty,
    to_jsonb(a)->>'shop_id' as shop_id,
    to_jsonb(a)->>'work_order_id' as work_order_id,
    to_jsonb(a)->>'source_request_item_id' as source_request_item_id,
    to_jsonb(a)->>'work_order_part_id' as work_order_part_id
  from public.work_order_part_allocations a
), stock_move_json as (
  select to_jsonb(sm) as row from public.stock_moves sm
), po_line_json as (
  select to_jsonb(pol) as row from public.purchase_order_lines pol
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
  select 'future_column_not_applicable_pre_migration:' || table_name || '.' || column_name, count(*)::bigint, 'not_applicable_pre_migration'
  from future_column_presence where not exists group by table_name, column_name
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
  select 'duplicate_allocation_work_order_part_location', count(*)::bigint, case when exists (select 1 from future_column_presence where table_name='work_order_part_allocations' and column_name='work_order_part_id' and exists) then 'blocker' else 'not_applicable_pre_migration' end
  from (select work_order_part_id, location_id from alloc where work_order_part_id is not null group by 1,2 having count(*) > 1) d
  union all
  select 'duplicate_stock_move_idempotency_keys', count(*)::bigint, case when exists (select 1 from future_column_presence where table_name='stock_moves' and column_name='idempotency_key' and exists) then 'blocker' else 'not_applicable_pre_migration' end
  from (
    select row->>'shop_id' as shop_id, row->>'idempotency_key' as idempotency_key
    from stock_move_json
    where row ? 'idempotency_key' and nullif(row->>'idempotency_key','') is not null
    group by 1,2 having count(*) > 1
  ) d
  union all
  select 'duplicate_po_line_idempotency_keys', count(*)::bigint, case when exists (select 1 from future_column_presence where table_name='purchase_order_lines' and column_name='idempotency_key' and exists) then 'blocker' else 'not_applicable_pre_migration' end
  from (
    select row->>'po_id' as po_id, row->>'idempotency_key' as idempotency_key
    from po_line_json
    where row ? 'idempotency_key' and nullif(row->>'idempotency_key','') is not null
    group by 1,2 having count(*) > 1
  ) d
  union all
  select 'negative_allocation_qty', count(*)::bigint, 'blocker'
  from alloc where qty < 0
  union all
  select 'self_replacement_links_existing', count(*)::bigint, case when exists (select 1 from future_column_presence where table_name='work_order_parts' and column_name='replaced_from_work_order_part_id' and exists) or exists (select 1 from future_column_presence where table_name='work_order_parts' and column_name='replaced_by_work_order_part_id' and exists) then 'blocker' else 'not_applicable_pre_migration' end
  from wop where id::text = replaced_from_work_order_part_id or id::text = replaced_by_work_order_part_id
  union all
  select 'existing_broad_stock_move_reference_reason_index', count(*)::bigint, 'info'
  from pg_indexes where schemaname='public' and indexname='uq_stock_moves_reference_reason'
)
select * from findings order by severity, finding;
