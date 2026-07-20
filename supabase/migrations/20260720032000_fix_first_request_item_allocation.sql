begin;

-- A request item can reach allocation before its canonical work_order_parts row
-- exists. Calling parts_attach_request_item() inside the WHERE clause of the
-- SELECT that reads the row leaves that outer statement on its original command
-- snapshot, so a row inserted by the function may not be visible until the next
-- statement. The empty record then produces parts_available(NULL, NULL, ...)=0.
-- Materialize first, then lock/read the row in a separate statement.
create or replace function public.parts_allocate_request_item(
  p_request_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.part_request_items%rowtype;
  v_wop public.work_order_parts%rowtype;
  v_wop_id uuid;
  v_loc public.stock_locations%rowtype;
  v_existing public.stock_moves%rowtype;
  v_available numeric;
  v_alloc_id uuid;
  v_move_id uuid;
  v_new_alloc numeric;
begin
  if p_qty <= 0 then
    raise exception 'Allocation quantity must be greater than 0.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key is required.';
  end if;

  select * into v_item
  from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found then raise exception 'Request item not found.'; end if;
  perform public.parts_lifecycle_assert_shop_access(v_item.shop_id);

  select * into v_loc
  from public.stock_locations
  where id = p_location_id
  for update;
  if not found or v_loc.shop_id is distinct from v_item.shop_id then
    raise exception 'Location belongs to a different shop.';
  end if;

  select * into v_existing
  from public.stock_moves
  where shop_id = v_item.shop_id
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    return coalesce(v_existing.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'stock_move_id', v_existing.id
      );
  end if;

  v_wop_id := public.parts_attach_request_item(p_request_item_id);

  select * into v_wop
  from public.work_order_parts
  where id = v_wop_id
  for update;
  if not found then
    raise exception 'Canonical work-order part was not materialized.';
  end if;
  if v_wop.shop_id is distinct from v_item.shop_id
     or v_wop.part_id is distinct from v_item.part_id then
    raise exception 'Canonical work-order part does not match the request item.';
  end if;

  v_available := public.parts_available(
    v_item.shop_id,
    v_item.part_id,
    p_location_id
  );
  if v_available < p_qty then
    raise exception 'Insufficient available stock. Available %, requested %.',
      v_available, p_qty;
  end if;

  insert into public.stock_moves (
    part_id, location_id, qty_change, reason, reference_kind, reference_id,
    created_by, shop_id, idempotency_key, work_order_part_id,
    part_request_item_id, metadata, lifecycle_quantity
  ) values (
    v_item.part_id, p_location_id, 0, 'wo_allocate', 'work_order_part',
    v_wop.id, auth.uid(), v_item.shop_id, p_idempotency_key, v_wop.id,
    p_request_item_id,
    jsonb_build_object('qty_reserved', p_qty, 'operation', 'allocate'),
    p_qty
  ) returning id into v_move_id;

  insert into public.work_order_part_allocations (
    work_order_line_id, work_order_id, shop_id, part_id, location_id,
    qty, unit_cost, stock_move_id, source_request_item_id,
    work_order_part_id
  ) values (
    v_wop.work_order_line_id, v_wop.work_order_id, v_item.shop_id,
    v_item.part_id, p_location_id, p_qty,
    coalesce(v_wop.unit_cost_snapshot, 0), v_move_id,
    p_request_item_id, v_wop.id
  )
  on conflict (work_order_part_id, location_id)
    where work_order_part_id is not null
  do update set
    qty = public.work_order_part_allocations.qty + excluded.qty,
    stock_move_id = excluded.stock_move_id
  returning id, qty into v_alloc_id, v_new_alloc;

  update public.part_request_items
  set qty_reserved = coalesce(qty_reserved, 0) + p_qty,
      status = 'reserved',
      updated_at = now()
  where id = p_request_item_id;

  update public.work_order_parts
  set quantity_allocated = coalesce(quantity_allocated, 0) + p_qty,
      updated_at = now()
  where id = v_wop.id;

  perform public.parts_reconcile_work_order_part(v_wop.id);

  update public.stock_moves
  set metadata = metadata || jsonb_build_object(
    'allocation_id', v_alloc_id,
    'work_order_part_id', v_wop.id
  )
  where id = v_move_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'work_order_part_id', v_wop.id,
    'allocation_id', v_alloc_id,
    'stock_move_id', v_move_id,
    'allocated_qty', v_new_alloc,
    'available_after', public.parts_available(
      v_item.shop_id, v_item.part_id, p_location_id
    )
  );
end;
$$;

revoke all on function public.parts_allocate_request_item(uuid,uuid,numeric,text)
  from public, anon;
grant execute on function public.parts_allocate_request_item(uuid,uuid,numeric,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
