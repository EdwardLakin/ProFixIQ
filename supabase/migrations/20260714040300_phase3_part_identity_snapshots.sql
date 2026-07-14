begin;

alter table public.work_order_parts
  add column if not exists supplier_snapshot text,
  add column if not exists vendor_snapshot text,
  add column if not exists sku_snapshot text;

create or replace function public.parts_attach_request_item(
  p_request_item_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.part_request_items%rowtype;
  v_request public.part_requests%rowtype;
  v_part public.parts%rowtype;
  v_line record;
  v_wop public.work_order_parts%rowtype;
  v_qty numeric;
  v_sell numeric;
  v_cost numeric;
begin
  select * into v_item
  from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found then raise exception 'Request item not found.'; end if;
  if v_item.work_order_line_id is null then raise exception 'Request item must be linked to a work-order line.'; end if;
  if v_item.part_id is null then raise exception 'Request item has no selected inventory part.'; end if;

  select * into v_request
  from public.part_requests
  where id = v_item.request_id
  for update;
  if not found then raise exception 'Parent parts request not found.'; end if;

  select * into v_part
  from public.parts
  where id = v_item.part_id
  for share;
  if not found then raise exception 'Selected part not found.'; end if;
  if v_part.shop_id is distinct from v_item.shop_id then
    raise exception 'Selected part belongs to a different shop.';
  end if;

  select wl.id, wl.work_order_id, wl.shop_id
    into v_line
  from public.work_order_lines wl
  where wl.id = v_item.work_order_line_id
  for update;
  if not found then raise exception 'Work-order line not found.'; end if;
  if v_line.shop_id is distinct from v_item.shop_id then
    raise exception 'Work-order line belongs to a different shop.';
  end if;
  if v_request.work_order_id is not null and v_request.work_order_id <> v_line.work_order_id then
    raise exception 'Work-order line does not belong to the request work order.';
  end if;

  perform public.parts_assert_work_order_mutable(v_item.shop_id, v_line.work_order_id);

  v_qty := greatest(coalesce(v_item.qty_requested, v_item.qty, 0), 0);
  if v_qty <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
  v_sell := coalesce(v_item.quoted_price, v_item.unit_price, v_part.price, 0);
  v_cost := coalesce(v_item.unit_cost, v_part.cost, v_part.default_cost, 0);

  select * into v_wop
  from public.work_order_parts
  where source_parts_request_item_id = p_request_item_id and is_active
  order by updated_at desc, id desc
  limit 1
  for update;

  if found then
    if v_wop.part_id is distinct from v_item.part_id then
      if coalesce(v_wop.quantity_ordered, 0) > 0
         or coalesce(v_wop.quantity_received, 0) > 0
         or coalesce(v_wop.quantity_allocated, 0) > 0
         or coalesce(v_wop.quantity_consumed, 0) > 0
         or coalesce(v_wop.quantity_returned, 0) > 0 then
        raise exception 'Selected part changed after lifecycle activity. Use the canonical replacement command.';
      end if;
    end if;

    update public.work_order_parts
    set work_order_id = v_line.work_order_id,
        work_order_line_id = v_item.work_order_line_id,
        part_id = v_item.part_id,
        quantity = v_qty,
        quantity_requested = v_qty,
        unit_price = v_sell,
        total_price = round(v_qty * v_sell, 2),
        description_snapshot = coalesce(nullif(trim(v_part.name), ''), nullif(trim(v_item.description), ''), 'Part'),
        manufacturer_snapshot = coalesce(nullif(trim(v_part.manufacturer), ''), nullif(trim(v_item.requested_manufacturer), '')),
        supplier_snapshot = nullif(trim(v_part.supplier), ''),
        vendor_snapshot = nullif(trim(v_item.vendor), ''),
        part_number_snapshot = coalesce(nullif(trim(v_part.part_number), ''), nullif(trim(v_item.requested_part_number), '')),
        sku_snapshot = nullif(trim(v_part.sku), ''),
        unit_cost_snapshot = v_cost,
        unit_sell_price_snapshot = v_sell,
        updated_at = now()
    where id = v_wop.id
    returning * into v_wop;
    return v_wop.id;
  end if;

  insert into public.work_order_parts(
    work_order_id,
    work_order_line_id,
    shop_id,
    part_id,
    quantity,
    unit_price,
    total_price,
    source_parts_request_id,
    source_parts_request_item_id,
    description_snapshot,
    manufacturer_snapshot,
    supplier_snapshot,
    vendor_snapshot,
    part_number_snapshot,
    sku_snapshot,
    quantity_requested,
    quantity_received,
    quantity_consumed,
    quantity_returned,
    unit_cost_snapshot,
    unit_sell_price_snapshot,
    lifecycle_status,
    updated_at,
    is_active
  ) values (
    v_line.work_order_id,
    v_item.work_order_line_id,
    v_item.shop_id,
    v_item.part_id,
    v_qty,
    v_sell,
    round(v_qty * v_sell, 2),
    v_item.request_id,
    v_item.id,
    coalesce(nullif(trim(v_part.name), ''), nullif(trim(v_item.description), ''), 'Part'),
    coalesce(nullif(trim(v_part.manufacturer), ''), nullif(trim(v_item.requested_manufacturer), '')),
    nullif(trim(v_part.supplier), ''),
    nullif(trim(v_item.vendor), ''),
    coalesce(nullif(trim(v_part.part_number), ''), nullif(trim(v_item.requested_part_number), '')),
    nullif(trim(v_part.sku), ''),
    v_qty,
    coalesce(v_item.qty_received, 0),
    coalesce(v_item.qty_consumed, 0),
    coalesce(v_item.qty_returned, 0),
    v_cost,
    v_sell,
    'requested',
    now(),
    true
  ) returning * into v_wop;

  return v_wop.id;
end;
$$;

create or replace view public.invoice_net_issued_parts as
select
  wop.id,
  wop.shop_id,
  wop.work_order_id,
  wop.work_order_line_id,
  wop.part_id,
  greatest(coalesce(wop.quantity_consumed, 0) - coalesce(wop.quantity_returned, 0), 0) as net_issued_quantity,
  coalesce(wop.unit_sell_price_snapshot, wop.unit_price, 0) as unit_sell_price,
  round(
    greatest(coalesce(wop.quantity_consumed, 0) - coalesce(wop.quantity_returned, 0), 0)
      * coalesce(wop.unit_sell_price_snapshot, wop.unit_price, 0),
    2
  ) as line_total,
  wop.description_snapshot,
  wop.manufacturer_snapshot,
  wop.supplier_snapshot,
  wop.vendor_snapshot,
  wop.part_number_snapshot,
  wop.sku_snapshot,
  wop.unit_cost_snapshot
from public.work_order_parts wop
join public.work_order_lines wol
  on wol.id = wop.work_order_line_id
 and wol.work_order_id = wop.work_order_id
 and wol.shop_id = wop.shop_id
where wol.voided_at is null
  and greatest(coalesce(wop.quantity_consumed, 0) - coalesce(wop.quantity_returned, 0), 0) > 0;

grant select on public.invoice_net_issued_parts to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
