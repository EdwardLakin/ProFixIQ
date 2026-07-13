-- Fix Parts Package materialization quantity resolution for legacy rows.
-- Forward-only migration: replaces RPC definitions only; it does not backfill or mutate historical rows.

create or replace function public.parts_attach_request_item(p_request_item_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_item public.part_request_items%rowtype; v_request public.part_requests%rowtype; v_part public.parts%rowtype; v_line record; v_wop uuid; v_qty numeric;
begin
  if auth.uid() is null and current_user <> 'service_role' then raise exception 'Authentication required.'; end if;
  select * into v_item from public.part_request_items where id = p_request_item_id for update;
  if not found then raise exception 'Request item not found.'; end if;
  perform public.parts_lifecycle_assert_shop_access(v_item.shop_id);
  if v_item.work_order_line_id is null then raise exception 'Request item must be linked to a work-order line.'; end if;
  if v_item.part_id is null then raise exception 'Request item has no selected inventory part.'; end if;
  select * into v_request from public.part_requests where id = v_item.request_id for update;
  if not found then raise exception 'Parent parts request not found.'; end if;
  select * into v_part from public.parts where id = v_item.part_id;
  if not found then raise exception 'Selected part not found.'; end if;
  if v_part.shop_id is distinct from v_item.shop_id then raise exception 'Selected part belongs to a different shop.'; end if;
  select wl.id, wl.work_order_id, wl.shop_id line_shop_id, wo.shop_id wo_shop_id into v_line
  from public.work_order_lines wl join public.work_orders wo on wo.id = wl.work_order_id where wl.id = v_item.work_order_line_id;
  if not found then raise exception 'Work-order line not found.'; end if;
  if v_line.wo_shop_id is distinct from v_item.shop_id or v_line.line_shop_id is distinct from v_item.shop_id then raise exception 'Work-order line belongs to a different shop.'; end if;
  if v_item.work_order_id is not null and v_item.work_order_id <> v_line.work_order_id then raise exception 'Request item work order does not match line.'; end if;
  if v_request.work_order_id is not null and v_request.work_order_id <> v_line.work_order_id then raise exception 'Work-order line does not belong to the request work order.'; end if;
  v_qty := case
    when coalesce(v_item.qty_requested, 0) > 0
      then v_item.qty_requested
    when coalesce(v_item.qty, 0) > 0
      then v_item.qty
    else 0
  end;
  if v_qty <= 0 then raise exception 'Quantity must be greater than 0.'; end if;
  select id into v_wop from public.work_order_parts where source_parts_request_item_id = p_request_item_id and coalesce(is_active,true) for update;
  if found then return v_wop; end if;
  insert into public.work_order_parts(work_order_id, work_order_line_id, shop_id, part_id, quantity, unit_price, total_price, source_parts_request_id, source_parts_request_item_id, description_snapshot, manufacturer_snapshot, part_number_snapshot, quantity_requested, quantity_received, quantity_consumed, unit_cost_snapshot, unit_sell_price_snapshot, lifecycle_status, updated_at, is_active)
  values (v_line.work_order_id, v_item.work_order_line_id, v_item.shop_id, v_item.part_id, v_qty, coalesce(v_item.unit_price, v_item.quoted_price, v_part.price), coalesce(v_item.unit_price, v_item.quoted_price, v_part.price, 0) * v_qty, v_item.request_id, v_item.id, coalesce(v_part.name, v_item.description), coalesce(v_part.supplier, v_item.vendor), v_part.part_number, v_qty, coalesce(v_item.qty_received,0), coalesce(v_item.qty_consumed,0), coalesce(v_item.unit_cost, v_part.cost), coalesce(v_item.unit_price, v_item.quoted_price, v_part.price), 'requested', now(), true)
  returning id into v_wop;
  return v_wop;
end $$;

create or replace function public.parts_ensure_work_order_part(p_request_item_id uuid)
returns uuid language sql security definer set search_path = public as $$
  select public.parts_attach_request_item(p_request_item_id);
$$;

revoke all on function public.parts_attach_request_item(uuid) from public, anon;
revoke all on function public.parts_ensure_work_order_part(uuid) from public, anon;
grant execute on function public.parts_attach_request_item(uuid) to authenticated, service_role;
grant execute on function public.parts_ensure_work_order_part(uuid) to authenticated, service_role;
