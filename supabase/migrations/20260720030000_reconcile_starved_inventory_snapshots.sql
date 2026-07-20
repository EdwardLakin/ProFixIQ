begin;

-- Some legacy inventory rows have a positive absolute snapshot in part_stock
-- but also have incomplete historical stock_moves. The original canonical
-- backfill intentionally skipped every scope with ledger history, leaving the
-- allocator at zero even though the legacy inventory screen showed stock.
--
-- Reconcile only the actionable starvation case:
--   * the canonical ledger has no unallocated quantity;
--   * the legacy snapshot has unallocated quantity; and
--   * the snapshot is greater than the ledger balance.
--
-- This never lowers ledger inventory and never converts already-reserved stock
-- into available stock. Future inventory writes use the canonical snapshot RPC.
lock table public.stock_moves in share row exclusive mode;
lock table public.part_stock in share row exclusive mode;
lock table public.work_order_part_allocations in share mode;

with ledger as (
  select
    sm.shop_id,
    sm.part_id,
    sm.location_id,
    coalesce(sum(sm.qty_change) filter (
      where lower(sm.reason::text) not in ('wo_allocate', 'wo_release')
    ), 0)::numeric as qty_on_hand
  from public.stock_moves sm
  group by sm.shop_id, sm.part_id, sm.location_id
), allocated as (
  select
    a.shop_id,
    a.part_id,
    a.location_id,
    coalesce(sum(a.qty), 0)::numeric as qty_reserved
  from public.work_order_part_allocations a
  group by a.shop_id, a.part_id, a.location_id
), starved as (
  select
    p.shop_id,
    ps.part_id,
    ps.location_id,
    ps.qty_on_hand::numeric as snapshot_qty,
    coalesce(l.qty_on_hand, 0)::numeric as ledger_qty,
    coalesce(a.qty_reserved, 0)::numeric as allocated_qty,
    (ps.qty_on_hand - coalesce(l.qty_on_hand, 0))::numeric as gap_qty
  from public.part_stock ps
  join public.parts p
    on p.id = ps.part_id
  join public.stock_locations sl
    on sl.id = ps.location_id
   and sl.shop_id = p.shop_id
  left join ledger l
    on l.shop_id = p.shop_id
   and l.part_id = ps.part_id
   and l.location_id = ps.location_id
  left join allocated a
    on a.shop_id = p.shop_id
   and a.part_id = ps.part_id
   and a.location_id = ps.location_id
  where ps.qty_on_hand > coalesce(l.qty_on_hand, 0)
    and coalesce(l.qty_on_hand, 0) - coalesce(a.qty_reserved, 0) <= 0
    and ps.qty_on_hand - coalesce(a.qty_reserved, 0) > 0
)
insert into public.stock_moves (
  shop_id,
  part_id,
  location_id,
  qty_change,
  reason,
  reference_kind,
  reference_id,
  created_by,
  idempotency_key,
  metadata,
  lifecycle_quantity
)
select
  s.shop_id,
  s.part_id,
  s.location_id,
  s.gap_qty,
  'adjust'::public.stock_move_reason,
  'inventory_starvation_reconciliation',
  s.part_id,
  null,
  s.shop_id::text || ':canonical-stock-starvation-v1:'
    || s.part_id::text || ':' || s.location_id::text,
  jsonb_build_object(
    'operation', 'reconcile_starved_inventory_snapshot',
    'snapshot_qty', s.snapshot_qty,
    'ledger_qty_before', s.ledger_qty,
    'allocated_qty', s.allocated_qty,
    'qty_added', s.gap_qty
  ),
  s.gap_qty
from starved s
where s.gap_qty > 0
on conflict (shop_id, idempotency_key)
  where idempotency_key is not null
do nothing;

notify pgrst, 'reload schema';

commit;
