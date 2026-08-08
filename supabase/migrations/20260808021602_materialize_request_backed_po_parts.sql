begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Preserve the canonical attachment implementation while allowing trusted
-- migration/clean-replay sessions to use the same function as service-role
-- maintenance. Tenant authorization still runs inside the function.
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
  v_wop uuid;
  v_qty numeric;
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
  select id into v_wop from public.work_order_parts where source_parts_request_item_id = p_request_item_id and coalesce(is_active,true) for update;
  if found then return v_wop; end if;
  insert into public.work_order_parts(
    work_order_id, work_order_line_id, shop_id, part_id, quantity, unit_price,
    total_price, source_parts_request_id, source_parts_request_item_id,
    description_snapshot, manufacturer_snapshot, part_number_snapshot,
    quantity_requested, quantity_received, quantity_consumed,
    unit_cost_snapshot, unit_sell_price_snapshot, lifecycle_status,
    updated_at, is_active
  ) values (
    v_line.work_order_id, v_item.work_order_line_id, v_item.shop_id, v_item.part_id,
    v_qty, coalesce(v_item.unit_price, v_item.quoted_price, v_part.price),
    coalesce(v_item.unit_price, v_item.quoted_price, v_part.price, 0) * v_qty,
    v_item.request_id, v_item.id, coalesce(v_part.name, v_item.description),
    coalesce(v_part.supplier, v_item.vendor), v_part.part_number, v_qty,
    coalesce(v_item.qty_received,0), coalesce(v_item.qty_consumed,0),
    coalesce(v_item.unit_cost, v_part.cost),
    coalesce(v_item.unit_price, v_item.quoted_price, v_part.price),
    'requested', now(), true
  ) returning id into v_wop;
  return v_wop;
end;
$$;

-- A request-backed PO line is not an anonymous purchasing expense. Give it a
-- durable catalog identity and work-order-part lineage in the same transaction
-- that creates the line. Generic PO lines (no request item) remain free text.
create or replace function public.parts_materialize_request_po_line_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.part_request_items%rowtype;
  v_part public.parts%rowtype;
  v_work_order_part_id uuid;
begin
  if new.part_request_item_id is null then
    return new;
  end if;

  if auth.uid() is null
     and coalesce(auth.role(), '') = ''
     and session_user = 'postgres' then
    perform set_config('request.jwt.claim.role', 'service_role', true);
  end if;

  select item.*
    into v_item
  from public.part_request_items item
  where item.id = new.part_request_item_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Request item not found for purchase-order line.';
  end if;

  if v_item.part_id is null then
    insert into public.parts (
      shop_id,
      name,
      part_number,
      sku,
      cost,
      default_cost,
      price,
      default_price,
      manufacturer,
      supplier
    ) values (
      v_item.shop_id,
      coalesce(nullif(trim(v_item.description), ''), 'Requested part'),
      nullif(trim(v_item.requested_part_number), ''),
      null,
      new.unit_cost,
      new.unit_cost,
      coalesce(v_item.quoted_price, v_item.unit_price),
      coalesce(v_item.quoted_price, v_item.unit_price),
      nullif(trim(v_item.requested_manufacturer), ''),
      nullif(trim(v_item.vendor), '')
    )
    returning * into v_part;

    perform set_config('app.parts_request_po_materializing', 'on', true);
    update public.part_request_items
    set part_id = v_part.id,
        updated_at = now()
    where id = v_item.id;
    v_item.part_id := v_part.id;
  else
    select part.*
      into v_part
    from public.parts part
    where part.id = v_item.part_id
      and part.shop_id = v_item.shop_id;

    if not found then
      raise exception using
        errcode = '42501',
        message = 'Request item part is outside the request shop.';
    end if;
  end if;

  if new.part_id is not null and new.part_id is distinct from v_item.part_id then
    raise exception using
      errcode = '22023',
      message = 'PARTS_ORDERED_PART_ID_MISMATCH';
  end if;

  v_work_order_part_id := public.parts_ensure_work_order_part(v_item.id);
  new.part_id := v_item.part_id;
  new.work_order_part_id := v_work_order_part_id;
  new.sku := coalesce(new.sku, v_part.sku, v_part.part_number);
  new.description := coalesce(
    nullif(trim(new.description), ''),
    nullif(trim(v_part.name), ''),
    nullif(trim(v_item.description), ''),
    'Requested part'
  );

  return new;
end;
$$;

drop trigger if exists trg_parts_materialize_request_po_line
  on public.purchase_order_lines;
create trigger trg_parts_materialize_request_po_line
before insert on public.purchase_order_lines
for each row
when (new.part_request_item_id is not null)
execute function public.parts_materialize_request_po_line_before_insert();

