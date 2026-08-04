-- Make purchase-order receiving atomic and retry-safe.
--
-- The legacy four-argument RPC used the PO id as the stock-move reference.
-- Repeated partial receipts therefore reused one inventory ledger row while
-- independently advancing purchase_order_lines.received_qty.
--
-- New callers supply a stable operation id. The operation id is bound to the
-- PO in reference_kind, so retries return the prior result while separate
-- partial receipts create separate stock moves.
--
-- apply_stock_move already maintains part_stock. The legacy AFTER INSERT
-- snapshot trigger performs the same increment a second time.
drop trigger if exists trg_stock_moves_apply_snapshot on public.stock_moves;

drop function if exists public.receive_po_part_and_allocate(uuid, uuid, uuid, numeric);

create function public.receive_po_part_and_allocate(
  p_po_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_operation_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid;
  v_shop_id uuid;
  v_ref_kind text;

  v_move public.stock_moves%rowtype;
  v_result jsonb;

  v_po_remaining numeric;
  v_remaining numeric;
  v_po_closed boolean := false;
  v_po_status text;

  v_item record;
  v_item_target numeric;
  v_item_received numeric;
  v_need numeric;
  v_take numeric;

  v_alloc jsonb := '[]'::jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Not authenticated';
  end if;

  if p_po_id is null then
    raise exception using errcode = '22023', message = 'p_po_id is required';
  end if;
  if p_part_id is null then
    raise exception using errcode = '22023', message = 'p_part_id is required';
  end if;
  if p_location_id is null then
    raise exception using errcode = '22023', message = 'p_location_id is required';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'p_operation_id is required';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = '22023', message = 'p_qty must be a finite number greater than 0';
  end if;

  -- Serialise receives for a PO before checking the operation ledger or
  -- calculating remaining quantities.
  select po.shop_id, po.status::text
    into v_shop_id, v_po_status
  from public.purchase_orders po
  where po.id = p_po_id
  for update;

  if v_shop_id is null then
    raise exception using errcode = 'P0002', message = 'Purchase order not found';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where (p.user_id = v_uid or p.id = v_uid)
      and p.shop_id = v_shop_id
      and lower(coalesce(p.role, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service',
        'lead_hand', 'foreman', 'mechanic', 'parts'
      )
  ) then
    raise exception using errcode = '42501', message = 'Not allowed';
  end if;

  if not exists (
    select 1
    from public.parts part
    where part.id = p_part_id
      and part.shop_id = v_shop_id
  ) then
    raise exception using errcode = '42501', message = 'Part does not belong to purchase-order shop';
  end if;

  if not exists (
    select 1
    from public.stock_locations location
    where location.id = p_location_id
      and location.shop_id = v_shop_id
  ) then
    raise exception using errcode = '42501', message = 'Location does not belong to purchase-order shop';
  end if;

  v_ref_kind := 'purchase_order_receipt:' || p_po_id::text;

  -- A replay of the same action must not advance PO lines or allocations again.
  select move.*
    into v_move
  from public.stock_moves move
  where move.shop_id = v_shop_id
    and move.reference_kind = v_ref_kind
    and move.reference_id = p_operation_id
  for update;

  if found then
    if v_move.part_id is distinct from p_part_id
       or v_move.location_id is distinct from p_location_id
       or v_move.qty_change is distinct from p_qty
       or v_move.reason::text is distinct from 'receive' then
      raise exception using
        errcode = '22023',
        message = 'PO_RECEIVE_IDEMPOTENCY_CONFLICT';
    end if;

    v_result := v_move.metadata -> 'receipt_result';
    if v_result is not null then
      return v_result || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'move_id', v_move.id,
      'po_id', p_po_id,
      'po_closed', v_po_status = 'received',
      'po_status', v_po_status,
      'part_id', p_part_id,
      'qty_received_total', p_qty,
      'allocations', '[]'::jsonb,
      'unallocated_qty', p_qty
    );
  end if;

  -- Lock all matching lines before calculating and applying the receipt.
  perform 1
  from public.purchase_order_lines line
  where line.po_id = p_po_id
    and line.part_id = p_part_id
  order by line.created_at asc, line.id asc
  for update;

  select coalesce(
      sum(greatest(coalesce(line.qty, 0) - coalesce(line.received_qty, 0), 0)),
      0
    )
    into v_po_remaining
  from public.purchase_order_lines line
  where line.po_id = p_po_id
    and line.part_id = p_part_id;

  if v_po_remaining <= 0 then
    raise exception using
      errcode = '22023',
      message = 'PO_PART_FULLY_RECEIVED';
  end if;

  if p_qty > v_po_remaining then
    raise exception using
      errcode = '22023',
      message = format(
        'PO_RECEIVE_QUANTITY_EXCEEDS_REMAINING requested=%s remaining=%s',
        p_qty,
        v_po_remaining
      );
  end if;

  select *
    into v_move
  from public.apply_stock_move(
    p_part => p_part_id,
    p_loc => p_location_id,
    p_qty => p_qty,
    p_reason => 'receive',
    p_ref_kind => v_ref_kind,
    p_ref_id => p_operation_id
  );

  -- Advance PO lines FIFO by exactly the quantity recorded in the stock ledger.
  v_remaining := p_qty;

  for v_item in
    select line.id, line.qty, line.received_qty
    from public.purchase_order_lines line
    where line.po_id = p_po_id
      and line.part_id = p_part_id
    order by line.created_at asc, line.id asc
    for update
  loop
    exit when v_remaining <= 0;

    v_need := greatest(coalesce(v_item.qty, 0) - coalesce(v_item.received_qty, 0), 0);
    v_take := least(v_remaining, v_need);

    if v_take > 0 then
      update public.purchase_order_lines
      set received_qty = coalesce(received_qty, 0) + v_take
      where id = v_item.id;

      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  if v_remaining <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PO_RECEIVE_LINE_RECONCILIATION_FAILED';
  end if;

  if exists (
    select 1
    from public.purchase_order_lines line
    where line.po_id = p_po_id
      and coalesce(line.received_qty, 0) < coalesce(line.qty, 0)
  ) then
    v_po_closed := false;
  else
    update public.purchase_orders
    set status = 'received'
    where id = p_po_id;

    v_po_closed := true;
  end if;

  select po.status::text
    into v_po_status
  from public.purchase_orders po
  where po.id = p_po_id;

  -- Allocate the newly received quantity to matching request items FIFO.
  v_remaining := p_qty;

  for v_item in
    select
      item.id,
      item.status,
      item.qty,
      item.qty_requested,
      item.qty_approved,
      item.qty_received
    from public.part_request_items item
    where item.shop_id = v_shop_id
      and item.part_id = p_part_id
      and item.status in (
        'approved', 'reserved', 'ordered', 'picking',
        'picked', 'partially_received'
      )
      and greatest(
        coalesce(item.qty_approved, 0),
        coalesce(item.qty_requested, 0),
        coalesce(item.qty, 0),
        0
      ) > greatest(coalesce(item.qty_received, 0), 0)
    order by item.created_at asc, item.id asc
    for update
  loop
    exit when v_remaining <= 0;

    v_item_target := greatest(
      coalesce(v_item.qty_approved, 0),
      coalesce(v_item.qty_requested, 0),
      coalesce(v_item.qty, 0),
      0
    );
    v_item_received := greatest(coalesce(v_item.qty_received, 0), 0);
    v_need := greatest(v_item_target - v_item_received, 0);
    v_take := least(v_remaining, v_need);

    if v_take > 0 then
      update public.part_request_items
      set
        qty_received = v_item_received + v_take,
        status = case
          when (v_item_received + v_take) >= v_item_target
            then 'received'::public.part_request_item_status
          else 'partially_received'::public.part_request_item_status
        end
      where id = v_item.id;

      v_alloc := v_alloc || jsonb_build_object(
        'request_item_id', v_item.id,
        'qty_allocated', v_take,
        'status', case
          when (v_item_received + v_take) >= v_item_target then 'received'
          else 'partially_received'
        end
      );

      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'move_id', v_move.id,
    'po_id', p_po_id,
    'po_closed', v_po_closed,
    'po_status', v_po_status,
    'part_id', p_part_id,
    'qty_received_total', p_qty,
    'allocations', v_alloc,
    'unallocated_qty', greatest(v_remaining, 0)
  );

  update public.stock_moves
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'po_id', p_po_id,
    'operation_id', p_operation_id,
    'receipt_result', v_result
  )
  where id = v_move.id;

  return v_result;
end;
$function$;

-- The default keeps legacy four-argument SQL/PostgREST calls working. Callers
-- that need retry safety supply p_operation_id explicitly.
revoke all on function public.receive_po_part_and_allocate(uuid, uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.receive_po_part_and_allocate(uuid, uuid, uuid, numeric, uuid) to authenticated, service_role;

comment on function public.receive_po_part_and_allocate(uuid, uuid, uuid, numeric, uuid)
is 'Atomically receives a PO part exactly once per operation id, advances PO lines, and allocates matching requests.';
