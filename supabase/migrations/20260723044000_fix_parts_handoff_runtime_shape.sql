begin;

-- Restore the working parts handoff function shape and keep the enum-safe status
-- assignment. The previous patch mixed in an older work_order_parts/stock_moves
-- shape (`quantity_reserved`, `move_type`, `quantity`) that does not exist in
-- the current production schema.
create or replace function public.parts_issue_work_order_part(
  p_work_order_part_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wop public.work_order_parts%rowtype;
  v_existing public.stock_moves%rowtype;
  v_alloc public.work_order_part_allocations%rowtype;
  v_move_id uuid;
  v_item public.part_request_items%rowtype;
  v_net_issued numeric;
  v_status public.part_request_item_status;
begin
  if p_qty <= 0 then
    raise exception 'Issue quantity must be greater than zero.';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'A stable idempotency key is required.';
  end if;

  select * into v_wop
  from public.work_order_parts
  where id = p_work_order_part_id
    and is_active
  for update;
  if not found then
    raise exception 'Active work-order part not found.';
  end if;
  perform public.parts_assert_work_order_mutable(
    v_wop.shop_id,
    v_wop.work_order_id
  );

  select * into v_existing
  from public.stock_moves
  where shop_id = v_wop.shop_id
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

  select * into v_alloc
  from public.work_order_part_allocations
  where work_order_part_id = v_wop.id
    and location_id = p_location_id
  for update;
  if not found or v_alloc.qty < p_qty then
    raise exception 'Allocation is insufficient for issue.';
  end if;
  if coalesce(v_wop.quantity_allocated, 0) < p_qty then
    raise exception 'Cannot issue more than allocated quantity.';
  end if;
  if public.parts_on_hand(
    v_wop.shop_id,
    v_wop.part_id,
    p_location_id
  ) < p_qty then
    raise exception 'Cannot issue more than physical on-hand quantity.';
  end if;

  if v_wop.source_parts_request_item_id is not null then
    select * into v_item
    from public.part_request_items
    where id = v_wop.source_parts_request_item_id
    for update;
  end if;

  insert into public.stock_moves (
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by,
    shop_id,
    idempotency_key,
    work_order_part_id,
    part_request_item_id,
    metadata,
    lifecycle_quantity
  ) values (
    v_wop.part_id,
    p_location_id,
    -p_qty,
    'consume',
    'work_order_part',
    v_wop.id,
    auth.uid(),
    v_wop.shop_id,
    p_idempotency_key,
    v_wop.id,
    v_wop.source_parts_request_item_id,
    jsonb_build_object('qty_issued', p_qty, 'operation', 'issue'),
    p_qty
  ) returning id into v_move_id;

  if v_alloc.qty = p_qty then
    delete from public.work_order_part_allocations
    where id = v_alloc.id;
  else
    update public.work_order_part_allocations
    set qty = v_alloc.qty - p_qty,
        stock_move_id = v_move_id
    where id = v_alloc.id;
  end if;

  update public.work_order_parts
  set quantity_allocated = greatest(
        coalesce(quantity_allocated, 0) - p_qty,
        0
      ),
      quantity_consumed = coalesce(quantity_consumed, 0) + p_qty,
      updated_at = now()
  where id = v_wop.id;

  if v_wop.source_parts_request_item_id is not null then
    v_net_issued := coalesce(v_item.qty_consumed, 0)
      + p_qty
      - coalesce(v_item.qty_returned, 0);
    v_status := case
      when v_net_issued < greatest(
        coalesce(v_item.qty_requested, v_item.qty, 0),
        0
      ) then 'partially_consumed'::public.part_request_item_status
      else 'consumed'::public.part_request_item_status
    end;

    update public.part_request_items
    set qty_reserved = greatest(coalesce(qty_reserved, 0) - p_qty, 0),
        qty_consumed = coalesce(qty_consumed, 0) + p_qty,
        status = v_status,
        updated_at = now()
    where id = v_wop.source_parts_request_item_id;
  end if;

  perform public.parts_reconcile_work_order_part(v_wop.id);

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'work_order_part_id', v_wop.id,
    'stock_move_id', v_move_id,
    'issued_qty', p_qty,
    'net_issued_qty',
      coalesce(v_wop.quantity_consumed, 0)
        + p_qty
        - coalesce(v_wop.quantity_returned, 0),
    'on_hand_after', public.parts_on_hand(
      v_wop.shop_id,
      v_wop.part_id,
      p_location_id
    )
  );
end;
$$;

revoke all on function public.parts_issue_work_order_part(
  uuid,
  uuid,
  numeric,
  text
) from public, anon;
grant execute on function public.parts_issue_work_order_part(
  uuid,
  uuid,
  numeric,
  text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
