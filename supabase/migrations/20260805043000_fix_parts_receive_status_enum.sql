begin;

-- The receive command must keep its derived status in the table's enum type.
-- A text variable reaches the update only after the stock move is valid and
-- PostgreSQL will not implicitly cast that expression to the enum column.
create or replace function public.parts_receive_request_item(
  p_request_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_po_line_id uuid default null,
  p_unit_cost numeric default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.part_request_items%rowtype;
  v_wop public.work_order_parts%rowtype;
  v_wop_id uuid;
  v_line public.purchase_order_lines%rowtype;
  v_existing public.stock_moves%rowtype;
  v_received_total numeric;
  v_move_id uuid;
  v_limit numeric;
  v_status public.part_request_item_status;
begin
  if p_qty <= 0 then
    raise exception 'Receive quantity must be greater than zero.';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'A stable idempotency key is required.';
  end if;

  select * into v_item
  from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found then
    raise exception 'Request item not found.';
  end if;
  perform public.parts_assert_work_order_mutable(v_item.shop_id, v_item.work_order_id);

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

  v_wop_id := public.parts_ensure_work_order_part(p_request_item_id);
  select * into v_wop
  from public.work_order_parts
  where id = v_wop_id
  for update;
  if not found
     or v_wop.shop_id is distinct from v_item.shop_id
     or v_wop.part_id is null
     or v_wop.part_id is distinct from v_item.part_id then
    raise exception 'Unable to resolve the inventory-backed work-order part for request item %.',
      p_request_item_id;
  end if;

  if p_po_line_id is not null then
    select * into v_line
    from public.purchase_order_lines
    where id = p_po_line_id
    for update;
    if not found then
      raise exception 'Purchase order line not found.';
    end if;
    if v_line.part_request_item_id is distinct from p_request_item_id then
      raise exception 'PO line is not linked to this request item.';
    end if;
    if v_line.part_id is distinct from v_wop.part_id then
      raise exception 'PO line part does not match the request inventory part.';
    end if;
    if coalesce(v_line.received_qty, 0) + p_qty > coalesce(v_line.qty, 0) then
      raise exception 'Receipt exceeds ordered quantity.';
    end if;
    update public.purchase_order_lines
    set received_qty = coalesce(received_qty, 0) + p_qty,
        work_order_part_id = coalesce(work_order_part_id, v_wop.id)
    where id = p_po_line_id;
    v_limit := coalesce(v_line.qty, 0);
  else
    v_limit := greatest(
      coalesce(v_item.qty_ordered, 0),
      coalesce(v_item.qty_requested, v_item.qty, 0)
    );
    if coalesce(v_item.qty_received, 0) + p_qty > v_limit then
      raise exception 'Receipt exceeds assigned/ordered/requested quantity.';
    end if;
  end if;

  insert into public.stock_moves(
    part_id, location_id, qty_change, reason, reference_kind, reference_id,
    created_by, shop_id, idempotency_key, work_order_part_id,
    part_request_item_id, purchase_order_line_id, metadata, lifecycle_quantity
  ) values (
    v_wop.part_id, p_location_id, p_qty, 'receive',
    case when p_po_line_id is null then 'part_request_item' else 'purchase_order_line' end,
    coalesce(p_po_line_id, p_request_item_id), auth.uid(), v_wop.shop_id,
    p_idempotency_key, v_wop.id, p_request_item_id, p_po_line_id,
    jsonb_build_object('qty_received', p_qty, 'operation', 'receive'), p_qty
  ) returning id into v_move_id;

  v_received_total := coalesce(v_item.qty_received, 0) + p_qty;
  v_status := case
    when v_received_total < greatest(
      coalesce(v_item.qty_ordered, 0),
      coalesce(v_item.qty_requested, v_item.qty, 0)
    ) then 'partially_received'::public.part_request_item_status
    else 'received'::public.part_request_item_status
  end;

  update public.part_request_items
  set qty_received = v_received_total,
      location_id = coalesce(location_id, p_location_id),
      unit_cost = coalesce(p_unit_cost, unit_cost),
      status = v_status,
      updated_at = now()
  where id = p_request_item_id;

  update public.work_order_parts
  set quantity_received = coalesce(quantity_received, 0) + p_qty,
      unit_cost_snapshot = coalesce(p_unit_cost, unit_cost_snapshot),
      updated_at = now()
  where id = v_wop.id;
  perform public.parts_reconcile_work_order_part(v_wop.id);

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'work_order_part_id', v_wop.id,
    'stock_move_id', v_move_id,
    'received_qty', v_received_total,
    'status', v_status,
    'on_hand_after', public.parts_on_hand(
      v_wop.shop_id,
      v_wop.part_id,
      p_location_id
    )
  );
end;
$$;

revoke all on function public.parts_receive_request_item(
  uuid, uuid, numeric, uuid, numeric, text
) from public, anon;
grant execute on function public.parts_receive_request_item(
  uuid, uuid, numeric, uuid, numeric, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
