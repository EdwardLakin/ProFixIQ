begin;

-- Inventory has two historical representations:
--   * stock_moves is the canonical physical ledger used by allocation RPCs.
--   * part_stock is a legacy snapshot/cache used by older imports and views.
-- Preserve valid snapshot-only inventory only when that part/location has no
-- physical ledger history. A higher legacy cache beside an active ledger can be
-- stale after consumption, so it is intentionally left for manual review.
-- Keep physical inventory writers out for this short reconciliation statement
-- so a concurrent receipt cannot be counted immediately after the snapshot.
lock table public.stock_moves in share row exclusive mode;
lock table public.part_stock in share row exclusive mode;

with ledger_history as (
  select
    sm.shop_id,
    sm.part_id,
    sm.location_id,
    coalesce(sum(sm.qty_change) filter (
      where lower(sm.reason::text) not in ('wo_allocate', 'wo_release')
    ), 0)::numeric as qty_on_hand,
    count(*) filter (
      where lower(sm.reason::text) not in ('wo_allocate', 'wo_release')
    )::integer as physical_move_count
  from public.stock_moves sm
  group by sm.shop_id, sm.part_id, sm.location_id
), snapshot_gaps as (
  select
    p.shop_id,
    ps.part_id,
    ps.location_id,
    ps.qty_on_hand::numeric as snapshot_qty,
    coalesce(lo.qty_on_hand, 0)::numeric as ledger_qty,
    (ps.qty_on_hand - coalesce(lo.qty_on_hand, 0))::numeric as gap_qty
  from public.part_stock ps
  join public.parts p
    on p.id = ps.part_id
  join public.stock_locations sl
    on sl.id = ps.location_id
   and sl.shop_id = p.shop_id
  left join ledger_history lo
    on lo.shop_id = p.shop_id
   and lo.part_id = ps.part_id
   and lo.location_id = ps.location_id
  where ps.qty_on_hand > 0
    and coalesce(lo.physical_move_count, 0) = 0
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
  sg.shop_id,
  sg.part_id,
  sg.location_id,
  sg.gap_qty,
  'adjust'::public.stock_move_reason,
  'inventory_snapshot_backfill',
  sg.part_id,
  null,
  sg.shop_id::text || ':canonical-stock-backfill:'
    || sg.part_id::text || ':' || sg.location_id::text,
  jsonb_build_object(
    'operation', 'canonical_inventory_backfill',
    'snapshot_qty', sg.snapshot_qty,
    'ledger_qty_before', sg.ledger_qty,
    'qty_added', sg.gap_qty
  ),
  sg.gap_qty
from snapshot_gaps sg
on conflict (shop_id, idempotency_key)
  where idempotency_key is not null
do nothing;

-- Keep the existing view contract while sourcing every quantity from the same
-- canonical tables used by parts_available() and parts_allocate_request_item().
create or replace view public.v_part_stock
with (security_invoker = true)
as
with physical as (
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
), inventory_keys as (
  select shop_id, part_id, location_id from physical
  union
  select shop_id, part_id, location_id from allocated
)
select
  k.part_id,
  k.location_id,
  (coalesce(p.qty_on_hand, 0) - coalesce(a.qty_reserved, 0))::numeric
    as qty_available,
  coalesce(p.qty_on_hand, 0)::numeric(12,2) as qty_on_hand,
  coalesce(a.qty_reserved, 0)::numeric(12,2) as qty_reserved
from inventory_keys k
left join physical p
  on p.shop_id = k.shop_id
 and p.part_id = k.part_id
 and p.location_id = k.location_id
left join allocated a
  on a.shop_id = k.shop_id
 and a.part_id = k.part_id
 and a.location_id = k.location_id;

revoke all on table public.v_part_stock from public, anon;
grant select on table public.v_part_stock to authenticated, service_role;

-- Importers set an absolute source-system snapshot. Convert that snapshot to a
-- ledger delta atomically, retain a durable idempotency key, and refresh the
-- legacy cache for callers that have not yet moved to v_part_stock.
create or replace function public.parts_set_stock_on_hand_snapshot(
  p_shop_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_target_qty numeric,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part public.parts%rowtype;
  v_location public.stock_locations%rowtype;
  v_existing public.stock_moves%rowtype;
  v_current_qty numeric;
  v_delta numeric;
  v_reserved numeric;
  v_move_id uuid;
begin
  if p_target_qty is null or p_target_qty < 0 then
    raise exception 'Inventory snapshot quantity must be zero or greater.';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'A stable idempotency key is required.';
  end if;
  if length(p_idempotency_key) > 300 then
    raise exception 'Inventory snapshot idempotency key is too long.';
  end if;
  if position(p_shop_id::text || ':' in p_idempotency_key) <> 1 then
    raise exception 'Inventory snapshot idempotency key must be tenant scoped.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    perform public.parts_lifecycle_assert_shop_access(p_shop_id);
  end if;

  select * into v_part
  from public.parts
  where id = p_part_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception 'Inventory part is not available for this shop.';
  end if;

  select * into v_location
  from public.stock_locations
  where id = p_location_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception 'Inventory location is not available for this shop.';
  end if;

  select * into v_existing
  from public.stock_moves
  where shop_id = p_shop_id
    and idempotency_key = trim(p_idempotency_key)
  for update;
  if found then
    if v_existing.part_id is distinct from p_part_id
       or v_existing.location_id is distinct from p_location_id
       or v_existing.reference_kind is distinct from 'inventory_snapshot' then
      raise exception 'Inventory snapshot idempotency key belongs to another stock scope.';
    end if;
    if jsonb_typeof(v_existing.metadata -> 'target_qty') is distinct from 'number' then
      raise exception 'Inventory snapshot idempotency key was reused with a different target quantity.';
    end if;
    if (v_existing.metadata ->> 'target_qty')::numeric is distinct from p_target_qty then
      raise exception 'Inventory snapshot idempotency key was reused with a different target quantity.';
    end if;
    return coalesce(v_existing.metadata, '{}'::jsonb) || jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'stock_move_id', v_existing.id,
      'part_id', p_part_id,
      'location_id', p_location_id,
      'target_qty', p_target_qty,
      'on_hand_after', public.parts_on_hand(p_shop_id, p_part_id, p_location_id),
      'available_after', public.parts_available(p_shop_id, p_part_id, p_location_id)
    );
  end if;

  v_current_qty := public.parts_on_hand(p_shop_id, p_part_id, p_location_id);
  v_delta := p_target_qty - v_current_qty;
  v_reserved := public.parts_allocated(p_shop_id, p_part_id, p_location_id);

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
  ) values (
    p_shop_id,
    p_part_id,
    p_location_id,
    v_delta,
    'adjust'::public.stock_move_reason,
    'inventory_snapshot',
    p_part_id,
    auth.uid(),
    trim(p_idempotency_key),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'operation', 'set_stock_on_hand_snapshot',
      'target_qty', p_target_qty,
      'on_hand_before', v_current_qty,
      'qty_change', v_delta
    ),
    abs(v_delta)
  )
  returning id into v_move_id;

  insert into public.part_stock (
    part_id,
    location_id,
    qty_on_hand,
    qty_reserved
  ) values (
    p_part_id,
    p_location_id,
    p_target_qty,
    v_reserved
  )
  on conflict (part_id, location_id) do update
  set qty_on_hand = excluded.qty_on_hand,
      qty_reserved = excluded.qty_reserved;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'stock_move_id', v_move_id,
    'part_id', p_part_id,
    'location_id', p_location_id,
    'target_qty', p_target_qty,
    'qty_change', v_delta,
    'on_hand_after', p_target_qty,
    'available_after', p_target_qty - v_reserved
  );
end;
$$;

revoke all on function public.parts_set_stock_on_hand_snapshot(
  uuid, uuid, uuid, numeric, text, jsonb
) from public, anon;
grant execute on function public.parts_set_stock_on_hand_snapshot(
  uuid, uuid, uuid, numeric, text, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
