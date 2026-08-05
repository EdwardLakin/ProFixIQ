begin;

-- A request can begin as a customer-facing quote before an inventory record is
-- selected. In that state legacy rows may carry the sell price in unit_cost.
-- Once a catalog-backed PO line is created, prefer the catalog acquisition cost
-- only when the submitted value is absent or is the unchanged mirrored sell
-- price. A genuinely distinct supplier quote remains authoritative.
create or replace function private.normalize_purchase_order_line_cost()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_cost numeric;
  v_request_sell numeric;
  v_catalog_cost numeric;
begin
  if new.part_request_item_id is null or new.part_id is null then
    return new;
  end if;

  select
    item.unit_cost,
    coalesce(item.unit_price, item.quoted_price),
    coalesce(part.default_cost, part.cost)
  into v_request_cost, v_request_sell, v_catalog_cost
  from public.part_request_items item
  join public.parts part
    on part.id = new.part_id
   and part.shop_id = item.shop_id
  join public.purchase_orders po
    on po.id = new.po_id
   and po.shop_id = item.shop_id
  where item.id = new.part_request_item_id
    and item.part_id = new.part_id;

  if found
     and v_catalog_cost is not null
     and (
       new.unit_cost is null
       or (
         v_request_cost is not null
         and round(new.unit_cost, 4) = round(v_request_cost, 4)
         and v_request_sell is not null
         and round(v_request_cost, 4) = round(v_request_sell, 4)
       )
     ) then
    new.unit_cost := v_catalog_cost;
  end if;

  if new.unit_cost is null then
    new.unit_cost := 0;
  end if;
  if new.unit_cost < 0 then
    raise exception using errcode = '22023', message = 'PO line unit cost cannot be negative.';
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_purchase_order_line_cost()
  from public, anon, authenticated;

drop trigger if exists trg_normalize_purchase_order_line_cost
  on public.purchase_order_lines;
create trigger trg_normalize_purchase_order_line_cost
before insert or update of part_request_item_id, part_id, unit_cost
on public.purchase_order_lines
for each row
execute function private.normalize_purchase_order_line_cost();

-- The PO line is the durable procurement-cost boundary. Keep its linked
-- lifecycle rows aligned so margins do not continue using a pre-inventory
-- customer sell price.
create or replace function private.sync_purchase_order_line_cost_to_parts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.part_request_item_id is not null then
    update public.part_request_items item
    set unit_cost = new.unit_cost,
        updated_at = now()
    where item.id = new.part_request_item_id
      and item.unit_cost is distinct from new.unit_cost;
  end if;

  if new.work_order_part_id is not null then
    update public.work_order_parts part
    set unit_cost_snapshot = new.unit_cost,
        updated_at = now()
    where part.id = new.work_order_part_id
      and part.unit_cost_snapshot is distinct from new.unit_cost;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_purchase_order_line_cost_to_parts()
  from public, anon, authenticated;

drop trigger if exists trg_sync_purchase_order_line_cost_to_parts
  on public.purchase_order_lines;
create trigger trg_sync_purchase_order_line_cost_to_parts
after insert or update of part_request_item_id, work_order_part_id, unit_cost
on public.purchase_order_lines
for each row
execute function private.sync_purchase_order_line_cost_to_parts();

create or replace function private.recalculate_purchase_order_totals(
  p_po_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subtotal numeric;
begin
  select round(
    coalesce(sum(
      greatest(coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0)
      * greatest(coalesce(line.unit_cost, 0), 0)
    ), 0),
    2
  )
  into v_subtotal
  from public.purchase_order_lines line
  where line.po_id = p_po_id;

  update public.purchase_orders po
  set subtotal = v_subtotal,
      total = round(
        v_subtotal
        + greatest(coalesce(po.tax_total, 0), 0)
        + greatest(coalesce(po.shipping_total, 0), 0),
        2
      )
  where po.id = p_po_id;
end;
$$;

revoke all on function private.recalculate_purchase_order_totals(uuid)
  from public, anon, authenticated;

create or replace function private.sync_purchase_order_totals_from_line()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform private.recalculate_purchase_order_totals(old.po_id);
    return old;
  end if;

  perform private.recalculate_purchase_order_totals(new.po_id);
  if tg_op = 'UPDATE' and old.po_id is distinct from new.po_id then
    perform private.recalculate_purchase_order_totals(old.po_id);
  end if;
  return new;
end;
$$;

revoke all on function private.sync_purchase_order_totals_from_line()
  from public, anon, authenticated;

drop trigger if exists trg_sync_purchase_order_totals_from_line
  on public.purchase_order_lines;
create trigger trg_sync_purchase_order_totals_from_line
after insert or delete or update of po_id, qty, unit_cost, cancelled_qty
on public.purchase_order_lines
for each row
execute function private.sync_purchase_order_totals_from_line();

-- Repair header arithmetic only where line detail exists. Header-only imports
-- retain their original totals because no deterministic line rollup is possible.
do $$
declare
  v_po record;
begin
  for v_po in
    select distinct line.po_id
    from public.purchase_order_lines line
    where line.po_id is not null
  loop
    perform private.recalculate_purchase_order_totals(v_po.po_id);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.purchase_order_lines'::regclass
      and tgname = 'trg_normalize_purchase_order_line_cost'
      and not tgisinternal
  ) then
    raise exception 'Purchase-order cost normalization trigger is missing.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.purchase_order_lines'::regclass
      and tgname = 'trg_sync_purchase_order_line_cost_to_parts'
      and not tgisinternal
  ) then
    raise exception 'Purchase-order lifecycle cost sync trigger is missing.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.purchase_order_lines'::regclass
      and tgname = 'trg_sync_purchase_order_totals_from_line'
      and not tgisinternal
  ) then
    raise exception 'Purchase-order total rollup trigger is missing.';
  end if;
end;
$$;

commit;
