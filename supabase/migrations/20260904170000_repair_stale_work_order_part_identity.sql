-- The previous migration stopped NEW re-matches from leaving
-- work_order_parts.part_id stale, but it can't retroactively fix rows that
-- were already re-matched by "Change Part" before that fix was deployed
-- (part_request_items.part_id moved on while the already-materialized
-- work_order_parts row stayed pinned to the original part). Those rows
-- still fail parts_allocate_request_item's identity check at Pick time
-- with "Canonical work-order part does not match the request item."
--
-- One-time repair: for every work_order_part whose part_id disagrees with
-- its source request item's part_id, and which has no allocation/receipt/
-- consumption activity yet (so nothing has actually moved against the
-- stale part), bring it into agreement — same sync logic the attach RPC
-- now applies going forward. A row with real activity is left untouched
-- and reported instead of silently rewritten.
begin;

lock table public.work_order_parts in share row exclusive mode;
lock table public.part_request_items in share row exclusive mode;

do $backfill$
declare
  v_row record;
  v_part public.parts%rowtype;
  v_repaired int := 0;
  v_skipped_active int := 0;
begin
  for v_row in
    select
      wop.id as wop_id,
      pri.id as item_id,
      pri.part_id as item_part_id,
      pri.vendor,
      pri.unit_cost,
      pri.unit_price,
      pri.quoted_price
    from public.work_order_parts wop
    join public.part_request_items pri
      on pri.id = wop.source_parts_request_item_id
    where wop.source_parts_request_item_id is not null
      and pri.part_id is not null
      and wop.part_id is distinct from pri.part_id
      and coalesce(wop.is_active, true)
      and coalesce(wop.quantity_allocated, 0) = 0
      and coalesce(wop.quantity_received, 0) = 0
      and coalesce(wop.quantity_consumed, 0) = 0
    order by wop.id
    for update of wop
  loop
    select * into v_part from public.parts where id = v_row.item_part_id;

    update public.work_order_parts
    set part_id = v_row.item_part_id,
        description_snapshot = coalesce(v_part.name, description_snapshot),
        manufacturer_snapshot = coalesce(v_part.supplier, v_row.vendor, manufacturer_snapshot),
        part_number_snapshot = v_part.part_number,
        unit_cost_snapshot = coalesce(v_row.unit_cost, v_part.cost, unit_cost_snapshot),
        unit_sell_price_snapshot = coalesce(v_row.unit_price, v_row.quoted_price, v_part.price, unit_sell_price_snapshot),
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
    and wop.part_id is distinct from pri.part_id
    and coalesce(wop.is_active, true)
    and (
      coalesce(wop.quantity_allocated, 0) > 0
      or coalesce(wop.quantity_received, 0) > 0
      or coalesce(wop.quantity_consumed, 0) > 0
    );

  raise notice 'parts_request_work_order_part_identity_repair: repaired %, left % with existing activity for manual review',
    v_repaired, v_skipped_active;
end;
$backfill$;

commit;
