begin;

alter table public.part_request_items
  add column if not exists qty_assigned numeric(12,2) not null default 0,
  add column if not exists qty_ordered numeric(12,2) not null default 0,
  add column if not exists qty_returned numeric(12,2) not null default 0;

alter table public.part_request_items
  drop constraint if exists part_request_items_nonnegative_phase3;
alter table public.part_request_items
  add constraint part_request_items_nonnegative_phase3 check (
    coalesce(qty, 0) >= 0
    and coalesce(qty_requested, 0) >= 0
    and coalesce(qty_assigned, 0) >= 0
    and coalesce(qty_ordered, 0) >= 0
    and coalesce(qty_received, 0) >= 0
    and coalesce(qty_reserved, 0) >= 0
    and coalesce(qty_consumed, 0) >= 0
    and coalesce(qty_returned, 0) >= 0
    and coalesce(qty_returned, 0) <= coalesce(qty_consumed, 0)
  ) not valid;

alter table public.work_order_parts
  drop constraint if exists work_order_parts_nonnegative_phase3;
alter table public.work_order_parts
  add constraint work_order_parts_nonnegative_phase3 check (
    coalesce(quantity_requested, 0) >= 0
    and coalesce(quantity_ordered, 0) >= 0
    and coalesce(quantity_received, 0) >= 0
    and coalesce(quantity_allocated, 0) >= 0
    and coalesce(quantity_consumed, 0) >= 0
    and coalesce(quantity_returned, 0) >= 0
    and coalesce(quantity_cancelled, 0) >= 0
    and coalesce(quantity_returned, 0) <= coalesce(quantity_consumed, 0)
  ) not valid;

create or replace function public.parts_create_po_line_for_request(
  p_po_id uuid,
  p_request_item_id uuid,
  p_qty numeric,
  p_unit_cost numeric default null,
  p_location_id uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.part_request_items%rowtype;
  v_po public.purchase_orders%rowtype;
  v_wop public.work_order_parts%rowtype;
  v_line_id uuid;
  v_total_ordered numeric;
  v_requested numeric;
  v_status text;
begin
  if p_qty <= 0 then raise exception 'PO quantity must be greater than zero.'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'A stable idempotency key is required.'; end if;

  select * into v_item from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found then raise exception 'Request item not found.'; end if;

  select * into v_po from public.purchase_orders
  where id = p_po_id
  for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if v_po.shop_id is distinct from v_item.shop_id then raise exception 'Purchase order belongs to a different shop.'; end if;

  perform public.parts_assert_work_order_mutable(v_item.shop_id, v_item.work_order_id);

  select * into v_wop from public.work_order_parts
  where id = public.parts_ensure_work_order_part(p_request_item_id)
  for update;

  insert into public.purchase_order_lines(
    po_id, part_id, description, qty, unit_cost, location_id,
    part_request_item_id, work_order_part_id, idempotency_key
  ) values (
    p_po_id, v_item.part_id, v_item.description, p_qty,
    coalesce(p_unit_cost, v_item.unit_cost, 0), p_location_id,
    p_request_item_id, v_wop.id, p_idempotency_key
  )
  on conflict (po_id, idempotency_key) where idempotency_key is not null
  do update set id = public.purchase_order_lines.id
  returning id into v_line_id;

  select coalesce(sum(qty), 0) into v_total_ordered
  from public.purchase_order_lines
  where part_request_item_id = p_request_item_id;

  v_requested := greatest(coalesce(v_item.qty_requested, v_item.qty, 0), 0);
  if v_total_ordered > v_requested then
    raise exception 'Ordered quantity % exceeds requested quantity %.', v_total_ordered, v_requested;
  end if;
  v_status := case
    when v_total_ordered <= 0 then 'requested'
    when v_total_ordered < v_requested then 'partially_ordered'
    else 'ordered'
  end;

  update public.part_request_items
  set po_id = p_po_id,
      qty_ordered = v_total_ordered,
      status = v_status,
      updated_at = now()
  where id = p_request_item_id;

  update public.work_order_parts
  set quantity_ordered = v_total_ordered,
      updated_at = now()
  where id = v_wop.id;
  perform public.parts_reconcile_work_order_part(v_wop.id);

  return jsonb_build_object(
    'ok', true,
    'purchase_order_line_id', v_line_id,
    'work_order_part_id', v_wop.id,
    'requested_qty', v_requested,
    'ordered_qty', v_total_ordered,
    'remaining_to_order', greatest(v_requested - v_total_ordered, 0),
    'status', v_status
  );
end;
$$;

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
  v_line public.purchase_order_lines%rowtype;
  v_existing public.stock_moves%rowtype;
  v_received_total numeric;
  v_move_id uuid;
  v_limit numeric;
  v_status text;
begin
  if p_qty <= 0 then raise exception 'Receive quantity must be greater than zero.'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'A stable idempotency key is required.'; end if;

  select * into v_item from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found then raise exception 'Request item not found.'; end if;
  perform public.parts_assert_work_order_mutable(v_item.shop_id, v_item.work_order_id);

  select * into v_existing from public.stock_moves
  where shop_id = v_item.shop_id and idempotency_key = p_idempotency_key
  for update;
  if found then
    return coalesce(v_existing.metadata, '{}'::jsonb)
      || jsonb_build_object('ok', true, 'idempotent', true, 'stock_move_id', v_existing.id);
  end if;

  select * into v_wop from public.work_order_parts
  where id = public.parts_ensure_work_order_part(p_request_item_id)
  for update;

  if p_po_line_id is not null then
    select * into v_line from public.purchase_order_lines
    where id = p_po_line_id
    for update;
    if not found then raise exception 'Purchase order line not found.'; end if;
    if v_line.part_request_item_id is distinct from p_request_item_id then
      raise exception 'PO line is not linked to this request item.';
    end if;
    if coalesce(v_line.received_qty, 0) + p_qty > coalesce(v_line.qty, 0) then
      raise exception 'Receipt exceeds ordered quantity.';
    end if;
    update public.purchase_order_lines
    set received_qty = coalesce(received_qty, 0) + p_qty
    where id = p_po_line_id;
    v_limit := coalesce(v_line.qty, 0);
  else
    v_limit := greatest(coalesce(v_item.qty_ordered, 0), coalesce(v_item.qty_requested, v_item.qty, 0));
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
    when v_received_total < greatest(coalesce(v_item.qty_ordered, 0), coalesce(v_item.qty_requested, v_item.qty, 0)) then 'partially_received'
    else 'received'
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
    'on_hand_after', public.parts_on_hand(v_wop.shop_id, v_wop.part_id, p_location_id)
  );
