-- The parts-request workbench's "Change Part" action lets a user correct an
-- inventory match on a request line. `parts_attach_inventory_to_request_item_atomic`
-- previously rejected any re-attachment once `part_id` was set at all, via an
-- unconditional PARTS_REQUEST_ALREADY_MAPPED guard — so Change Part could
-- never actually change anything, even for a line that had not yet been
-- ordered or received.
--
-- The PO-line mismatch guard just above it already protects the case that
-- matters (a purchase-order line has committed to a specific part_id).
-- This migration narrows the second guard so a match can only be locked
-- once the line has real order/receive activity against it (qty_ordered or
-- qty_received > 0), and makes the update itself apply whenever the part_id
-- is actually changing rather than only when it was previously null.
create or replace function public.parts_attach_inventory_to_request_item_atomic(
  p_item_id uuid,
  p_part_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.part_request_items%rowtype;
  v_part public.parts%rowtype;
  v_item_shop_id uuid;
  v_work_order_part_id uuid;
  v_replayed boolean;
  v_line public.purchase_order_lines%rowtype;
  v_stock_move_id uuid;
  v_stock_moves jsonb := '[]'::jsonb;
begin
  select item.*
    into v_item
  from public.part_request_items item
  where item.id = p_item_id;

  if not found or v_item.shop_id is null then
    raise exception using errcode = 'P0002', message = 'Request item not found.';
  end if;
  v_item_shop_id := v_item.shop_id;

  perform public.parts_lifecycle_assert_shop_access(v_item_shop_id);
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_item_shop_id
         and (profile.id = auth.uid() or profile.user_id = auth.uid())
         and public.canonical_shop_membership_role(profile.role::text) in (
           'owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman'
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Parts attachment actor is not authorized for this shop.';
  end if;

  perform 1
  from public.purchase_orders purchase_order
  where purchase_order.id in (
    select line.po_id
    from public.purchase_order_lines line
    where line.part_request_item_id = p_item_id
  )
  order by purchase_order.id
  for update;

  perform 1
  from public.purchase_order_lines line
  where line.part_request_item_id = p_item_id
  order by line.po_id, line.id
  for update;

  select item.*
    into v_item
  from public.part_request_items item
  where item.id = p_item_id
  for update;

  if not found or v_item.shop_id is distinct from v_item_shop_id then
    raise exception using
      errcode = '42501',
      message = 'Request item tenant changed during attachment.';
  end if;

  select part.*
    into v_part
  from public.parts part
  where part.id = p_part_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'Inventory part not found.';
  end if;
  if v_part.shop_id is distinct from v_item.shop_id then
    raise exception using
      errcode = '42501',
      message = 'Inventory part belongs to a different shop.';
  end if;

  if exists (
    select 1
    from public.purchase_order_lines line
    where line.part_request_item_id = p_item_id
      and line.part_id is not null
      and line.part_id is distinct from p_part_id
  ) then
    raise exception using errcode = '22023', message = 'PARTS_ORDERED_PART_ID_MISMATCH';
  end if;

  -- Once a part has been ordered or received against this request line, the
  -- match is locked to protect PO/receiving history. Before that point a
  -- user may explicitly correct an inventory match (Change Part) even
  -- though a different part was selected earlier.
  if v_item.part_id is not null
     and v_item.part_id is distinct from p_part_id
     and (coalesce(v_item.qty_ordered, 0) > 0 or coalesce(v_item.qty_received, 0) > 0) then
    raise exception using errcode = '22023', message = 'PARTS_REQUEST_ALREADY_MAPPED';
  end if;

  v_replayed := v_item.part_id = p_part_id
    and not exists (
      select 1
      from public.purchase_order_lines line
      where line.part_request_item_id = p_item_id
        and (line.part_id is null or line.work_order_part_id is null)
    );

  perform set_config('app.parts_request_po_materializing', 'on', true);
  if v_item.part_id is distinct from p_part_id then
    update public.part_request_items
    set part_id = p_part_id,
        updated_at = now()
    where id = p_item_id
    returning * into v_item;
  end if;

  v_work_order_part_id := public.parts_ensure_work_order_part(p_item_id);

  update public.purchase_order_lines line
  set part_id = p_part_id,
      work_order_part_id = v_work_order_part_id,
      sku = coalesce(line.sku, v_part.sku, v_part.part_number),
      description = coalesce(nullif(trim(line.description), ''), v_part.name)
  where line.part_request_item_id = p_item_id
    and (line.part_id is null or line.work_order_part_id is null);

  -- Older free-text receipts advanced quantities without an inventory ledger.
  -- Reconciliation posts exactly one idempotent receipt per historical PO line.
  for v_line in
    select line.*
    from public.purchase_order_lines line
    where line.part_request_item_id = p_item_id
      and coalesce(line.received_qty, 0) > 0
    order by line.po_id, line.id
  loop
    if v_line.location_id is null then
      raise exception using
        errcode = '22023',
        message = 'PARTS_RECEIVED_LINE_LOCATION_REQUIRED';
    end if;

    insert into public.stock_moves (
      shop_id,
      part_id,
      location_id,
      qty_change,
      reason,
      reference_kind,
      reference_id,
      created_by,
      idempotency_key,
      metadata,
      lifecycle_quantity,
      part_request_item_id,
      purchase_order_line_id,
      work_order_part_id
    ) values (
      v_item.shop_id,
      p_part_id,
      v_line.location_id,
      v_line.received_qty,
      'receive',
      'request_po_identity_materialization',
      v_line.id,
      auth.uid(),
      v_item.shop_id::text || ':request-po-materialize:' || v_line.id::text,
      jsonb_build_object('operation', 'request_po_identity_materialization'),
      v_line.received_qty,
      p_item_id,
      v_line.id,
      v_work_order_part_id
    )
    on conflict (shop_id, idempotency_key)
      where idempotency_key is not null
    do nothing
    returning id into v_stock_move_id;

    if v_stock_move_id is not null then
      v_stock_moves := v_stock_moves || jsonb_build_array(v_stock_move_id);
    end if;
    v_stock_move_id := null;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'idempotent', v_replayed,
    'part_id', p_part_id,
    'work_order_part_id', v_work_order_part_id,
    'stock_move_ids', v_stock_moves,
    'item', (select to_jsonb(item) from public.part_request_items item where item.id = p_item_id),
    'part', to_jsonb(v_part)
  );
end;
$$;
