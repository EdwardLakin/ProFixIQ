-- Phase 2 parts lifecycle completion.
-- Establish operation idempotency, normalize reservation movement semantics,
-- and add canonical transactional commands for allocation, release, receiving,
-- issue/consumption, return, cancellation, and replacement.

alter table public.stock_moves
  add column if not exists idempotency_key text,
  add column if not exists work_order_part_id uuid,
  add column if not exists part_request_item_id uuid,
  add column if not exists purchase_order_line_id uuid,
  add column if not exists metadata jsonb default '{}'::jsonb not null,
  add column if not exists lifecycle_quantity numeric(12,2);

create unique index if not exists uq_stock_moves_shop_idempotency_key
  on public.stock_moves(shop_id, idempotency_key)
  where idempotency_key is not null;

-- Replace the Phase 1 broad uniqueness rule. Keeping it would block legitimate
-- second receipts/releases/issues against the same source and reason.
drop index if exists public.uq_stock_moves_reference_reason;

alter table public.work_order_parts
  add column if not exists is_active boolean default true not null,
  add column if not exists replaced_from_work_order_part_id uuid,
  add column if not exists replaced_by_work_order_part_id uuid;

alter table public.work_order_part_allocations
  add column if not exists work_order_part_id uuid;

update public.work_order_part_allocations a
set work_order_part_id = wop.id
from public.work_order_parts wop
where a.work_order_part_id is null
  and a.source_request_item_id = wop.source_parts_request_item_id
  and a.part_id = wop.part_id
  and wop.is_active
  and not exists (
    select 1 from public.work_order_parts w2
    where w2.source_parts_request_item_id = a.source_request_item_id
      and w2.part_id = a.part_id
      and w2.is_active
      and w2.id <> wop.id
  );

alter table public.purchase_order_lines
  add column if not exists part_request_item_id uuid,
  add column if not exists work_order_part_id uuid,
  add column if not exists idempotency_key text;