end;
$$;

create or replace function public.receive_part_request_item(
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_po_id uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line_id uuid;
begin
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'A stable idempotency key is required.';
  end if;

  select pol.id into v_line_id
  from public.purchase_order_lines pol
  where pol.part_request_item_id = p_item_id
    and (p_po_id is null or pol.po_id = p_po_id)
    and coalesce(pol.received_qty, 0) < coalesce(pol.qty, 0)
  order by pol.created_at asc, pol.id asc
  limit 1
  for update;

  return public.parts_receive_request_item(
    p_item_id, p_location_id, p_qty, v_line_id, null, p_idempotency_key
  );
end;
$$;

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
  v_status text;
begin
  if p_qty <= 0 then raise exception 'Issue quantity must be greater than zero.'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'A stable idempotency key is required.'; end if;

  select * into v_wop from public.work_order_parts
  where id = p_work_order_part_id and is_active
  for update;
  if not found then raise exception 'Active work-order part not found.'; end if;
  perform public.parts_assert_work_order_mutable(v_wop.shop_id, v_wop.work_order_id);

  select * into v_existing from public.stock_moves
  where shop_id = v_wop.shop_id and idempotency_key = p_idempotency_key
  for update;
  if found then
    return coalesce(v_existing.metadata, '{}'::jsonb)
      || jsonb_build_object('ok', true, 'idempotent', true, 'stock_move_id', v_existing.id);
  end if;

  select * into v_alloc from public.work_order_part_allocations
  where work_order_part_id = v_wop.id and location_id = p_location_id
  for update;
  if not found or v_alloc.qty < p_qty then raise exception 'Allocation is insufficient for issue.'; end if;
  if coalesce(v_wop.quantity_allocated, 0) < p_qty then raise exception 'Cannot issue more than allocated quantity.'; end if;
  if public.parts_on_hand(v_wop.shop_id, v_wop.part_id, p_location_id) < p_qty then
    raise exception 'Cannot issue more than physical on-hand quantity.';
  end if;

  if v_wop.source_parts_request_item_id is not null then
    select * into v_item from public.part_request_items
    where id = v_wop.source_parts_request_item_id
    for update;
  end if;

  insert into public.stock_moves(
    part_id, location_id, qty_change, reason, reference_kind, reference_id,
    created_by, shop_id, idempotency_key, work_order_part_id,
    part_request_item_id, metadata, lifecycle_quantity
  ) values (
    v_wop.part_id, p_location_id, -p_qty, 'consume', 'work_order_part', v_wop.id,
    auth.uid(), v_wop.shop_id, p_idempotency_key, v_wop.id,
    v_wop.source_parts_request_item_id,
    jsonb_build_object('qty_issued', p_qty, 'operation', 'issue'), p_qty
  ) returning id into v_move_id;

  update public.work_order_part_allocations
  set qty = qty - p_qty, stock_move_id = v_move_id
  where id = v_alloc.id;
  delete from public.work_order_part_allocations where id = v_alloc.id and qty <= 0;

  update public.work_order_parts
  set quantity_allocated = greatest(coalesce(quantity_allocated, 0) - p_qty, 0),
      quantity_consumed = coalesce(quantity_consumed, 0) + p_qty,
      updated_at = now()
  where id = v_wop.id;

  if v_wop.source_parts_request_item_id is not null then
    v_net_issued := coalesce(v_item.qty_consumed, 0) + p_qty - coalesce(v_item.qty_returned, 0);
    v_status := case
      when v_net_issued < greatest(coalesce(v_item.qty_requested, v_item.qty, 0), 0) then 'partially_consumed'
      else 'consumed'
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
    'ok', true, 'idempotent', false,
    'work_order_part_id', v_wop.id,
    'stock_move_id', v_move_id,
    'issued_qty', p_qty,
    'net_issued_qty', coalesce(v_wop.quantity_consumed, 0) + p_qty - coalesce(v_wop.quantity_returned, 0),
    'on_hand_after', public.parts_on_hand(v_wop.shop_id, v_wop.part_id, p_location_id)
  );
