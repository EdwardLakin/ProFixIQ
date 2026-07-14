begin;

alter table public.purchase_order_lines
  add column if not exists cancelled_qty numeric(12,2) not null default 0;

alter table public.purchase_order_lines
  drop constraint if exists purchase_order_lines_cancelled_qty_phase3;
alter table public.purchase_order_lines
  add constraint purchase_order_lines_cancelled_qty_phase3 check (
    coalesce(cancelled_qty, 0) >= 0
    and coalesce(cancelled_qty, 0) <= greatest(coalesce(qty, 0) - coalesce(received_qty, 0), 0)
  ) not valid;

create table if not exists public.parts_disposition_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete restrict,
  work_order_part_id uuid references public.work_order_parts(id) on delete restrict,
  part_request_item_id uuid references public.part_request_items(id) on delete set null,
  disposition_kind text not null check (
    disposition_kind in (
      'allocation_released',
      'open_order_cancelled',
      'received_retained_for_inventory',
      'consumed_returned_to_stock',
      'consumed_kept_internal',
      'consumed_scrapped',
      'line_voided'
    )
  ),
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  operation_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, operation_key)
);

create index if not exists parts_disposition_events_line_idx
  on public.parts_disposition_events(shop_id, work_order_line_id, created_at);

alter table public.parts_disposition_events enable row level security;
create policy parts_disposition_events_shop_select
  on public.parts_disposition_events
  for select
  to authenticated
  using (
    shop_id = nullif(current_setting('app.current_shop_id', true), '')::uuid
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.shop_id = parts_disposition_events.shop_id
    )
  );

create or replace function public.parts_void_work_order_line_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_mode text,
  p_reserved_disposition text,
  p_ordered_disposition text,
  p_received_disposition text,
  p_consumed_disposition text,
  p_reason text,
  p_note text,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_operation public.parts_operation_keys;
  v_wop public.work_order_parts%rowtype;
  v_alloc public.work_order_part_allocations%rowtype;
  v_po_line public.purchase_order_lines%rowtype;
  v_location record;
  v_open_order numeric;
  v_net_consumed numeric;
  v_remaining numeric;
  v_item_id uuid;
  v_part_count integer := 0;
  v_released numeric := 0;
  v_returned numeric := 0;
  v_cancelled_order numeric := 0;
  v_hard_delete boolean := false;
  v_result jsonb;
