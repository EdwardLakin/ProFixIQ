begin;

-- Phase 3 introduced the canonical request-to-PO command, but its later
-- replacement no longer asserted the caller's tenant. Keep the command as the
-- single ordering boundary and restore authorization, approval, PO-state, and
-- active-quantity checks here.
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

  select * into v_wop
  from public.work_order_parts
  where id = public.parts_ensure_work_order_part(p_request_item_id)
  for update;

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
  do update set id = public.purchase_order_lines.id
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

revoke all on function public.parts_create_po_line_for_request(
  uuid, uuid, numeric, numeric, uuid, text
) from public, anon;
grant execute on function public.parts_create_po_line_for_request(
  uuid, uuid, numeric, numeric, uuid, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
