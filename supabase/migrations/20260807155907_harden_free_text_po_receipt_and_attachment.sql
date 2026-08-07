begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Never allow an inventory identity to be attached only to the request while
-- an already-linked purchase-order line remains free text. The atomic attach
-- function uses the canonical PO -> line -> request-item lock order, so this
-- trigger remains a final invariant guard for every other update path.
create or replace function public.parts_guard_ordered_request_part_attachment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.part_id is distinct from old.part_id
     and new.part_id is not null
     and exists (
       select 1
       from public.purchase_order_lines line
       where line.part_request_item_id = old.id
         and (
           line.part_id is null
           or line.work_order_part_id is null
         )
     ) then
    raise exception using
      errcode = '55000',
      message = 'PARTS_ORDERED_FREE_TEXT_ATTACH_BLOCKED',
      detail = 'Map the linked purchase-order line through a dedicated reconciliation flow before attaching inventory.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parts_guard_ordered_request_part_attachment
  on public.part_request_items;
create trigger trg_parts_guard_ordered_request_part_attachment
before update of part_id on public.part_request_items
for each row
execute function public.parts_guard_ordered_request_part_attachment();

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
  v_replayed boolean;
begin
  -- Pre-read only to resolve the tenant and linked PO ids. Receipt and ordering
  -- both acquire existing PO/line rows before the request item, so attachment
  -- must use that same order.
  select *
    into v_item
  from public.part_request_items item
  where item.id = p_item_id;

  if not found or v_item.shop_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Request item not found.';
  end if;
  v_item_shop_id := v_item.shop_id;

  perform public.parts_lifecycle_assert_shop_access(v_item_shop_id);
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_item_shop_id
         and (
           profile.id = auth.uid()
           or profile.user_id = auth.uid()
         )
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

  select *
    into v_item
  from public.part_request_items item
  where item.id = p_item_id
  for update;
  if not found
     or v_item.shop_id is distinct from v_item_shop_id then
    raise exception using
      errcode = '42501',
      message = 'Request item tenant changed during attachment.';
  end if;

  select *
    into v_part
  from public.parts part
  where part.id = p_part_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Inventory part not found.';
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
      and (
        line.part_id is null
        or line.work_order_part_id is null
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'PARTS_ORDERED_FREE_TEXT_ATTACH_BLOCKED';
  end if;
  if exists (
    select 1
    from public.purchase_order_lines line
    where line.part_request_item_id = p_item_id
      and line.part_id is distinct from p_part_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'PARTS_ORDERED_PART_ID_MISMATCH';
  end if;
  if v_item.part_id is not null
     and v_item.part_id is distinct from p_part_id then
    raise exception using
      errcode = '22023',
      message = 'PARTS_REQUEST_ALREADY_MAPPED';
  end if;

  v_replayed := v_item.part_id = p_part_id;
  if v_item.part_id is null then
    update public.part_request_items
    set part_id = p_part_id,
        updated_at = now()
    where id = p_item_id
    returning * into v_item;
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', v_replayed,
    'part_id', p_part_id,
    'item', to_jsonb(v_item),
    'part', to_jsonb(v_part)
  );
end;
$$;

create or replace function public.parts_receive_free_text_po_line(
  p_po_id uuid,
  p_po_line_id uuid,
  p_qty numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line public.purchase_order_lines%rowtype;
  v_po public.purchase_orders%rowtype;
  v_item public.part_request_items%rowtype;
  v_request_item_id uuid;
  v_operation public.parts_lifecycle_operations%rowtype;
  v_operation_id uuid;
  v_request_payload jsonb;
  v_line_limit numeric;
  v_line_received numeric;
  v_item_target numeric;
  v_item_received numeric;
  v_status public.part_request_item_status;
  v_po_closed boolean := false;
  v_po_status text;
  v_result jsonb;
begin
  if p_qty is null
     or p_qty <= 0
     or p_qty::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = '22023',
      message = 'Free-text receipt quantity must be greater than zero.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception using
      errcode = '22023',
      message = 'A stable idempotency key is required.';
  end if;
  if length(p_idempotency_key) > 300 then
    raise exception using
      errcode = '22023',
      message = 'Free-text receipt idempotency key is too long.';
  end if;

  -- Match canonical catalog receiving: PO header, then line, then request item.
  -- Ordering uses the same PO-before-item rule, eliminating the prior cycle.
  select *
    into v_po
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase order not found.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_po.shop_id);
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_po.shop_id
         and (
           profile.id = auth.uid()
           or profile.user_id = auth.uid()
         )
         and public.canonical_shop_membership_role(profile.role::text) in (
           'owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman'
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Parts receiving actor is not authorized for this shop.';
  end if;

  select *
    into v_line
  from public.purchase_order_lines line
  where line.id = p_po_line_id
  for update;
  if not found or v_line.po_id is distinct from p_po_id then
    raise exception using
      errcode = '22023',
      message = 'PARTS_FREE_TEXT_RECEIPT_TARGET_MISMATCH';
  end if;

  v_request_item_id := v_line.part_request_item_id;
  if v_request_item_id is not null then
    select *
      into v_item
    from public.part_request_items item
    where item.id = v_request_item_id
    for update;
    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Linked request item not found.';
    end if;
  end if;
  if v_request_item_id is not null
     and v_po.shop_id is distinct from v_item.shop_id then
    raise exception using
      errcode = '42501',
      message = 'PARTS_PO_SHOP_MISMATCH';
  end if;

  v_request_payload := jsonb_build_object(
    'po_id', p_po_id,
    'po_line_id', p_po_line_id,
    'request_item_id', v_request_item_id,
    'qty', p_qty
  );

  select *
    into v_operation
  from public.parts_lifecycle_operations operation
  where operation.shop_id = v_po.shop_id
    and operation.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_operation.operation_type <> 'receive_free_text_po_line'
       or v_operation.part_request_item_id is distinct from v_request_item_id
       or v_operation.result -> '_request' is distinct from v_request_payload then
      raise exception using
        errcode = '22023',
        message = 'PARTS_RECEIPT_IDEMPOTENCY_CONFLICT';
    end if;
    return v_operation.result
      || jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  if v_line.part_id is not null
     or v_line.work_order_part_id is not null
     or (
       v_request_item_id is not null
       and v_item.part_id is not null
     ) then
    raise exception using
      errcode = '55000',
      message = 'PARTS_FREE_TEXT_MAPPING_REQUIRED';
  end if;
  if lower(coalesce(v_po.status, '')) in (
    'received', 'closed', 'cancelled', 'canceled', 'void'
  ) then
    raise exception using
      errcode = '55000',
      message = 'PARTS_PO_NOT_RECEIVABLE';
  end if;
  if v_request_item_id is not null then
    perform public.parts_assert_work_order_mutable(
      v_item.shop_id,
      v_item.work_order_id
    );
  end if;

  v_line_limit := greatest(
    coalesce(v_line.qty, 0) - coalesce(v_line.cancelled_qty, 0),
    0
  );
  v_line_received := coalesce(v_line.received_qty, 0) + p_qty;
  if v_line_received > v_line_limit then
    raise exception using
      errcode = '23514',
      message = 'PARTS_RECEIPT_EXCEEDS_REMAINING';
  end if;

  if v_request_item_id is not null then
    v_item_target := greatest(
      coalesce(v_item.qty_approved, 0),
      coalesce(v_item.qty_requested, 0),
      coalesce(v_item.qty, 0),
      0
    );
    v_item_received := coalesce(v_item.qty_received, 0) + p_qty;
    if v_item_received > v_item_target then
      raise exception using
        errcode = '23514',
        message = 'PARTS_RECEIPT_EXCEEDS_REQUEST_TARGET';
    end if;

    v_status := case
      when v_item_received < v_item_target
        then 'partially_received'::public.part_request_item_status
      else 'received'::public.part_request_item_status
    end;
  end if;

  insert into public.parts_lifecycle_operations(
    shop_id,
    idempotency_key,
    operation_type,
    part_request_item_id,
    result,
    created_by
  ) values (
    v_po.shop_id,
    p_idempotency_key,
    'receive_free_text_po_line',
    v_request_item_id,
    jsonb_build_object('state', 'started', '_request', v_request_payload),
    auth.uid()
  )
  returning id into v_operation_id;

  update public.purchase_order_lines
  set received_qty = v_line_received
  where id = v_line.id;

  if v_request_item_id is not null then
    update public.part_request_items
    set qty_received = v_item_received,
        status = v_status,
        updated_at = now()
    where id = v_request_item_id;
  end if;

  -- The header lock serializes every receiver for this PO. Lock all lines in
  -- canonical order before deriving completion, then mirror the catalog
  -- receiver: partial receipts retain the submitted/partial status and only a
  -- fully received order transitions to received.
  perform 1
  from public.purchase_order_lines line
  where line.po_id = p_po_id
  order by line.created_at, line.id
  for update;

  if exists (
    select 1
    from public.purchase_order_lines line
    where line.po_id = p_po_id
      and coalesce(line.received_qty, 0) < greatest(
        coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0),
        0
      )
  ) then
    v_po_closed := false;
  else
    update public.purchase_orders
    set status = 'received'
    where id = p_po_id;
    v_po_closed := true;
  end if;

  select purchase_order.status::text
    into v_po_status
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'manual_line', true,
    'generic_line', v_request_item_id is null,
    'po_id', p_po_id,
    'po_closed', v_po_closed,
    'po_status', v_po_status,
    'purchase_order_line_id', v_line.id,
    'part_request_item_id', v_request_item_id,
    'receipt_qty', p_qty,
    'line_received_qty', v_line_received,
    'request_received_qty', v_item_received,
    'status', v_status,
    '_request', v_request_payload
  );

  update public.parts_lifecycle_operations
  set result = v_result
  where id = v_operation_id;

  return v_result;
end;
$$;

revoke all on function public.parts_attach_inventory_to_request_item_atomic(
  uuid, uuid
) from public, anon;
grant execute on function public.parts_attach_inventory_to_request_item_atomic(
  uuid, uuid
) to authenticated, service_role;

revoke all on function public.parts_receive_free_text_po_line(
  uuid, uuid, numeric, text
) from public, anon;
grant execute on function public.parts_receive_free_text_po_line(
  uuid, uuid, numeric, text
) to authenticated, service_role;

revoke all on function public.parts_guard_ordered_request_part_attachment()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
