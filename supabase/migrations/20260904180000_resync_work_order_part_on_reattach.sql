-- parts_attach_request_item used to keep a request line's canonical
-- work_order_parts row (quantity, pricing, and part identity) in sync every
-- time it ran (see 20260714040300_phase3_part_identity_snapshots.sql). The
-- 2026-08-08 PO-materialization rewrite (20260808021602) replaced that with
-- "find the existing row, return its id unchanged" -- so once a
-- work_order_parts row was first materialized, its quantity_requested,
-- quantity, pricing, and part identity all froze at whatever the request
-- item looked like at that exact moment, forever. Every later edit to the
-- request line (qty via Save, a different inventory match via Change Part)
-- never reached the canonical row.
--
-- That regression is why WO-000018's job Parts card showed "6/0" and "1/0":
-- the picked (allocated) quantity is read live from
-- work_order_part_allocations, but the "required" half of that fraction
-- came from the canonical row's stale quantity_requested, which had been
-- pinned to 0 (or some other value) from an earlier moment.
--
-- Restore the original sync-on-find behavior, keeping this migration's
-- PO-line/materializing-flag structure otherwise unchanged. Re-mapping the
-- row to a *different* part_id is still refused once real order/receive/
-- allocate/consume/return activity exists against it -- that protection is
-- unchanged from the original implementation. Quantity and pricing are
-- always resynced, since they only ever describe how much of the current
-- part is wanted and at what price, never a committed historical fact.
create or replace function public.parts_attach_request_item(p_request_item_id uuid)
returns uuid
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
begin
  if auth.uid() is null
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authentication required.';
  end if;
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
    when coalesce(v_item.qty_requested, 0) > 0 then v_item.qty_requested
    when coalesce(v_item.qty, 0) > 0 then v_item.qty
    else 0
  end;
  if v_qty <= 0 then raise exception 'Quantity must be greater than 0.'; end if;
  v_sell := coalesce(v_item.unit_price, v_item.quoted_price, v_part.price, 0);

  select *
    into v_wop
  from public.work_order_parts
  where source_parts_request_item_id = p_request_item_id
    and coalesce(is_active, true)
  for update;

  if found then
    if v_wop.part_id is distinct from v_item.part_id
       and (
         coalesce(v_wop.quantity_ordered, 0) > 0
         or coalesce(v_wop.quantity_received, 0) > 0
         or coalesce(v_wop.quantity_allocated, 0) > 0
         or coalesce(v_wop.quantity_consumed, 0) > 0
         or coalesce(v_wop.quantity_returned, 0) > 0
       ) then
      raise exception 'Selected part changed after lifecycle activity. Use the canonical replacement command.';
    end if;

    update public.work_order_parts
    set part_id = v_item.part_id,
        quantity = v_qty,
        quantity_requested = v_qty,
        unit_price = v_sell,
        total_price = round(v_qty * v_sell, 2),
        description_snapshot = coalesce(v_part.name, v_item.description, description_snapshot),
        manufacturer_snapshot = coalesce(v_part.supplier, v_item.vendor, manufacturer_snapshot),
        part_number_snapshot = coalesce(v_part.part_number, part_number_snapshot),
        unit_cost_snapshot = coalesce(v_item.unit_cost, v_part.cost, unit_cost_snapshot),
        unit_sell_price_snapshot = v_sell,
        updated_at = now()
    where id = v_wop.id;

    return v_wop.id;
  end if;

  insert into public.work_order_parts(
    work_order_id, work_order_line_id, shop_id, part_id, quantity, unit_price,
    total_price, source_parts_request_id, source_parts_request_item_id,
    description_snapshot, manufacturer_snapshot, part_number_snapshot,
    quantity_requested, quantity_received, quantity_consumed,
    unit_cost_snapshot, unit_sell_price_snapshot, lifecycle_status,
    updated_at, is_active
  ) values (
    v_line.work_order_id, v_item.work_order_line_id, v_item.shop_id, v_item.part_id,
    v_qty, v_sell,
    round(v_qty * v_sell, 2),
    v_item.request_id, v_item.id, coalesce(v_part.name, v_item.description),
    coalesce(v_part.supplier, v_item.vendor), v_part.part_number, v_qty,
    coalesce(v_item.qty_received, 0), coalesce(v_item.qty_consumed, 0),
    coalesce(v_item.unit_cost, v_part.cost),
    v_sell,
    'requested', now(), true
  ) returning id into v_wop.id;

  return v_wop.id;