end;
$$;

create or replace function public.parts_return_to_stock(
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
  v_move_id uuid;
  v_item public.part_request_items%rowtype;
  v_new_returned numeric;
  v_net_issued numeric;
  v_status text;
begin
  if p_qty <= 0 then raise exception 'Return quantity must be greater than zero.'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'A stable idempotency key is required.'; end if;

  select * into v_wop from public.work_order_parts
  where id = p_work_order_part_id and is_active
  for update;
  if not found then raise exception 'Active work-order part not found.'; end if;
  perform public.parts_assert_work_order_mutable(v_wop.shop_id, v_wop.work_order_id);

  select * into v_existing from public.stock_moves
  where shop_id = v_wop.shop_id and idempotency_key = p_idempotency_key
  for update;
  if found then
    return coalesce(v_existing.metadata, '{}'::jsonb)
      || jsonb_build_object('ok', true, 'idempotent', true, 'stock_move_id', v_existing.id);
  end if;

  if coalesce(v_wop.quantity_consumed, 0) - coalesce(v_wop.quantity_returned, 0) < p_qty then
    raise exception 'Cannot return more than consumed and not-yet-returned quantity.';
  end if;

  if v_wop.source_parts_request_item_id is not null then
    select * into v_item from public.part_request_items
    where id = v_wop.source_parts_request_item_id
    for update;
    if coalesce(v_item.qty_consumed, 0) - coalesce(v_item.qty_returned, 0) < p_qty then
      raise exception 'Request-item return exceeds its net consumed quantity.';
    end if;
  end if;

  insert into public.stock_moves(
    part_id, location_id, qty_change, reason, reference_kind, reference_id,
    created_by, shop_id, idempotency_key, work_order_part_id,
    part_request_item_id, metadata, lifecycle_quantity
  ) values (
    v_wop.part_id, p_location_id, p_qty, 'return', 'work_order_part', v_wop.id,
    auth.uid(), v_wop.shop_id, p_idempotency_key, v_wop.id,
    v_wop.source_parts_request_item_id,
    jsonb_build_object('qty_returned', p_qty, 'operation', 'return_to_stock'), p_qty
  ) returning id into v_move_id;

  v_new_returned := coalesce(v_wop.quantity_returned, 0) + p_qty;
  update public.work_order_parts
  set quantity_returned = v_new_returned, updated_at = now()
  where id = v_wop.id;

  if v_wop.source_parts_request_item_id is not null then
    v_net_issued := coalesce(v_item.qty_consumed, 0) - (coalesce(v_item.qty_returned, 0) + p_qty);
    v_status := case
      when v_net_issued <= 0 then 'returned'
      else 'partially_returned'
    end;
    update public.part_request_items
    set qty_returned = coalesce(qty_returned, 0) + p_qty,
        status = v_status,
        updated_at = now()
    where id = v_wop.source_parts_request_item_id;
  end if;

  perform public.parts_reconcile_work_order_part(v_wop.id);
  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'work_order_part_id', v_wop.id,
    'stock_move_id', v_move_id,
    'returned_qty', p_qty,
    'net_issued_qty', coalesce(v_wop.quantity_consumed, 0) - v_new_returned,
    'on_hand_after', public.parts_on_hand(v_wop.shop_id, v_wop.part_id, p_location_id)
  );
