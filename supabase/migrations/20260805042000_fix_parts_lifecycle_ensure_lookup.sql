begin;

-- Resolve the lifecycle row in a separate statement. Calling the mutating
-- ensure function from a table WHERE clause can scan past the row that the
-- function creates or updates and leave the row variable empty.
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
  v_wop_id uuid;
  v_line_id uuid;
  v_total_ordered numeric;
  v_target numeric;
  v_status public.part_request_item_status;
begin
  if p_qty <= 0 then
    raise exception 'PO quantity must be greater than zero.';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'A stable idempotency key is required.';
  end if;
  if length(p_idempotency_key) > 300 then
    raise exception 'PO-line idempotency key is too long.';
  end if;

  select * into v_item
  from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found or v_item.shop_id is null then
    raise exception 'Request item not found or missing shop.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_item.shop_id);
  if auth.role() <> 'service_role' and not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = v_item.shop_id
      and lower(coalesce(p.role::text, '')) in ('owner', 'admin', 'manager', 'parts')
  ) then
    raise exception 'Parts ordering actor is not authorized for this shop.';
  end if;
  if not public.parts_request_is_operationally_released(v_item.request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_APPROVAL_REQUIRED',
      detail = 'A purchase-order line cannot be created until the linked work is approved.';
  end if;

  select * into v_po
  from public.purchase_orders
  where id = p_po_id
  for update;
  if not found then
    raise exception 'Purchase order not found.';
  end if;
  if v_po.shop_id is distinct from v_item.shop_id then
    raise exception 'Purchase order belongs to a different shop.';
  end if;
  if lower(coalesce(v_po.status, '')) not in ('draft', 'open') then
    raise exception 'Purchase order % is not editable in status %.',
      p_po_id, coalesce(v_po.status, 'unknown');
  end if;

  if p_location_id is not null and not exists (
    select 1
    from public.stock_locations location
    where location.id = p_location_id
      and location.shop_id = v_item.shop_id
  ) then
    raise exception 'Stock location belongs to a different shop.';
  end if;

  perform public.parts_assert_work_order_mutable(
    v_item.shop_id,
    v_item.work_order_id
  );

  v_wop_id := public.parts_ensure_work_order_part(p_request_item_id);
  select * into v_wop
  from public.work_order_parts
  where id = v_wop_id
  for update;
  if not found
     or v_wop.shop_id is distinct from v_item.shop_id
     or v_wop.part_id is distinct from v_item.part_id then
    raise exception 'Unable to resolve the work-order part for request item %.',
      p_request_item_id;
  end if;

  v_target := greatest(
    coalesce(v_item.qty_approved, 0),
    coalesce(v_item.qty_requested, 0),
    coalesce(v_item.qty, 0),
    0
  );
  if v_target <= 0 then
    raise exception 'Approved request quantity must be greater than zero.';
  end if;

  insert into public.purchase_order_lines(
    po_id, part_id, description, qty, unit_cost, location_id,
    part_request_item_id, work_order_part_id, idempotency_key
  ) values (
    p_po_id, v_item.part_id, v_item.description, p_qty,
    coalesce(p_unit_cost, v_item.unit_cost, 0), p_location_id,
    p_request_item_id, v_wop.id, p_idempotency_key
  )
  on conflict (po_id, idempotency_key) where idempotency_key is not null
  do update set
    work_order_part_id = coalesce(
      public.purchase_order_lines.work_order_part_id,
      excluded.work_order_part_id
    )
  returning id into v_line_id;

  select coalesce(sum(
    greatest(coalesce(pol.qty, 0) - coalesce(pol.cancelled_qty, 0), 0)
  ), 0)
  into v_total_ordered
  from public.purchase_order_lines pol
  where pol.part_request_item_id = p_request_item_id;

  if v_total_ordered > v_target then
    raise exception 'Active ordered quantity % exceeds approved quantity %.',
      v_total_ordered, v_target;
  end if;

  v_status := case
    when v_total_ordered <= 0 then 'approved'::public.part_request_item_status
    when v_total_ordered < v_target then 'partially_ordered'::public.part_request_item_status
    else 'ordered'::public.part_request_item_status
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
    'approved_qty', v_target,
    'ordered_qty', v_total_ordered,
    'remaining_to_order', greatest(v_target - v_total_ordered, 0),
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
  v_wop_id uuid;
  v_line public.purchase_order_lines%rowtype;
  v_existing public.stock_moves%rowtype;
  v_received_total numeric;
  v_move_id uuid;
  v_limit numeric;
  v_status text;
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
    ) then 'partially_received'
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
    'on_hand_after', public.parts_on_hand(
      v_wop.shop_id,
      v_wop.part_id,
      p_location_id
    )
  );
end;
$$;

-- Repair only PO lines with exactly one active lifecycle row that matches the
-- source request, shop, work order, and inventory part.
with candidates as (
  select
    pol.id as purchase_order_line_id,
    wop.id as work_order_part_id,
    count(*) over (partition by pol.id) as match_count
  from public.purchase_order_lines pol
  join public.part_request_items item
    on item.id = pol.part_request_item_id
  join public.work_order_parts wop
    on wop.source_parts_request_item_id = item.id
   and wop.is_active
   and wop.shop_id = item.shop_id
   and wop.work_order_id = item.work_order_id
   and wop.part_id is not distinct from pol.part_id
  where pol.work_order_part_id is null
)
update public.purchase_order_lines pol
set work_order_part_id = candidate.work_order_part_id
from candidates candidate
where candidate.match_count = 1
  and pol.id = candidate.purchase_order_line_id
  and pol.work_order_part_id is null;

-- Reconcile durable ordered totals for linked lifecycle rows. This repairs the
-- rows produced by the same unsafe lookup without guessing across ambiguity.
with ordered_totals as (
  select
    pol.work_order_part_id,
    sum(greatest(coalesce(pol.qty, 0) - coalesce(pol.cancelled_qty, 0), 0)) as quantity_ordered
  from public.purchase_order_lines pol
  where pol.work_order_part_id is not null
  group by pol.work_order_part_id
)
update public.work_order_parts wop
set quantity_ordered = ordered_totals.quantity_ordered,
    updated_at = now()
from ordered_totals
where wop.id = ordered_totals.work_order_part_id
  and wop.quantity_ordered is distinct from ordered_totals.quantity_ordered;

revoke all on function public.parts_create_po_line_for_request(
  uuid, uuid, numeric, numeric, uuid, text
) from public, anon;
grant execute on function public.parts_create_po_line_for_request(
  uuid, uuid, numeric, numeric, uuid, text
) to authenticated, service_role;

revoke all on function public.parts_receive_request_item(
  uuid, uuid, numeric, uuid, numeric, text
) from public, anon;
grant execute on function public.parts_receive_request_item(
  uuid, uuid, numeric, uuid, numeric, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
