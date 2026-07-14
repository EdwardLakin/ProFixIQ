begin;

-- Backfill separated ordered and returned quantities from canonical ledgers.
with ordered as (
  select part_request_item_id, coalesce(sum(qty), 0) as qty_ordered
  from public.purchase_order_lines
  where part_request_item_id is not null
  group by part_request_item_id
)
update public.part_request_items pri
set qty_ordered = greatest(ordered.qty_ordered, 0)
from ordered
where pri.id = ordered.part_request_item_id;

with returned as (
  select source_parts_request_item_id,
         coalesce(sum(quantity_returned), 0) as qty_returned
  from public.work_order_parts
  where source_parts_request_item_id is not null
  group by source_parts_request_item_id
)
update public.part_request_items pri
set qty_returned = least(
      greatest(returned.qty_returned, 0),
      greatest(coalesce(pri.qty_consumed, 0), 0)
    )
from returned
where pri.id = returned.source_parts_request_item_id;

-- Repair negative legacy counters before validating the new invariants.
update public.part_request_items
set qty = greatest(coalesce(qty, 0), 0),
    qty_requested = greatest(coalesce(qty_requested, 0), 0),
    qty_assigned = greatest(coalesce(qty_assigned, 0), 0),
    qty_ordered = greatest(coalesce(qty_ordered, 0), 0),
    qty_received = greatest(coalesce(qty_received, 0), 0),
    qty_reserved = greatest(coalesce(qty_reserved, 0), 0),
    qty_consumed = greatest(coalesce(qty_consumed, 0), 0),
    qty_returned = least(
      greatest(coalesce(qty_returned, 0), 0),
      greatest(coalesce(qty_consumed, 0), 0)
    );

update public.work_order_parts
set quantity_requested = greatest(coalesce(quantity_requested, 0), 0),
    quantity_ordered = greatest(coalesce(quantity_ordered, 0), 0),
    quantity_received = greatest(coalesce(quantity_received, 0), 0),
    quantity_allocated = greatest(coalesce(quantity_allocated, 0), 0),
    quantity_consumed = greatest(coalesce(quantity_consumed, 0), 0),
    quantity_returned = least(
      greatest(coalesce(quantity_returned, 0), 0),
      greatest(coalesce(quantity_consumed, 0), 0)
    ),
    quantity_cancelled = greatest(coalesce(quantity_cancelled, 0), 0);

-- Backfill distinct identity snapshots without overwriting existing immutable values.
update public.work_order_parts wop
set manufacturer_snapshot = coalesce(wop.manufacturer_snapshot, p.manufacturer, pri.requested_manufacturer),
    supplier_snapshot = coalesce(wop.supplier_snapshot, p.supplier),
    vendor_snapshot = coalesce(wop.vendor_snapshot, pri.vendor),
    part_number_snapshot = coalesce(wop.part_number_snapshot, p.part_number, pri.requested_part_number),
    sku_snapshot = coalesce(wop.sku_snapshot, p.sku),
    unit_cost_snapshot = coalesce(wop.unit_cost_snapshot, pri.unit_cost, p.cost, p.default_cost),
    unit_sell_price_snapshot = coalesce(wop.unit_sell_price_snapshot, pri.quoted_price, pri.unit_price, p.price),
    updated_at = wop.updated_at
from public.parts p
left join public.part_request_items pri
  on pri.id = wop.source_parts_request_item_id
where p.id = wop.part_id
  and p.shop_id = wop.shop_id;

alter table public.part_request_items
  validate constraint part_request_items_nonnegative_phase3;
alter table public.work_order_parts
  validate constraint work_order_parts_nonnegative_phase3;
alter table public.purchase_order_lines
  validate constraint purchase_order_lines_cancelled_qty_phase3;

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.parts_operation_keys') is null then
    v_missing := array_append(v_missing, 'parts_operation_keys');
  end if;
  if to_regclass('public.parts_disposition_events') is null then
    v_missing := array_append(v_missing, 'parts_disposition_events');
  end if;
  if to_regclass('public.invoice_net_issued_parts') is null then
    v_missing := array_append(v_missing, 'invoice_net_issued_parts');
  end if;

  if to_regprocedure('public.parts_commit_request_package_atomic(uuid,uuid,text,uuid)') is null then
    v_missing := array_append(v_missing, 'parts_commit_request_package_atomic');
  end if;
  if to_regprocedure('public.parts_update_attach_allocate_item_atomic(uuid,uuid,uuid,text,numeric,numeric,text,text,uuid,uuid,uuid,boolean,boolean,text,text,uuid)') is null then
    v_missing := array_append(v_missing, 'parts_update_attach_allocate_item_atomic');
  end if;
  if to_regprocedure('public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)') is null then
    v_missing := array_append(v_missing, 'parts_void_work_order_line_atomic');
  end if;
  if to_regprocedure('public.get_invoice_net_issued_parts(uuid,uuid)') is null then
    v_missing := array_append(v_missing, 'get_invoice_net_issued_parts');
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'parts_operation_keys'
      and indexdef ilike '%unique%shop_id%operation_key%'
  ) then
    v_missing := array_append(v_missing, 'tenant operation key uniqueness');
  end if;

  if cardinality(v_missing) > 0 then
    raise exception 'Phase 3 parts postcheck failed. Missing: %', array_to_string(v_missing, ', ');
  end if;

  raise notice 'Phase 3 canonical parts transaction postcheck passed.';
end;
$$;

notify pgrst, 'reload schema';

commit;