end;
$$;

create or replace function public.parts_replace_request_item(
  p_request_item_id uuid,
  p_new_part_id uuid,
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
  v_old public.work_order_parts%rowtype;
  v_new_part public.parts%rowtype;
  v_new_wop_id uuid;
  v_result jsonb;
begin
  if p_qty <= 0 then raise exception 'Replacement quantity must be greater than zero.'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'A stable idempotency key is required.'; end if;

  select * into v_item from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found then raise exception 'Request item not found.'; end if;
  perform public.parts_assert_work_order_mutable(v_item.shop_id, v_item.work_order_id);

  select * into v_new_part from public.parts
  where id = p_new_part_id and shop_id = v_item.shop_id
  for share;
  if not found then raise exception 'Replacement part is not available for this shop.'; end if;

  select * into v_old from public.work_order_parts
  where source_parts_request_item_id = p_request_item_id and is_active
  order by updated_at desc, id desc
  limit 1
  for update;

  if found then
    perform 1 from public.work_order_part_allocations
    where work_order_part_id = v_old.id
    order by id
    for update;

    if coalesce(v_old.quantity_consumed, 0) - coalesce(v_old.quantity_returned, 0) > 0 then
      raise exception 'Consumed replacement source must be fully returned before replacement.';
    end if;
    if coalesce(v_old.quantity_received, 0) > coalesce(v_old.quantity_returned, 0)
       and coalesce(v_old.quantity_allocated, 0) <= 0 then
      raise exception 'Received replacement source requires explicit inventory disposition.';
    end if;

    perform public.parts_cancel_request_item(p_request_item_id, p_idempotency_key || ':cancel-old');
    update public.work_order_parts
    set lifecycle_status = 'replaced', is_active = false, updated_at = now()
    where id = v_old.id;
  end if;

  update public.part_request_items
  set part_id = p_new_part_id,
      status = 'requested',
      qty = p_qty,
      qty_requested = p_qty,
      qty_assigned = 0,
      qty_ordered = 0,
      qty_received = 0,
      qty_reserved = 0,
      qty_consumed = 0,
      qty_returned = 0,
      po_id = null,
      updated_at = now()
  where id = p_request_item_id;

  v_new_wop_id := public.parts_ensure_work_order_part(p_request_item_id);
  update public.work_order_parts
  set replaced_from_work_order_part_id = case when v_old.id is null then null else v_old.id end
  where id = v_new_wop_id;
  if v_old.id is not null then
    update public.work_order_parts
    set replaced_by_work_order_part_id = v_new_wop_id
    where id = v_old.id;
  end if;

  v_result := public.parts_allocate_request_item(
    p_request_item_id, p_location_id, p_qty, p_idempotency_key || ':allocate-new'
  );
  return v_result || jsonb_build_object(
    'ok', true,
    'old_work_order_part_id', v_old.id,
    'new_work_order_part_id', v_new_wop_id,
    'old_part_id', v_old.part_id,
    'new_part_id', p_new_part_id
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