begin
  if p_mode not in ('delete', 'void') then raise exception 'Invalid line removal mode.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A line removal reason is required.'; end if;
  if p_reserved_disposition <> 'release' then raise exception 'Reserved parts must be released.'; end if;
  if p_ordered_disposition not in ('cancel_open_order', 'retain_open_order') then
    raise exception 'Invalid ordered-parts disposition.';
  end if;
  if p_received_disposition not in ('retain_for_other_work', 'return_to_vendor') then
    raise exception 'Invalid received-parts disposition.';
  end if;
  if p_consumed_disposition not in ('return_to_stock', 'keep_consumed', 'scrap') then
    raise exception 'Invalid consumed-parts disposition.';
  end if;
  if p_received_disposition = 'return_to_vendor' then
    raise exception 'Vendor return requires the canonical vendor-return command before line void.';
  end if;

  v_operation := public.parts_begin_operation(
    p_shop_id,
    p_operation_key,
    'void_work_order_line',
    'work_order_line',
    p_work_order_line_id,
    p_actor_user_id
  );
  if v_operation.completed_at is not null then
    return coalesce(v_operation.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  select * into v_line from public.work_order_lines
  where id = p_work_order_line_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Work-order line not found for shop.'; end if;
  if v_line.voided_at is not null then
    return public.parts_complete_operation(
      v_operation.id,
      jsonb_build_object('ok', true, 'idempotent', true, 'mode', 'voided')
    );
  end if;

  perform 1 from public.work_orders
  where id = v_line.work_order_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Work order not found for shop.'; end if;
  perform public.parts_assert_work_order_mutable(p_shop_id, v_line.work_order_id);

  -- Lock the complete line parts graph before calculating any disposition.
  perform 1 from public.work_order_parts
  where work_order_line_id = p_work_order_line_id and shop_id = p_shop_id
  order by id
  for update;
  perform 1 from public.work_order_part_allocations
  where work_order_line_id = p_work_order_line_id and shop_id = p_shop_id
  order by id
  for update;
  perform 1 from public.part_request_items
  where work_order_line_id = p_work_order_line_id and shop_id = p_shop_id
  order by id
  for update;
  perform 1 from public.purchase_order_lines pol
  where pol.work_order_part_id in (
    select id from public.work_order_parts
    where work_order_line_id = p_work_order_line_id and shop_id = p_shop_id
  )
  order by pol.id
  for update;

  select count(*) into v_part_count
  from public.work_order_parts
  where work_order_line_id = p_work_order_line_id and shop_id = p_shop_id and is_active;

  v_hard_delete := p_mode = 'delete'
    and v_part_count = 0
    and lower(coalesce(v_line.status::text, '')) not in ('completed', 'ready_to_invoice', 'invoiced');

  if v_hard_delete then
    delete from public.work_order_lines
    where id = p_work_order_line_id and shop_id = p_shop_id;
    return public.parts_complete_operation(
      v_operation.id,
      jsonb_build_object('ok', true, 'idempotent', false, 'mode', 'deleted')
    );
  end if;

  for v_wop in
    select * from public.work_order_parts
    where work_order_line_id = p_work_order_line_id and shop_id = p_shop_id and is_active
    order by id
  loop
    v_item_id := v_wop.source_parts_request_item_id;

    for v_alloc in
      select * from public.work_order_part_allocations
      where work_order_part_id = v_wop.id
      order by id
    loop
      if coalesce(v_alloc.qty, 0) > 0 then
        perform public.parts_release_allocation(
          v_item_id,
          v_alloc.location_id,
          v_alloc.qty,
          p_operation_key || ':release:' || v_alloc.id::text
        );
        v_released := v_released + v_alloc.qty;
        insert into public.parts_disposition_events(
          shop_id, work_order_id, work_order_line_id, work_order_part_id,
          part_request_item_id, disposition_kind, quantity, operation_key,
          actor_user_id, reason, metadata
        ) values (
          p_shop_id, v_line.work_order_id, p_work_order_line_id, v_wop.id,
          v_item_id, 'allocation_released', v_alloc.qty,
          p_operation_key || ':event:release:' || v_alloc.id::text,
          p_actor_user_id, trim(p_reason), jsonb_build_object('location_id', v_alloc.location_id)
        ) on conflict do nothing;
      end if;
    end loop;

    for v_po_line in
      select * from public.purchase_order_lines
      where work_order_part_id = v_wop.id
      order by id
    loop
      v_open_order := greatest(
        coalesce(v_po_line.qty, 0)
          - coalesce(v_po_line.received_qty, 0)
          - coalesce(v_po_line.cancelled_qty, 0),
        0
      );
      if v_open_order > 0 then
        if p_ordered_disposition = 'retain_open_order' then
          raise exception 'Open purchase-order quantity must be cancelled before line void.';
        end if;
        update public.purchase_order_lines
        set cancelled_qty = coalesce(cancelled_qty, 0) + v_open_order
        where id = v_po_line.id;
        v_cancelled_order := v_cancelled_order + v_open_order;
        insert into public.parts_disposition_events(
          shop_id, work_order_id, work_order_line_id, work_order_part_id,
          part_request_item_id, disposition_kind, quantity, operation_key,
          actor_user_id, reason, metadata
        ) values (
          p_shop_id, v_line.work_order_id, p_work_order_line_id, v_wop.id,
          v_item_id, 'open_order_cancelled', v_open_order,
          p_operation_key || ':event:po-cancel:' || v_po_line.id::text,
          p_actor_user_id, trim(p_reason), jsonb_build_object('purchase_order_line_id', v_po_line.id)
        ) on conflict do nothing;
      end if;
    end loop;

    v_net_consumed := greatest(
      coalesce(v_wop.quantity_consumed, 0) - coalesce(v_wop.quantity_returned, 0),
      0
    );

    if v_net_consumed > 0 and p_consumed_disposition = 'return_to_stock' then
      for v_location in
        with issued as (
          select location_id, coalesce(sum(lifecycle_quantity), 0) as qty
          from public.stock_moves
          where work_order_part_id = v_wop.id and reason = 'consume'
          group by location_id
        ), returned as (
          select location_id, coalesce(sum(lifecycle_quantity), 0) as qty
          from public.stock_moves
          where work_order_part_id = v_wop.id and reason = 'return'
          group by location_id
        )
        select issued.location_id,
               greatest(issued.qty - coalesce(returned.qty, 0), 0) as qty
        from issued
        left join returned using (location_id)
        where greatest(issued.qty - coalesce(returned.qty, 0), 0) > 0
        order by issued.location_id
      loop
        perform public.parts_return_to_stock(
          v_wop.id,
          v_location.location_id,
          v_location.qty,
          p_operation_key || ':return:' || v_wop.id::text || ':' || v_location.location_id::text
        );
        v_returned := v_returned + v_location.qty;
      end loop;
      insert into public.parts_disposition_events(
        shop_id, work_order_id, work_order_line_id, work_order_part_id,
        part_request_item_id, disposition_kind, quantity, operation_key,
        actor_user_id, reason
      ) values (
        p_shop_id, v_line.work_order_id, p_work_order_line_id, v_wop.id,
        v_item_id, 'consumed_returned_to_stock', v_net_consumed,
        p_operation_key || ':event:return:' || v_wop.id::text,
        p_actor_user_id, trim(p_reason)
      ) on conflict do nothing;
    elsif v_net_consumed > 0 then
      insert into public.parts_disposition_events(
        shop_id, work_order_id, work_order_line_id, work_order_part_id,
        part_request_item_id, disposition_kind, quantity, operation_key,
        actor_user_id, reason
      ) values (
        p_shop_id, v_line.work_order_id, p_work_order_line_id, v_wop.id,
        v_item_id,
        case when p_consumed_disposition = 'scrap' then 'consumed_scrapped' else 'consumed_kept_internal' end,
        v_net_consumed,
        p_operation_key || ':event:consumed:' || v_wop.id::text,
        p_actor_user_id, trim(p_reason)
      ) on conflict do nothing;
    end if;

    if coalesce(v_wop.quantity_received, 0) > coalesce(v_wop.quantity_consumed, 0) then
      insert into public.parts_disposition_events(
        shop_id, work_order_id, work_order_line_id, work_order_part_id,
        part_request_item_id, disposition_kind, quantity, operation_key,
        actor_user_id, reason
      ) values (
        p_shop_id, v_line.work_order_id, p_work_order_line_id, v_wop.id,
        v_item_id, 'received_retained_for_inventory',
        greatest(coalesce(v_wop.quantity_received, 0) - coalesce(v_wop.quantity_consumed, 0), 0),
        p_operation_key || ':event:received:' || v_wop.id::text,
        p_actor_user_id, trim(p_reason)
      ) on conflict do nothing;
    end if;

    v_remaining := greatest(
      coalesce(v_wop.quantity_requested, 0)
        - coalesce(v_wop.quantity_consumed, 0)
        - coalesce(v_wop.quantity_cancelled, 0),
      0
    );
    update public.work_order_parts
    set quantity_cancelled = coalesce(quantity_cancelled, 0) + v_remaining,
        is_active = false,
        updated_at = now()
    where id = v_wop.id;
    perform public.parts_reconcile_work_order_part(v_wop.id);

    if v_item_id is not null then
      update public.part_request_items
      set status = 'cancelled', updated_at = now()
      where id = v_item_id;
    end if;
  end loop;

  update public.work_order_lines
  set voided_at = now(),
      voided_by = p_actor_user_id,
      void_reason = trim(p_reason),
      void_note = nullif(trim(p_note), '')
  where id = p_work_order_line_id and shop_id = p_shop_id;

  insert into public.parts_disposition_events(
    shop_id, work_order_id, work_order_line_id, disposition_kind,
    quantity, operation_key, actor_user_id, reason, metadata
  ) values (
    p_shop_id, v_line.work_order_id, p_work_order_line_id, 'line_voided',
    0, p_operation_key || ':event:line', p_actor_user_id, trim(p_reason),
    jsonb_build_object(
      'reserved_disposition', p_reserved_disposition,
      'ordered_disposition', p_ordered_disposition,
      'received_disposition', p_received_disposition,
      'consumed_disposition', p_consumed_disposition,
      'released_qty', v_released,
      'returned_qty', v_returned,
      'cancelled_order_qty', v_cancelled_order
    )
  ) on conflict do nothing;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'mode', 'voided',
    'workOrderLineId', p_work_order_line_id,
    'releasedQty', v_released,
    'returnedQty', v_returned,
    'cancelledOrderQty', v_cancelled_order
  );
  return public.parts_complete_operation(v_operation.id, v_result);
end;
$$;

revoke all on function public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid) from public;
grant execute on function public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
