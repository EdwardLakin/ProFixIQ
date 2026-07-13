-- Parts request lifecycle repair: durable request-item -> work-order-part -> allocation links.

alter table public.work_order_parts
  add column if not exists work_order_line_id uuid,
  add column if not exists source_parts_request_id uuid,
  add column if not exists source_parts_request_item_id uuid,
  add column if not exists description_snapshot text,
  add column if not exists manufacturer_snapshot text,
  add column if not exists part_number_snapshot text,
  add column if not exists quantity_requested numeric(12,2) default 0 not null,
  add column if not exists quantity_ordered numeric(12,2) default 0 not null,
  add column if not exists quantity_received numeric(12,2) default 0 not null,
  add column if not exists quantity_allocated numeric(12,2) default 0 not null,
  add column if not exists quantity_consumed numeric(12,2) default 0 not null,
  add column if not exists quantity_returned numeric(12,2) default 0 not null,
  add column if not exists quantity_cancelled numeric(12,2) default 0 not null,
  add column if not exists unit_cost_snapshot numeric(12,2),
  add column if not exists unit_sell_price_snapshot numeric(12,2),
  add column if not exists lifecycle_status text default 'requested' not null,
  add column if not exists mismatch_acknowledged_at timestamptz,
  add column if not exists mismatch_acknowledged_by uuid,
  add column if not exists mismatch_warning_reason text,
  add column if not exists updated_at timestamptz default now() not null,
  add column if not exists is_active boolean default true not null,
  add column if not exists replaced_from_work_order_part_id uuid,
  add column if not exists replaced_by_work_order_part_id uuid;

alter table public.work_order_part_allocations
  add column if not exists created_at timestamptz default now() not null,
  add column if not exists shop_id uuid,
  add column if not exists work_order_id uuid,
  add column if not exists source_request_item_id uuid,
  add column if not exists work_order_part_id uuid;

update public.work_order_part_allocations a
set work_order_id = wl.work_order_id
from public.work_order_lines wl
where a.work_order_line_id = wl.id and a.work_order_id is null;

update public.work_order_part_allocations a
set shop_id = wo.shop_id
from public.work_orders wo
where a.work_order_id = wo.id and a.shop_id is null;

create index if not exists idx_work_order_parts_source_request_item
  on public.work_order_parts(source_parts_request_item_id)
  where source_parts_request_item_id is not null;

create unique index if not exists uq_work_order_parts_active_source_request_item
  on public.work_order_parts(source_parts_request_item_id)
  where source_parts_request_item_id is not null and is_active;

create index if not exists idx_work_order_parts_replacement_links
  on public.work_order_parts(replaced_from_work_order_part_id, replaced_by_work_order_part_id);