-- The invariant guard still rejects split request/PO identities from arbitrary
-- writes. The transaction-local flag is set only by the controlled trigger,
-- reconciliation RPC, and this migration's bounded historical repair.
create or replace function public.parts_guard_ordered_request_part_attachment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.part_id is distinct from old.part_id
     and new.part_id is not null
     and coalesce(current_setting('app.parts_request_po_materializing', true), '') <> 'on'
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
      detail = 'Use the atomic request/PO identity reconciliation flow.';
  end if;
  return new;
end;
$$;

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
  if v_item.part_id is not null and v_item.part_id is distinct from p_part_id then
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
  if v_item.part_id is null then
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

revoke all on function public.parts_materialize_request_po_line_before_insert()
  from public, anon, authenticated;
grant execute on function public.parts_materialize_request_po_line_before_insert()
  to service_role;

revoke all on function public.parts_attach_inventory_to_request_item_atomic(uuid, uuid)
  from public, anon;
grant execute on function public.parts_attach_inventory_to_request_item_atomic(uuid, uuid)
  to authenticated, service_role;

-- Repair historical request-backed PO lines created by the former free-text
-- branch. The production preflight found one such received line and confirmed
-- that it has a tenant-scoped stock location. Any unsafe row aborts atomically.
lock table public.purchase_orders in share row exclusive mode;
lock table public.purchase_order_lines in share row exclusive mode;
lock table public.part_request_items in share row exclusive mode;

do $backfill$
declare
  v_row record;
  v_part_id uuid;
  v_work_order_part_id uuid;
  v_move_id uuid;
begin
  if auth.uid() is null
     and coalesce(auth.role(), '') = ''
     and session_user = 'postgres' then
    perform set_config('request.jwt.claim.role', 'service_role', true);
  end if;

  for v_row in
    select
      line.id as line_id,
      line.location_id,
      line.received_qty,
      line.unit_cost,
      item.id as item_id,
      item.shop_id,
      item.description,
      item.requested_part_number,
      item.requested_manufacturer,
      item.vendor,
      item.quoted_price,
      item.unit_price,
      item.part_id
    from public.purchase_order_lines line
    join public.part_request_items item on item.id = line.part_request_item_id
    where item.part_id is null
       or line.part_id is null
       or line.work_order_part_id is null
    order by line.po_id, line.id
    for update of line, item
  loop
    select item.part_id
      into v_part_id
    from public.part_request_items item
    where item.id = v_row.item_id
    for update;

    if v_part_id is null then
      insert into public.parts (
        shop_id, name, part_number, sku, cost, default_cost,
        price, default_price, manufacturer, supplier
      ) values (
        v_row.shop_id,
        coalesce(nullif(trim(v_row.description), ''), 'Requested part'),
        nullif(trim(v_row.requested_part_number), ''),
        null,
        v_row.unit_cost,
        v_row.unit_cost,
        coalesce(v_row.quoted_price, v_row.unit_price),
        coalesce(v_row.quoted_price, v_row.unit_price),
        nullif(trim(v_row.requested_manufacturer), ''),
        nullif(trim(v_row.vendor), '')
      ) returning id into v_part_id;
    end if;

    perform set_config('app.parts_request_po_materializing', 'on', true);
    update public.part_request_items
    set part_id = v_part_id,
        updated_at = now()
    where id = v_row.item_id
      and (part_id is null or part_id = v_part_id);

    v_work_order_part_id := public.parts_ensure_work_order_part(v_row.item_id);

    update public.purchase_order_lines
    set part_id = v_part_id,
        work_order_part_id = v_work_order_part_id
    where id = v_row.line_id;

    if coalesce(v_row.received_qty, 0) > 0 then
      if v_row.location_id is null then
        raise exception using
          errcode = '22023',
          message = 'PARTS_RECEIVED_LINE_LOCATION_REQUIRED';
      end if;

      insert into public.stock_moves (
        shop_id, part_id, location_id, qty_change, reason,
        reference_kind, reference_id, created_by, idempotency_key, metadata,
        lifecycle_quantity, part_request_item_id, purchase_order_line_id,
        work_order_part_id
      ) values (
        v_row.shop_id,
        v_part_id,
        v_row.location_id,
        v_row.received_qty,
        'receive',
        'request_po_identity_materialization',
        v_row.line_id,
        null,
        v_row.shop_id::text || ':request-po-materialize:' || v_row.line_id::text,
        jsonb_build_object('operation', 'request_po_identity_materialization_backfill'),
        v_row.received_qty,
        v_row.item_id,
        v_row.line_id,
        v_work_order_part_id
      )
      on conflict (shop_id, idempotency_key)
        where idempotency_key is not null
      do nothing
      returning id into v_move_id;
      v_move_id := null;
    end if;
  end loop;
end
$backfill$;

notify pgrst, 'reload schema';

commit;