create unique index if not exists uq_purchase_order_lines_idempotency
  on public.purchase_order_lines(po_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_purchase_order_lines_work_order_part_id
  on public.purchase_order_lines(work_order_part_id)
  where work_order_part_id is not null;

create unique index if not exists uq_work_order_parts_active_source_request_item
  on public.work_order_parts(source_parts_request_item_id)
  where source_parts_request_item_id is not null and is_active;

create unique index if not exists uq_wopa_work_order_part_location
  on public.work_order_part_allocations(work_order_part_id, location_id)
  where work_order_part_id is not null;

create index if not exists idx_stock_moves_work_order_part_id
  on public.stock_moves(work_order_part_id)
  where work_order_part_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_order_lines_part_request_item_id_fkey' and conrelid = 'public.purchase_order_lines'::regclass) then
    alter table public.purchase_order_lines add constraint purchase_order_lines_part_request_item_id_fkey foreign key (part_request_item_id) references public.part_request_items(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_order_lines_work_order_part_id_fkey' and conrelid = 'public.purchase_order_lines'::regclass) then
    alter table public.purchase_order_lines add constraint purchase_order_lines_work_order_part_id_fkey foreign key (work_order_part_id) references public.work_order_parts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_order_part_allocations_work_order_part_id_fkey' and conrelid = 'public.work_order_part_allocations'::regclass) then
    alter table public.work_order_part_allocations add constraint work_order_part_allocations_work_order_part_id_fkey foreign key (work_order_part_id) references public.work_order_parts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_order_parts_replaced_from_fkey' and conrelid = 'public.work_order_parts'::regclass) then
    alter table public.work_order_parts add constraint work_order_parts_replaced_from_fkey foreign key (replaced_from_work_order_part_id) references public.work_order_parts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_order_parts_replaced_by_fkey' and conrelid = 'public.work_order_parts'::regclass) then
    alter table public.work_order_parts add constraint work_order_parts_replaced_by_fkey foreign key (replaced_by_work_order_part_id) references public.work_order_parts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_work_order_part_id_fkey' and conrelid = 'public.stock_moves'::regclass) then
    alter table public.stock_moves add constraint stock_moves_work_order_part_id_fkey foreign key (work_order_part_id) references public.work_order_parts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_part_request_item_id_fkey' and conrelid = 'public.stock_moves'::regclass) then
    alter table public.stock_moves add constraint stock_moves_part_request_item_id_fkey foreign key (part_request_item_id) references public.part_request_items(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_purchase_order_line_id_fkey' and conrelid = 'public.stock_moves'::regclass) then
    alter table public.stock_moves add constraint stock_moves_purchase_order_line_id_fkey foreign key (purchase_order_line_id) references public.purchase_order_lines(id) on delete set null;
  end if;
end $$;

create or replace function public.parts_lifecycle_status(
  p_requested numeric,
  p_ordered numeric,
  p_received numeric,
  p_allocated numeric,
  p_consumed numeric,
  p_returned numeric,
  p_cancelled numeric
) returns text language sql immutable as $$
  select case
    when coalesce(p_cancelled,0) >= greatest(coalesce(p_requested,0) - coalesce(p_consumed,0), 0) and coalesce(p_consumed,0) = 0 then 'cancelled'
    when coalesce(p_returned,0) > 0 and coalesce(p_returned,0) < coalesce(p_consumed,0) then 'partially_returned'
    when coalesce(p_returned,0) > 0 and coalesce(p_returned,0) >= coalesce(p_consumed,0) then 'returned'
    when coalesce(p_consumed,0) > 0 and coalesce(p_consumed,0) < coalesce(p_requested,0) then 'partially_consumed'
    when coalesce(p_consumed,0) > 0 and coalesce(p_consumed,0) >= coalesce(p_requested,0) then 'consumed'
    when coalesce(p_allocated,0) > 0 and coalesce(p_allocated,0) < coalesce(p_requested,0) then 'partially_allocated'
    when coalesce(p_allocated,0) > 0 and coalesce(p_allocated,0) >= coalesce(p_requested,0) then 'reserved'
    when coalesce(p_received,0) > 0 and coalesce(p_received,0) < coalesce(p_ordered, p_requested,0) then 'partially_received'
    when coalesce(p_received,0) > 0 then 'received'
    when coalesce(p_ordered,0) > 0 and coalesce(p_ordered,0) < coalesce(p_requested,0) then 'partially_ordered'
    when coalesce(p_ordered,0) > 0 then 'ordered'
    else 'requested'
  end;
$$;

create or replace function public.parts_on_hand(p_shop_id uuid, p_part_id uuid, p_location_id uuid default null)
returns numeric language sql stable as $$
  select coalesce(sum(sm.qty_change),0)::numeric
  from public.stock_moves sm
  where sm.shop_id = p_shop_id
    and sm.part_id = p_part_id
    and (p_location_id is null or sm.location_id = p_location_id)
    and sm.reason not in ('wo_allocate','wo_release');
$$;

create or replace function public.parts_allocated(p_shop_id uuid, p_part_id uuid, p_location_id uuid default null)
returns numeric language sql stable as $$
  select coalesce(sum(a.qty),0)::numeric
  from public.work_order_part_allocations a
  where a.shop_id = p_shop_id
    and a.part_id = p_part_id
    and (p_location_id is null or a.location_id = p_location_id);
$$;

create or replace function public.parts_available(p_shop_id uuid, p_part_id uuid, p_location_id uuid default null)
returns numeric language sql stable as $$
  select public.parts_on_hand(p_shop_id, p_part_id, p_location_id) - public.parts_allocated(p_shop_id, p_part_id, p_location_id);
$$;

create or replace function public.parts_reconcile_work_order_part(p_work_order_part_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select * into v from public.work_order_parts where id = p_work_order_part_id for update;
  if not found then return; end if;
  update public.work_order_parts
  set lifecycle_status = public.parts_lifecycle_status(quantity_requested, quantity_ordered, quantity_received, quantity_allocated, quantity_consumed, quantity_returned, quantity_cancelled),
      updated_at = now()
  where id = p_work_order_part_id;
end $$;

create or replace function public.parts_attach_request_item(p_request_item_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_item public.part_request_items%rowtype; v_request public.part_requests%rowtype; v_part public.parts%rowtype; v_line record; v_wop uuid; v_qty numeric;
begin
  select * into v_item from public.part_request_items where id = p_request_item_id for update;
  if not found then raise exception 'Request item not found.'; end if;
  if v_item.work_order_line_id is null then raise exception 'Request item must be linked to a work-order line.'; end if;
  if v_item.part_id is null then raise exception 'Request item has no selected inventory part.'; end if;
  select * into v_request from public.part_requests where id = v_item.request_id for update;
  if not found then raise exception 'Parent parts request not found.'; end if;
  select * into v_part from public.parts where id = v_item.part_id;
  if not found then raise exception 'Selected part not found.'; end if;
  if v_part.shop_id is distinct from v_item.shop_id then raise exception 'Selected part belongs to a different shop.'; end if;
  select wl.id, wl.work_order_id, wo.shop_id into v_line from public.work_order_lines wl join public.work_orders wo on wo.id = wl.work_order_id where wl.id = v_item.work_order_line_id;
  if not found then raise exception 'Work-order line not found.'; end if;
  if v_line.shop_id is distinct from v_item.shop_id then raise exception 'Work-order line belongs to a different shop.'; end if;
  if v_request.work_order_id is not null and v_request.work_order_id <> v_line.work_order_id then raise exception 'Work-order line does not belong to the request work order.'; end if;
  v_qty := case
    when coalesce(v_item.qty_requested, 0) > 0
      then v_item.qty_requested
    when coalesce(v_item.qty, 0) > 0
      then v_item.qty
    else 0
  end;
  if v_qty <= 0 then raise exception 'Quantity must be greater than 0.'; end if;
  select id into v_wop from public.work_order_parts where source_parts_request_item_id = p_request_item_id and is_active for update;
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

create or replace function public.parts_allocate_request_item(p_request_item_id uuid, p_location_id uuid, p_qty numeric, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item public.part_request_items%rowtype; v_wop public.work_order_parts%rowtype; v_existing public.stock_moves%rowtype; v_available numeric; v_alloc_id uuid; v_move_id uuid; v_new_alloc numeric;
begin
  if p_qty <= 0 then raise exception 'Allocation quantity must be greater than 0.'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency_key is required.'; end if;
  select * into v_item from public.part_request_items where id = p_request_item_id for update;
  if not found then raise exception 'Request item not found.'; end if;
  select * into v_existing from public.stock_moves where shop_id = v_item.shop_id and idempotency_key = p_idempotency_key;
  if found then return coalesce(v_existing.metadata, '{}'::jsonb) || jsonb_build_object('ok', true, 'idempotent', true, 'stock_move_id', v_existing.id); end if;
  select * into v_wop from public.work_order_parts where id = public.parts_ensure_work_order_part(p_request_item_id) for update;
  if v_wop.part_id is null then raise exception 'Work-order part has no selected part.'; end if;
  v_available := public.parts_available(v_wop.shop_id, v_wop.part_id, p_location_id);
  if v_available < p_qty then raise exception 'Insufficient available stock. Available %, requested %.', v_available, p_qty; end if;
  insert into public.stock_moves(part_id, location_id, qty_change, reason, reference_kind, reference_id, created_by, shop_id, idempotency_key, work_order_part_id, part_request_item_id, metadata, lifecycle_quantity)
  values (v_wop.part_id, p_location_id, 0, 'wo_allocate', 'work_order_part', v_wop.id, auth.uid(), v_wop.shop_id, p_idempotency_key, v_wop.id, p_request_item_id, jsonb_build_object('qty_reserved', p_qty, 'operation', 'allocate'), p_qty) returning id into v_move_id;
  insert into public.work_order_part_allocations(work_order_line_id, work_order_id, shop_id, part_id, location_id, qty, unit_cost, stock_move_id, source_request_item_id, work_order_part_id)
  values (v_wop.work_order_line_id, v_wop.work_order_id, v_wop.shop_id, v_wop.part_id, p_location_id, p_qty, coalesce(v_wop.unit_cost_snapshot,0), v_move_id, p_request_item_id, v_wop.id)
  on conflict (work_order_part_id, location_id) where work_order_part_id is not null do update set qty = public.work_order_part_allocations.qty + excluded.qty, stock_move_id = excluded.stock_move_id
  returning id, qty into v_alloc_id, v_new_alloc;
  update public.part_request_items set qty_reserved = coalesce(qty_reserved,0) + p_qty, status='reserved', updated_at=now() where id=p_request_item_id;
  update public.work_order_parts set quantity_allocated = coalesce(quantity_allocated,0) + p_qty, lifecycle_status='reserved', updated_at=now() where id=v_wop.id;
  perform public.parts_reconcile_work_order_part(v_wop.id);
  update public.stock_moves set metadata = metadata || jsonb_build_object('allocation_id', v_alloc_id, 'work_order_part_id', v_wop.id) where id=v_move_id;
  return jsonb_build_object('ok', true, 'idempotent', false, 'work_order_part_id', v_wop.id, 'allocation_id', v_alloc_id, 'stock_move_id', v_move_id, 'allocated_qty', v_new_alloc, 'available_after', public.parts_available(v_wop.shop_id, v_wop.part_id, p_location_id));
end $$;

create or replace function public.parts_release_allocation(p_request_item_id uuid, p_location_id uuid, p_qty numeric, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item public.part_request_items%rowtype; v_wop public.work_order_parts%rowtype; v_existing public.stock_moves%rowtype; v_alloc public.work_order_part_allocations%rowtype; v_move_id uuid; v_release numeric;
begin
  if p_qty <= 0 then raise exception 'Release quantity must be greater than 0.'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency_key is required.'; end if;
  select * into v_item from public.part_request_items where id = p_request_item_id for update;
  if not found then raise exception 'Request item not found.'; end if;
  select * into v_existing from public.stock_moves where shop_id=v_item.shop_id and idempotency_key=p_idempotency_key;
  if found then return coalesce(v_existing.metadata,'{}'::jsonb) || jsonb_build_object('ok', true, 'idempotent', true, 'stock_move_id', v_existing.id); end if;
  select * into v_wop from public.work_order_parts where source_parts_request_item_id=p_request_item_id for update;
  if not found then raise exception 'Work-order part not found.'; end if;
  select * into v_alloc from public.work_order_part_allocations where work_order_part_id=v_wop.id and location_id=p_location_id for update;
  if not found or v_alloc.qty <= 0 then raise exception 'No active allocation to release.'; end if;
  if v_alloc.qty < p_qty then raise exception 'Cannot release more than active allocation.'; end if;
  v_release := p_qty;
  insert into public.stock_moves(part_id, location_id, qty_change, reason, reference_kind, reference_id, created_by, shop_id, idempotency_key, work_order_part_id, part_request_item_id, metadata, lifecycle_quantity)
  values (v_wop.part_id, p_location_id, 0, 'wo_release', 'work_order_part', v_wop.id, auth.uid(), v_wop.shop_id, p_idempotency_key, v_wop.id, p_request_item_id, jsonb_build_object('qty_released', v_release, 'operation', 'release'), v_release) returning id into v_move_id;
  update public.work_order_part_allocations set qty = qty - v_release, stock_move_id = v_move_id where id = v_alloc.id;
  delete from public.work_order_part_allocations where id = v_alloc.id and qty <= 0;
  update public.part_request_items set qty_reserved = greatest(coalesce(qty_reserved,0) - v_release, 0), updated_at=now() where id=p_request_item_id;
  update public.work_order_parts set quantity_allocated = greatest(coalesce(quantity_allocated,0) - v_release, 0), updated_at=now() where id=v_wop.id;
  perform public.parts_reconcile_work_order_part(v_wop.id);
  return jsonb_build_object('ok', true, 'idempotent', false, 'work_order_part_id', v_wop.id, 'stock_move_id', v_move_id, 'released_qty', v_release, 'available_after', public.parts_available(v_wop.shop_id, v_wop.part_id, p_location_id));
end $$;

create or replace function public.parts_create_po_line_for_request(p_po_id uuid, p_request_item_id uuid, p_qty numeric, p_unit_cost numeric default null, p_location_id uuid default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item public.part_request_items%rowtype; v_po public.purchase_orders%rowtype; v_wop uuid; v_line_id uuid; v_key text; v_total_ordered numeric;
begin
  if p_qty <= 0 then raise exception 'PO quantity must be greater than 0.'; end if;
  v_key := coalesce(nullif(trim(p_idempotency_key),''), 'po-line:'||p_po_id::text||':'||p_request_item_id::text);
  select * into v_item from public.part_request_items where id=p_request_item_id for update;
  if not found then raise exception 'Request item not found.'; end if;
  select * into v_po from public.purchase_orders where id=p_po_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if v_po.shop_id is distinct from v_item.shop_id then raise exception 'Purchase order belongs to a different shop.'; end if;
  v_wop := public.parts_ensure_work_order_part(p_request_item_id);
  insert into public.purchase_order_lines(po_id, part_id, description, qty, unit_cost, location_id, part_request_item_id, work_order_part_id, idempotency_key)
  values (p_po_id, v_item.part_id, v_item.description, p_qty, coalesce(p_unit_cost, v_item.unit_cost, 0), p_location_id, p_request_item_id, v_wop, v_key)
  on conflict (po_id, idempotency_key) where idempotency_key is not null do update set id=id
  returning id into v_line_id;
  select coalesce(sum(qty),0) into v_total_ordered from public.purchase_order_lines where part_request_item_id=p_request_item_id;
  update public.part_request_items set po_id=p_po_id, qty_approved=greatest(coalesce(qty_approved,0), v_total_ordered), status=case when v_total_ordered >= coalesce(qty_requested, qty,0) then 'ordered' else 'ordered' end, updated_at=now() where id=p_request_item_id;
  update public.work_order_parts set quantity_ordered=v_total_ordered, lifecycle_status=public.parts_lifecycle_status(quantity_requested, v_total_ordered, quantity_received, quantity_allocated, quantity_consumed, quantity_returned, quantity_cancelled), updated_at=now() where id=v_wop;
  return jsonb_build_object('ok', true, 'purchase_order_line_id', v_line_id, 'work_order_part_id', v_wop, 'ordered_qty', v_total_ordered);
end $$;

create or replace function public.parts_receive_request_item(p_request_item_id uuid, p_location_id uuid, p_qty numeric, p_po_line_id uuid default null, p_unit_cost numeric default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item public.part_request_items%rowtype; v_wop public.work_order_parts%rowtype; v_line public.purchase_order_lines%rowtype; v_existing public.stock_moves%rowtype; v_key text; v_received_total numeric; v_move_id uuid; v_ordered_limit numeric;
begin
  if p_qty <= 0 then raise exception 'Receive quantity must be greater than 0.'; end if;
  select * into v_item from public.part_request_items where id=p_request_item_id for update;
  if not found then raise exception 'Request item not found.'; end if;
  select * into v_wop from public.work_order_parts where id=public.parts_ensure_work_order_part(p_request_item_id) for update;
  v_key := coalesce(nullif(trim(p_idempotency_key),''), 'receive:'||coalesce(p_po_line_id::text, p_request_item_id::text)||':'||p_qty::text||':'||to_char(now(),'YYYYMMDDHH24MISSMS'));
  select * into v_existing from public.stock_moves where shop_id=v_item.shop_id and idempotency_key=v_key;
  if found then return coalesce(v_existing.metadata,'{}'::jsonb) || jsonb_build_object('ok', true, 'idempotent', true, 'stock_move_id', v_existing.id); end if;
  if p_po_line_id is not null then
    select * into v_line from public.purchase_order_lines where id=p_po_line_id for update;
    if not found then raise exception 'Purchase order line not found.'; end if;
    if v_line.part_request_item_id is distinct from p_request_item_id then raise exception 'PO line is not linked to this request item.'; end if;
    if coalesce(v_line.received_qty,0) + p_qty > coalesce(v_line.qty,0) then raise exception 'Receipt exceeds ordered quantity.'; end if;
    update public.purchase_order_lines set received_qty = coalesce(received_qty,0) + p_qty where id=p_po_line_id;
  else
    select coalesce(sum(qty), case
    when coalesce(v_item.qty_requested, 0) > 0
      then v_item.qty_requested
    when coalesce(v_item.qty, 0) > 0
      then v_item.qty
    else 0
  end) into v_ordered_limit from public.purchase_order_lines where part_request_item_id=p_request_item_id;
    if coalesce(v_item.qty_received,0) + p_qty > greatest(v_ordered_limit, coalesce(v_item.qty_requested, v_item.qty,0)) then raise exception 'Receipt exceeds requested quantity.'; end if;
  end if;
  insert into public.stock_moves(part_id, location_id, qty_change, reason, reference_kind, reference_id, created_by, shop_id, idempotency_key, work_order_part_id, part_request_item_id, purchase_order_line_id, metadata, lifecycle_quantity)
  values (v_wop.part_id, p_location_id, p_qty, 'receive', case when p_po_line_id is null then 'part_request_item' else 'purchase_order_line' end, coalesce(p_po_line_id, p_request_item_id), auth.uid(), v_wop.shop_id, v_key, v_wop.id, p_request_item_id, p_po_line_id, jsonb_build_object('qty_received', p_qty, 'operation', 'receive'), p_qty) returning id into v_move_id;
  update public.part_request_items set qty_received=coalesce(qty_received,0)+p_qty, location_id=coalesce(location_id,p_location_id), unit_cost=coalesce(p_unit_cost, unit_cost), status=case when coalesce(qty_received,0)+p_qty >= coalesce(qty_requested, qty,0) then 'received' else 'partially_received' end, updated_at=now() where id=p_request_item_id returning qty_received into v_received_total;
  update public.work_order_parts set quantity_received=coalesce(quantity_received,0)+p_qty, unit_cost_snapshot=coalesce(p_unit_cost, unit_cost_snapshot), updated_at=now() where id=v_wop.id;
  perform public.parts_reconcile_work_order_part(v_wop.id);
  return jsonb_build_object('ok', true, 'idempotent', false, 'work_order_part_id', v_wop.id, 'stock_move_id', v_move_id, 'received_qty', v_received_total, 'on_hand_after', public.parts_on_hand(v_wop.shop_id, v_wop.part_id, p_location_id));
end $$;

create or replace function public.parts_issue_work_order_part(p_work_order_part_id uuid, p_location_id uuid, p_qty numeric, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_wop public.work_order_parts%rowtype; v_existing public.stock_moves%rowtype; v_alloc public.work_order_part_allocations%rowtype; v_move_id uuid; v_item_id uuid;
begin
  if p_qty <= 0 then raise exception 'Issue quantity must be greater than 0.'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency_key is required.'; end if;
  select * into v_wop from public.work_order_parts where id=p_work_order_part_id for update;
  if not found then raise exception 'Work-order part not found.'; end if;
  select * into v_existing from public.stock_moves where shop_id=v_wop.shop_id and idempotency_key=p_idempotency_key;
  if found then return coalesce(v_existing.metadata,'{}'::jsonb) || jsonb_build_object('ok', true, 'idempotent', true, 'stock_move_id', v_existing.id); end if;
  if coalesce(v_wop.quantity_allocated,0) < p_qty then raise exception 'Cannot issue more than allocated quantity.'; end if;
  if public.parts_on_hand(v_wop.shop_id, v_wop.part_id, p_location_id) < p_qty then raise exception 'Cannot issue more than on-hand quantity.'; end if;
  select * into v_alloc from public.work_order_part_allocations where work_order_part_id=v_wop.id and location_id=p_location_id for update;
  if not found or v_alloc.qty < p_qty then raise exception 'Allocation not found or insufficient for issue.'; end if;
  v_item_id := v_wop.source_parts_request_item_id;
  insert into public.stock_moves(part_id, location_id, qty_change, reason, reference_kind, reference_id, created_by, shop_id, idempotency_key, work_order_part_id, part_request_item_id, metadata, lifecycle_quantity)
  values (v_wop.part_id, p_location_id, -p_qty, 'consume', 'work_order_part', v_wop.id, auth.uid(), v_wop.shop_id, p_idempotency_key, v_wop.id, v_item_id, jsonb_build_object('qty_issued', p_qty, 'operation', 'issue'), p_qty) returning id into v_move_id;
  update public.work_order_part_allocations set qty=qty-p_qty, stock_move_id=v_move_id where id=v_alloc.id;
  delete from public.work_order_part_allocations where id=v_alloc.id and qty<=0;
  update public.work_order_parts set quantity_allocated=greatest(coalesce(quantity_allocated,0)-p_qty,0), quantity_consumed=coalesce(quantity_consumed,0)+p_qty, updated_at=now() where id=v_wop.id;
  update public.part_request_items set qty_reserved=greatest(coalesce(qty_reserved,0)-p_qty,0), qty_consumed=coalesce(qty_consumed,0)+p_qty, status='consumed', updated_at=now() where id=v_item_id;
  perform public.parts_reconcile_work_order_part(v_wop.id);
  return jsonb_build_object('ok', true, 'idempotent', false, 'work_order_part_id', v_wop.id, 'stock_move_id', v_move_id, 'issued_qty', p_qty, 'on_hand_after', public.parts_on_hand(v_wop.shop_id, v_wop.part_id, p_location_id));
end $$;

create or replace function public.parts_return_to_stock(p_work_order_part_id uuid, p_location_id uuid, p_qty numeric, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_wop public.work_order_parts%rowtype; v_existing public.stock_moves%rowtype; v_move_id uuid;
begin
  if p_qty <= 0 then raise exception 'Return quantity must be greater than 0.'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency_key is required.'; end if;
  select * into v_wop from public.work_order_parts where id=p_work_order_part_id for update;
  if not found then raise exception 'Work-order part not found.'; end if;
  select * into v_existing from public.stock_moves where shop_id=v_wop.shop_id and idempotency_key=p_idempotency_key;
  if found then return coalesce(v_existing.metadata,'{}'::jsonb) || jsonb_build_object('ok', true, 'idempotent', true, 'stock_move_id', v_existing.id); end if;
  if coalesce(v_wop.quantity_consumed,0) - coalesce(v_wop.quantity_returned,0) < p_qty then raise exception 'Cannot return more than issued and unreturned quantity.'; end if;
  insert into public.stock_moves(part_id, location_id, qty_change, reason, reference_kind, reference_id, created_by, shop_id, idempotency_key, work_order_part_id, part_request_item_id, metadata, lifecycle_quantity)
  values (v_wop.part_id, p_location_id, p_qty, 'return', 'work_order_part', v_wop.id, auth.uid(), v_wop.shop_id, p_idempotency_key, v_wop.id, v_wop.source_parts_request_item_id, jsonb_build_object('qty_returned', p_qty, 'operation', 'return_to_stock'), p_qty) returning id into v_move_id;
  update public.work_order_parts set quantity_returned=coalesce(quantity_returned,0)+p_qty, updated_at=now() where id=v_wop.id;
  perform public.parts_reconcile_work_order_part(v_wop.id);
  return jsonb_build_object('ok', true, 'idempotent', false, 'work_order_part_id', v_wop.id, 'stock_move_id', v_move_id, 'returned_qty', p_qty, 'on_hand_after', public.parts_on_hand(v_wop.shop_id, v_wop.part_id, p_location_id));
end $$;

create or replace function public.parts_cancel_request_item(p_request_item_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_wop public.work_order_parts%rowtype; v_alloc record; v_cancel numeric; v_key text; v_released numeric := 0;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency_key is required.'; end if;
  select * into v_wop from public.work_order_parts where source_parts_request_item_id=p_request_item_id for update;
  if not found then raise exception 'Work-order part not found.'; end if;
  for v_alloc in select * from public.work_order_part_allocations where work_order_part_id=v_wop.id for update loop
    v_key := p_idempotency_key || ':release:' || v_alloc.id::text;
    perform public.parts_release_allocation(p_request_item_id, v_alloc.location_id, v_alloc.qty, v_key);
    v_released := v_released + v_alloc.qty;
  end loop;
  v_cancel := greatest(coalesce(v_wop.quantity_requested,0)-coalesce(v_wop.quantity_consumed,0)-coalesce(v_wop.quantity_returned,0),0);
  update public.work_order_parts set quantity_cancelled = greatest(quantity_cancelled, v_cancel), lifecycle_status = case when quantity_consumed > 0 then lifecycle_status else 'cancelled' end, updated_at=now() where id=v_wop.id;
  update public.part_request_items set status='cancelled', updated_at=now() where id=p_request_item_id;
  return jsonb_build_object('ok', true, 'work_order_part_id', v_wop.id, 'released_qty', v_released, 'cancelled_qty', v_cancel);
end $$;

create or replace function public.parts_replace_request_item(p_request_item_id uuid, p_new_part_id uuid, p_location_id uuid, p_qty numeric, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old public.work_order_parts%rowtype; v_part public.parts%rowtype; v_item public.part_request_items%rowtype; v_result jsonb; v_had_old boolean := false;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency_key is required.'; end if;
  select * into v_item from public.part_request_items where id=p_request_item_id for update;
  if not found then raise exception 'Request item not found.'; end if;
  select * into v_part from public.parts where id=p_new_part_id;
  if not found or v_part.shop_id is distinct from v_item.shop_id then raise exception 'Replacement part is not available for this shop.'; end if;
  select * into v_old from public.work_order_parts where source_parts_request_item_id=p_request_item_id for update;
  v_had_old := found;
  if v_had_old then
    perform public.parts_cancel_request_item(p_request_item_id, p_idempotency_key || ':cancel-old');
    update public.work_order_parts set lifecycle_status='replaced', is_active=false, updated_at=now() where id=v_old.id and quantity_consumed = 0;
  end if;
  update public.part_request_items set part_id=p_new_part_id, status='requested', qty_reserved=0, updated_at=now() where id=p_request_item_id;
  -- Create a fresh active work_order_parts row; do not rewrite old snapshots.
  v_result := public.parts_allocate_request_item(p_request_item_id, p_location_id, p_qty, p_idempotency_key || ':allocate-new');
  update public.work_order_parts set replaced_from_work_order_part_id = case when v_had_old then v_old.id else null end where source_parts_request_item_id=p_request_item_id and is_active;
  if v_had_old then update public.work_order_parts set replaced_by_work_order_part_id = (select id from public.work_order_parts where source_parts_request_item_id=p_request_item_id and is_active limit 1) where id=v_old.id; end if;
  return v_result || jsonb_build_object('ok', true, 'replaced_part_id', case when v_had_old then v_old.part_id else null end, 'new_part_id', p_new_part_id);
end $$;

-- Compatibility wrapper: allocation now reserves only and does not reduce physical on-hand.
create or replace function public.upsert_part_allocation_from_request_item(p_request_item_id uuid, p_location_id uuid, p_create_stock_move boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item public.part_request_items%rowtype; v_qty numeric; v_key text;
begin
  select * into v_item from public.part_request_items where id=p_request_item_id;
  if not found then raise exception 'Request item not found.'; end if;
  v_qty := coalesce(v_item.qty_reserved,0);
  if v_qty <= 0 then v_qty := coalesce(v_item.qty_requested, v_item.qty,0); end if;
  v_key := 'allocate-request-item:'||p_request_item_id::text||':'||p_location_id::text||':'||v_qty::text;
  if p_create_stock_move then
    return public.parts_allocate_request_item(p_request_item_id, p_location_id, v_qty, v_key);
  end if;
  perform public.parts_ensure_work_order_part(p_request_item_id);
  return jsonb_build_object('ok', true, 'allocated', false);
end $$;

-- Compatibility wrapper: existing receiving endpoint now receives through canonical lifecycle command.
create or replace function public.receive_part_request_item(p_item_id uuid, p_location_id uuid, p_qty numeric, p_po_id uuid default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_line_id uuid; v_key text;
begin
  select pol.id into v_line_id
  from public.purchase_order_lines pol
  where pol.part_request_item_id = p_item_id and (p_po_id is null or pol.po_id = p_po_id) and pol.received_qty < pol.qty
  order by pol.created_at asc
  limit 1;
  v_key := coalesce(nullif(trim(p_idempotency_key),''), 'receive-request-item:'||p_item_id::text||':'||coalesce(v_line_id::text, 'direct')||':'||p_location_id::text||':'||p_qty::text);
  return public.parts_receive_request_item(p_item_id, p_location_id, p_qty, v_line_id, null, v_key);
end $$;


-- Security hardening: lifecycle RPCs are callable by authenticated users only;
-- each SECURITY DEFINER function validates shop/work-order scope internally and
-- API routes additionally require canManageWorkOrders.
revoke all on function public.parts_attach_request_item(uuid) from public, anon;
revoke all on function public.parts_ensure_work_order_part(uuid) from public, anon;
revoke all on function public.parts_allocate_request_item(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.parts_release_allocation(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.parts_create_po_line_for_request(uuid, uuid, numeric, numeric, uuid, text) from public, anon;
revoke all on function public.parts_receive_request_item(uuid, uuid, numeric, uuid, numeric, text) from public, anon;
revoke all on function public.parts_issue_work_order_part(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.parts_return_to_stock(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.parts_cancel_request_item(uuid, text) from public, anon;
revoke all on function public.parts_replace_request_item(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.parts_attach_request_item(uuid) to authenticated, service_role;
grant execute on function public.parts_ensure_work_order_part(uuid) to authenticated, service_role;
grant execute on function public.parts_allocate_request_item(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.parts_release_allocation(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.parts_create_po_line_for_request(uuid, uuid, numeric, numeric, uuid, text) to authenticated, service_role;
grant execute on function public.parts_receive_request_item(uuid, uuid, numeric, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.parts_issue_work_order_part(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.parts_return_to_stock(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.parts_cancel_request_item(uuid, text) to authenticated, service_role;
grant execute on function public.parts_replace_request_item(uuid, uuid, uuid, numeric, text) to authenticated, service_role;