create unique index if not exists uq_wopa_work_order_part_location
  on public.work_order_part_allocations(work_order_part_id, location_id)
  where work_order_part_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_order_parts_source_request_item_id_fkey' and conrelid = 'public.work_order_parts'::regclass) then
    alter table public.work_order_parts add constraint work_order_parts_source_request_item_id_fkey foreign key (source_parts_request_item_id) references public.part_request_items(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_order_parts_source_request_id_fkey' and conrelid = 'public.work_order_parts'::regclass) then
    alter table public.work_order_parts add constraint work_order_parts_source_request_id_fkey foreign key (source_parts_request_id) references public.part_requests(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_order_parts_work_order_line_id_fkey' and conrelid = 'public.work_order_parts'::regclass) then
    alter table public.work_order_parts add constraint work_order_parts_work_order_line_id_fkey foreign key (work_order_line_id) references public.work_order_lines(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_order_part_allocations_work_order_part_id_fkey' and conrelid = 'public.work_order_part_allocations'::regclass) then
    alter table public.work_order_part_allocations add constraint work_order_part_allocations_work_order_part_id_fkey foreign key (work_order_part_id) references public.work_order_parts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_order_part_allocations_source_request_item_id_fkey' and conrelid = 'public.work_order_part_allocations'::regclass) then
    alter table public.work_order_part_allocations add constraint work_order_part_allocations_source_request_item_id_fkey foreign key (source_request_item_id) references public.part_request_items(id) on delete set null;
  end if;
end $$;

create or replace function public.upsert_part_allocation_from_request_item(
  p_request_item_id uuid,
  p_location_id uuid,
  p_create_stock_move boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.part_request_items%rowtype;
  v_request public.part_requests%rowtype;
  v_part public.parts%rowtype;
  v_line record;
  v_qty numeric(12,2);
  v_alloc_id uuid;
  v_move_id uuid;
  v_wop_id uuid;
begin
  select * into v_item from public.part_request_items where id = p_request_item_id for update;
  if not found then raise exception 'Request item not found.'; end if;
  if coalesce(v_item.qty, 0) <= 0 then raise exception 'Quantity must be greater than 0.'; end if;
  if v_item.part_id is null then raise exception 'Request item has no selected inventory part.'; end if;
  if v_item.work_order_line_id is null then raise exception 'Request item must be linked to a work-order line.'; end if;

  select * into v_request from public.part_requests where id = v_item.request_id for update;
  if not found then raise exception 'Parent parts request not found.'; end if;

  select * into v_part from public.parts where id = v_item.part_id for update;
  if not found then raise exception 'Selected part not found.'; end if;
  if v_part.shop_id is distinct from v_item.shop_id then raise exception 'Selected part belongs to a different shop.'; end if;

  select wl.id, wl.work_order_id, wo.shop_id
    into v_line
  from public.work_order_lines wl
  join public.work_orders wo on wo.id = wl.work_order_id
  where wl.id = v_item.work_order_line_id;
  if not found then raise exception 'Work-order line not found.'; end if;
  if v_line.shop_id is distinct from v_item.shop_id then raise exception 'Work-order line belongs to a different shop.'; end if;
  if v_request.work_order_id is not null and v_request.work_order_id <> v_line.work_order_id then
    raise exception 'Work-order line does not belong to the request work order.';
  end if;

  v_qty := case
    when coalesce(v_item.qty_requested, 0) > 0
      then v_item.qty_requested
    when coalesce(v_item.qty, 0) > 0
      then v_item.qty
    else 0
  end;

  insert into public.work_order_parts(
    work_order_id, work_order_line_id, shop_id, part_id, quantity, unit_price, total_price,
    source_parts_request_id, source_parts_request_item_id, description_snapshot, manufacturer_snapshot,
    part_number_snapshot, quantity_requested, quantity_allocated, quantity_received, quantity_consumed,
    unit_cost_snapshot, unit_sell_price_snapshot, lifecycle_status, updated_at
  ) values (
    v_line.work_order_id, v_item.work_order_line_id, v_item.shop_id, v_item.part_id, v_qty,
    coalesce(v_item.unit_price, v_item.quoted_price), coalesce(v_item.unit_price, v_item.quoted_price, 0) * v_qty,
    v_item.request_id, v_item.id, coalesce(v_part.name, v_item.description), coalesce(v_part.supplier, v_item.vendor),
    v_part.part_number, v_qty, 0, coalesce(v_item.qty_received, 0), coalesce(v_item.qty_consumed, 0),
    coalesce(v_item.unit_cost, v_part.cost), coalesce(v_item.unit_price, v_item.quoted_price, v_part.price),
    'requested', now()
  )
  on conflict (source_parts_request_item_id) where source_parts_request_item_id is not null and is_active do update set
    work_order_id = excluded.work_order_id,
    work_order_line_id = excluded.work_order_line_id,
    shop_id = excluded.shop_id,
    part_id = excluded.part_id,
    quantity = excluded.quantity,
    unit_price = coalesce(public.work_order_parts.unit_price, excluded.unit_price),
    total_price = excluded.total_price,
    quantity_requested = excluded.quantity_requested,
    updated_at = now()
  returning id into v_wop_id;

  if p_create_stock_move then
    insert into public.stock_moves(part_id, location_id, qty_change, reason, reference_kind, reference_id, created_by, shop_id)
    values (v_item.part_id, p_location_id, 0, 'wo_allocate', 'work_order_part', v_wop_id, auth.uid(), v_item.shop_id)
    returning id into v_move_id;

    insert into public.work_order_part_allocations(work_order_line_id, work_order_id, shop_id, part_id, location_id, qty, unit_cost, stock_move_id, source_request_item_id, work_order_part_id)
    values (v_item.work_order_line_id, v_line.work_order_id, v_item.shop_id, v_item.part_id, p_location_id, v_qty, coalesce(v_item.unit_cost, v_part.cost, 0), v_move_id, v_item.id, v_wop_id)
    on conflict (work_order_part_id, location_id) where work_order_part_id is not null do update set
      qty = excluded.qty,
      stock_move_id = coalesce(public.work_order_part_allocations.stock_move_id, excluded.stock_move_id),
      work_order_id = excluded.work_order_id,
      shop_id = excluded.shop_id
    returning id into v_alloc_id;

    update public.part_request_items set qty_reserved = v_qty, status = 'reserved', updated_at = now() where id = v_item.id;
    update public.work_order_parts set quantity_allocated = v_qty, lifecycle_status = 'reserved', updated_at = now() where id = v_wop_id;
  else
    update public.part_request_items set status = case when status = 'requested' then 'quoted' else status end, updated_at = now() where id = v_item.id;
  end if;

  return jsonb_build_object('ok', true, 'work_order_part_id', v_wop_id, 'allocation_id', v_alloc_id, 'stock_move_id', v_move_id);
end;
$$;
