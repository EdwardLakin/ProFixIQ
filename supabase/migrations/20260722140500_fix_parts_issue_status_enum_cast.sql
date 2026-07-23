begin;

-- The handoff flow issues staged allocations through parts_issue_work_order_part.
-- Its local CASE result was inferred as text, which fails when assigned to the
-- part_request_items.status enum during "Complete handoff".
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

  if v_wop.shop_id is null then
    raise exception 'Work-order part is missing shop context.';
  end if;
  if v_wop.part_id is null then
    raise exception 'Work-order part is missing part_id.';
  end if;
  if p_qty > greatest(coalesce(v_wop.quantity_reserved, 0), 0) then
    raise exception 'Issue quantity exceeds reserved quantity.';
  end if;

  select * into v_existing
  from public.stock_moves
  where shop_id = v_wop.shop_id
    and idempotency_key = p_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'work_order_part_id', v_wop.id,
      'stock_move_id', v_existing.id,
      'issued_qty', v_existing.quantity
    );
  end if;

  select * into v_alloc
  from public.work_order_part_allocations
  where work_order_part_id = v_wop.id
    and location_id = p_location_id
    and qty >= p_qty
  order by id
  limit 1
  for update;
  if not found then
    raise exception 'Reserved allocation not found for this location.';
  end if;

  if v_wop.source_parts_request_item_id is not null then
    select * into v_item
    from public.part_request_items
    where id = v_wop.source_parts_request_item_id
    for update;
  end if;

  insert into public.stock_moves (
    shop_id,
    part_id,
    location_id,
    move_type,
    quantity,
    work_order_id,
    work_order_part_id,
    part_request_item_id,
    source,
    source_id,
    metadata,
    idempotency_key
  ) values (
    v_wop.shop_id,
    v_wop.part_id,
    p_location_id,
    'issue',
    p_qty,
    v_wop.work_order_id,
    v_wop.id,
    v_wop.source_parts_request_item_id,
    'work_order_part_issue',
    v_wop.id,
    jsonb_build_object('qty_consumed', p_qty, 'operation', 'issue_to_repair'),
    p_idempotency_key
  )
  returning id into v_move_id;

  if v_alloc.qty = p_qty then
    delete from public.work_order_part_allocations
    where id = v_alloc.id;
  else
    update public.work_order_part_allocations
    set qty = qty - p_qty,
        updated_at = now()
    where id = v_alloc.id;
  end if;

  update public.work_order_parts
  set quantity_reserved = greatest(coalesce(quantity_reserved, 0) - p_qty, 0),
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
) to authenticated;

commit;