end;
$$;

-- One-time repair for rows already frozen stale by the dropped sync logic
-- (WO-000018's shape: quantity_requested pinned at a value, often 0, from
-- whenever the row was first materialized). Only resync rows with no real
-- order/receive/allocate/consume/return activity yet -- the same boundary
-- the function above now enforces for future calls.
begin;

lock table public.work_order_parts in share row exclusive mode;
lock table public.part_request_items in share row exclusive mode;

do $backfill$
declare
  v_row record;
  v_part public.parts%rowtype;
  v_qty numeric;
  v_sell numeric;
  v_repaired int := 0;
  v_skipped_active int := 0;
begin
  for v_row in
    select
      wop.id as wop_id,
      pri.id as item_id,
      pri.part_id as item_part_id,
      pri.description,
      pri.vendor,
      pri.unit_cost,
      pri.unit_price,
      pri.quoted_price,
      pri.qty,
      pri.qty_requested
    from public.work_order_parts wop
    join public.part_request_items pri
      on pri.id = wop.source_parts_request_item_id
    where wop.source_parts_request_item_id is not null
      and pri.part_id is not null
      and coalesce(wop.is_active, true)
      and coalesce(wop.quantity_allocated, 0) = 0
      and coalesce(wop.quantity_received, 0) = 0
      and coalesce(wop.quantity_consumed, 0) = 0
      and coalesce(wop.quantity_ordered, 0) = 0
      and coalesce(wop.quantity_returned, 0) = 0
      and (
        wop.part_id is distinct from pri.part_id
        or coalesce(wop.quantity_requested, 0) is distinct from greatest(
          coalesce(pri.qty_requested, pri.qty, 0), 0
        )
      )
    order by wop.id
    for update of wop
  loop
    v_qty := case
      when coalesce(v_row.qty_requested, 0) > 0 then v_row.qty_requested
      when coalesce(v_row.qty, 0) > 0 then v_row.qty
      else 0
    end;
    if v_qty <= 0 then
      continue;
    end if;

    select * into v_part from public.parts where id = v_row.item_part_id;
    v_sell := coalesce(v_row.unit_price, v_row.quoted_price, v_part.price, 0);

    update public.work_order_parts
    set part_id = v_row.item_part_id,
        quantity = v_qty,
        quantity_requested = v_qty,
        unit_price = v_sell,
        total_price = round(v_qty * v_sell, 2),
        description_snapshot = coalesce(v_part.name, v_row.description, description_snapshot),
        manufacturer_snapshot = coalesce(v_part.supplier, v_row.vendor, manufacturer_snapshot),
        part_number_snapshot = coalesce(v_part.part_number, part_number_snapshot),
        unit_cost_snapshot = coalesce(v_row.unit_cost, v_part.cost, unit_cost_snapshot),
        unit_sell_price_snapshot = v_sell,
        updated_at = now()
    where id = v_row.wop_id;

    v_repaired := v_repaired + 1;
  end loop;

  select count(*)
    into v_skipped_active
  from public.work_order_parts wop
  join public.part_request_items pri
    on pri.id = wop.source_parts_request_item_id
  where wop.source_parts_request_item_id is not null
    and pri.part_id is not null
    and coalesce(wop.is_active, true)
    and (
      wop.part_id is distinct from pri.part_id
      or coalesce(wop.quantity_requested, 0) is distinct from greatest(
        coalesce(pri.qty_requested, pri.qty, 0), 0
      )
    )
    and (
      coalesce(wop.quantity_allocated, 0) > 0
      or coalesce(wop.quantity_received, 0) > 0
      or coalesce(wop.quantity_consumed, 0) > 0
      or coalesce(wop.quantity_ordered, 0) > 0
      or coalesce(wop.quantity_returned, 0) > 0
    );

  raise notice 'parts_request_work_order_part_quantity_repair: repaired %, left % with existing activity for manual review',
    v_repaired, v_skipped_active;
end;
$backfill$;

commit;
