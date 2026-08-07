begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- PO-line unit_cost is an explicit procurement input. Do not reinterpret a
-- valid zero-margin cost merely because it equals customer sell. Only a null
-- input falls back to the part's current cost, then its documented fallback
-- default_cost.
create or replace function private.normalize_purchase_order_line_cost()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_catalog_cost numeric;
begin
  if new.unit_cost is null and new.part_id is not null then
    select coalesce(part.cost, part.default_cost)
      into v_catalog_cost
    from public.parts part
    join public.purchase_orders purchase_order
      on purchase_order.id = new.po_id
     and purchase_order.shop_id = part.shop_id
    where part.id = new.part_id;

    if found then
      new.unit_cost := v_catalog_cost;
    end if;
  end if;

  if new.unit_cost is null then
    new.unit_cost := 0;
  end if;
  if new.unit_cost < 0
     or new.unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = '22023',
      message = 'PO line unit cost must be a finite nonnegative value.';
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_purchase_order_line_cost()
  from public, anon, authenticated;

-- Request-backed ordering has two deliberate identities:
--   * catalog lines keep the inventory/work-order-part lifecycle link;
--   * free-text vendor lines remain explicitly unmapped until Parts chooses to
--     attach or create inventory. Never invent a catalog part during ordering.
create or replace function public.parts_create_po_line_for_request(
  p_po_id uuid,
  p_request_item_id uuid,
  p_qty numeric,
  p_unit_cost numeric default null,
  p_location_id uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.part_request_items%rowtype;
  v_po public.purchase_orders%rowtype;
  v_part public.parts%rowtype;
  v_wop public.work_order_parts%rowtype;
  v_wop_id uuid;
  v_line_id uuid;
  v_existing_line public.purchase_order_lines%rowtype;
  v_existing_po_id uuid;
  v_existing_wop_id uuid;
  v_total_ordered numeric;
  v_target numeric;
  v_remaining numeric;
  v_acquisition_cost numeric;
  v_sell_price numeric;
  v_status public.part_request_item_status;
  v_line_replayed boolean := false;
begin
  if p_qty is null
     or p_qty <= 0
     or p_qty::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = '22023',
      message = 'PO quantity must be greater than zero.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception using
      errcode = '22023',
      message = 'A stable idempotency key is required.';
  end if;
  if length(p_idempotency_key) > 300 then
    raise exception using
      errcode = '22023',
      message = 'PO-line idempotency key is too long.';
  end if;
  if p_unit_cost is not null
     and (
       p_unit_cost < 0
       or p_unit_cost::text in ('NaN', 'Infinity', '-Infinity')
     ) then
    raise exception using
      errcode = '22023',
      message = 'PARTS_ACQUISITION_COST_INVALID';
  end if;

  -- Canonical PO receiving locks the header before any request item. Keep the
  -- same order here so a receiver can never hold the PO while this command
  -- holds the item and waits for that PO.
  select *
    into v_po
  from public.purchase_orders
  where id = p_po_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase order not found.';
  end if;

  select *
    into v_item
  from public.part_request_items
  where id = p_request_item_id
  for update;

  if not found or v_item.shop_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Request item not found or missing shop.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_item.shop_id);
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_item.shop_id
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
      message = 'Parts ordering actor is not authorized for this shop.';
  end if;

  if not public.parts_request_is_operationally_released(v_item.request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_APPROVAL_REQUIRED',
      detail = 'A purchase-order line cannot be created until the linked work is approved.';
  end if;

  if v_item.work_order_id is null
     or v_item.work_order_line_id is null
     or not exists (
       select 1
       from public.work_order_lines line
       where line.id = v_item.work_order_line_id
         and line.work_order_id = v_item.work_order_id
         and line.shop_id = v_item.shop_id
     ) then
    raise exception using
      errcode = '23503',
      message = 'PARTS_REQUEST_WORK_ORDER_ANCHOR_INVALID';
  end if;

  if v_po.shop_id is distinct from v_item.shop_id then
    raise exception using
      errcode = '42501',
      message = 'Purchase order belongs to a different shop.';
  end if;
  if v_po.supplier_id is not null
     and not exists (
       select 1
       from public.suppliers supplier
       where supplier.id = v_po.supplier_id
         and supplier.shop_id = v_item.shop_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Purchase order supplier belongs to a different shop.';
  end if;
  if v_item.vendor_id is not null
     and v_item.vendor_id is distinct from v_po.supplier_id then
    raise exception using
      errcode = '22023',
      message = 'PARTS_REQUEST_VENDOR_MISMATCH';
  end if;

  if p_location_id is not null
     and not exists (
       select 1
       from public.stock_locations location
       where location.id = p_location_id
         and location.shop_id = v_item.shop_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Stock location belongs to a different shop.';
  end if;

  perform public.parts_assert_work_order_mutable(
    v_item.shop_id,
    v_item.work_order_id
  );

  v_target := greatest(
    coalesce(v_item.qty_approved, 0),
    coalesce(v_item.qty_requested, 0),
    coalesce(v_item.qty, 0),
    0
  );
  if v_target <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Approved request quantity must be greater than zero.';
  end if;

  select
    coalesce(sum(
      greatest(coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0)
    ), 0),
    (
      array_agg(line.po_id order by line.created_at, line.id)
      filter (
        where greatest(
          coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0
        ) > 0
      )
    )[1]
  into v_total_ordered, v_existing_po_id
  from public.purchase_order_lines line
  where line.part_request_item_id = p_request_item_id;

  if v_total_ordered > v_target then
    raise exception using
      errcode = '23514',
      message = format(
        'Active ordered quantity %s exceeds approved quantity %s.',
        v_total_ordered,
        v_target
      );
  end if;

  v_status := case
    when v_total_ordered <= 0 then
      'approved'::public.part_request_item_status
    when v_total_ordered < v_target then
      'partially_ordered'::public.part_request_item_status
    else
      'ordered'::public.part_request_item_status
  end;

  -- A retry with a different transport key must observe the already-complete
  -- domain operation instead of creating a second line on another PO.
  if v_total_ordered >= v_target then
    select line.id, line.po_id, line.work_order_part_id
      into v_line_id, v_existing_po_id, v_existing_wop_id
    from public.purchase_order_lines line
    where line.part_request_item_id = p_request_item_id
      and line.po_id = p_po_id
      and greatest(
        coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0
      ) > 0
    order by line.created_at, line.id
    limit 1;

    if not found then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ORDER_TARGET_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'domain_replay', true,
      'purchase_order_line_id', v_line_id,
      'po_id', v_existing_po_id,
      'work_order_part_id', v_existing_wop_id,
      'approved_qty', v_target,
      'ordered_qty', v_total_ordered,
      'remaining_to_order', 0,
      'status', v_status
    );
  end if;

  if lower(coalesce(v_po.status, '')) not in ('draft', 'open') then
    raise exception using
      errcode = '55000',
      message = format(
        'Purchase order %s is not editable in status %s.',
        p_po_id,
        coalesce(v_po.status, 'unknown')
      );
  end if;

  v_remaining := v_target - v_total_ordered;
  if p_qty > v_remaining then
    raise exception using
      errcode = '23514',
      message = format(
        'Requested PO quantity %s exceeds remaining approved quantity %s.',
        p_qty,
        v_remaining
      );
  end if;

  v_sell_price := coalesce(v_item.quoted_price, v_item.unit_price);

  if v_item.part_id is null then
    -- Free-text/vendor lines are a supported PO identity. They deliberately do
    -- not create stock, a catalog part, or a work-order-part row.
    if p_unit_cost is null then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ACQUISITION_COST_REQUIRED';
    end if;
    v_acquisition_cost := p_unit_cost;
    v_wop_id := null;
  else
    select *
      into v_part
    from public.parts part
    where part.id = v_item.part_id
    for share;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Selected part not found.';
    end if;
    if v_part.shop_id is distinct from v_item.shop_id then
      raise exception using
        errcode = '42501',
        message = 'Selected part belongs to a different shop.';
    end if;

    -- A caller-supplied acquisition cost is authoritative, including a valid
    -- zero-margin purchase where cost equals customer sell. Only the legacy
    -- staged request value uses the mirrored-sell heuristic before catalog
    -- default_cost/cost is considered.
    v_acquisition_cost := coalesce(
      p_unit_cost,
      case
        when v_item.unit_cost is not null
          and (
            v_sell_price is null
            or round(v_item.unit_cost, 4) <> round(v_sell_price, 4)
          )
          then v_item.unit_cost
        else null
      end,
      v_part.cost,
      v_part.default_cost
    );

    if v_acquisition_cost is null then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ACQUISITION_COST_REQUIRED';
    end if;

    v_wop_id := public.parts_ensure_work_order_part(p_request_item_id);
    select *
      into v_wop
    from public.work_order_parts
    where id = v_wop_id
    for update;

    if not found
       or v_wop.shop_id is distinct from v_item.shop_id
       or v_wop.part_id is distinct from v_item.part_id then
      raise exception using
        errcode = '23503',
        message = format(
          'Unable to resolve the work-order part for request item %s.',
          p_request_item_id
        );
    end if;
  end if;

  select *
    into v_existing_line
  from public.purchase_order_lines line
  where line.po_id = p_po_id
    and line.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing_line.part_request_item_id is distinct from p_request_item_id
       or v_existing_line.part_id is distinct from v_item.part_id
       or v_existing_line.qty is distinct from p_qty
       or v_existing_line.unit_cost is distinct from v_acquisition_cost
       or v_existing_line.location_id is distinct from p_location_id then
      raise exception using
        errcode = '22023',
        message = 'PARTS_PO_LINE_IDEMPOTENCY_CONFLICT';
    end if;
    v_line_id := v_existing_line.id;
    v_line_replayed := true;
  else
    insert into public.purchase_order_lines(
      po_id,
      part_id,
      sku,
      description,
      qty,
      unit_cost,
      location_id,
      part_request_item_id,
      work_order_part_id,
      idempotency_key
    ) values (
      p_po_id,
      v_item.part_id,
      case
        when v_item.part_id is null
          then nullif(trim(v_item.requested_part_number), '')
        else nullif(trim(v_part.sku), '')
      end,
      coalesce(
        nullif(trim(v_item.description), ''),
        nullif(trim(v_item.requested_part_number), ''),
        nullif(trim(v_item.requested_manufacturer), ''),
        'Vendor part'
      ),
      p_qty,
      v_acquisition_cost,
      p_location_id,
      p_request_item_id,
      v_wop_id,
      p_idempotency_key
    )
    returning id into v_line_id;
  end if;

  select coalesce(sum(
    greatest(coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0)
  ), 0)
  into v_total_ordered
  from public.purchase_order_lines line
  where line.part_request_item_id = p_request_item_id;

  if v_total_ordered > v_target then
    raise exception using
      errcode = '23514',
      message = format(
        'Active ordered quantity %s exceeds approved quantity %s.',
        v_total_ordered,
        v_target
      );
  end if;

  v_status := case
    when v_total_ordered <= 0 then
      'approved'::public.part_request_item_status
    when v_total_ordered < v_target then
      'partially_ordered'::public.part_request_item_status
    else
      'ordered'::public.part_request_item_status
  end;

  update public.part_request_items
  set po_id = p_po_id,
      qty_ordered = v_total_ordered,
      unit_cost = v_acquisition_cost,
      status = v_status,
      updated_at = now()
  where id = p_request_item_id;

  if v_wop_id is not null then
    update public.work_order_parts
    set quantity_ordered = v_total_ordered,
        updated_at = now()
    where id = v_wop_id;
    perform public.parts_reconcile_work_order_part(v_wop_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', v_line_replayed,
    'manual_line', v_item.part_id is null,
    'purchase_order_line_id', v_line_id,
    'po_id', p_po_id,
    'work_order_part_id', v_wop_id,
    'approved_qty', v_target,
    'ordered_qty', v_total_ordered,
    'remaining_to_order', greatest(v_target - v_total_ordered, 0),
    'status', v_status
  );
end;
$$;

create or replace function public.parts_create_or_reuse_po_line_for_request(
  p_request_item_id uuid,
  p_qty numeric,
  p_idempotency_key text,
  p_po_id uuid default null,
  p_supplier_id uuid default null,
  p_unit_cost numeric default null,
  p_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.part_request_items%rowtype;
  v_po public.purchase_orders%rowtype;
  v_supplier public.suppliers%rowtype;
  v_operation public.parts_lifecycle_operations%rowtype;
  v_po_id uuid := p_po_id;
  v_operation_id uuid;
  v_result jsonb;
  v_item_shop_id uuid;
  v_existing_po_id uuid;
  v_existing_line_id uuid;
  v_existing_wop_id uuid;
  v_legacy_line public.purchase_order_lines%rowtype;
  v_operation_po_text text;
  v_request_payload jsonb;
  v_total_ordered numeric;
  v_target numeric;
  v_remaining numeric;
  v_status public.part_request_item_status;
  v_created boolean := false;
  v_operation_was_visible boolean := false;
begin
  if p_qty is null
     or p_qty <= 0
     or p_qty::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = '22023',
      message = 'PO quantity must be greater than zero.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception using
      errcode = '22023',
      message = 'A stable idempotency key is required.';
  end if;
  if length(p_idempotency_key) > 300 then
    raise exception using
      errcode = '22023',
      message = 'PO-line idempotency key is too long.';
  end if;
  if p_po_id is null and p_supplier_id is null then
    raise exception using
      errcode = '22023',
      message = 'Provide an existing purchase order or supplier.';
  end if;
  if p_unit_cost is not null
     and (
       p_unit_cost < 0
       or p_unit_cost::text in ('NaN', 'Infinity', '-Infinity')
     ) then
    raise exception using
      errcode = '22023',
      message = 'PARTS_ACQUISITION_COST_INVALID';
  end if;

  -- Bind every caller-controlled semantic input to the durable receipt. This
  -- prevents the same transport key from being reused with a changed quantity,
  -- cost, target, location, or header notes after an ambiguous response.
  v_request_payload := jsonb_build_object(
    'request_item_id', p_request_item_id,
    'qty', p_qty,
    'po_id', p_po_id,
    'supplier_id', p_supplier_id,
    'unit_cost', p_unit_cost,
    'location_id', p_location_id,
    'notes', nullif(trim(p_notes), '')
  );

  -- Read the request only to resolve its tenant. Every mutable predicate is
  -- checked again after the target PO (when one already exists) is locked.
  select *
    into v_item
  from public.part_request_items
  where id = p_request_item_id;

  if not found or v_item.shop_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Request item not found or missing shop.';
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
      message = 'Parts ordering actor is not authorized for this shop.';
  end if;

  -- Supplier-backed create/reuse is serialized by the tenant supplier row.
  -- NO KEY UPDATE conflicts with another creator's NO KEY UPDATE while staying
  -- compatible with the KEY SHARE lock taken by a purchase-order supplier FK.
  -- A header editor can therefore hold PO then validate its supplier without
  -- forming a PO -> supplier / supplier -> PO deadlock with this wrapper.
  if p_supplier_id is not null then
    select *
      into v_supplier
    from public.suppliers supplier
    where supplier.id = p_supplier_id
      and supplier.shop_id = v_item_shop_id
    for no key update;

    if not found then
      raise exception using
        errcode = '42501',
        message = 'Supplier not found for this shop.';
    end if;
  end if;

  if v_po_id is not null then
    -- Explicit target: PO is known up front, so acquire it before the item.
    select *
      into v_po
    from public.purchase_orders purchase_order
    where purchase_order.id = v_po_id
    for update;
  else
    -- A committed exact retry may point at a PO that is no longer editable.
    -- Resolve that durable target before considering a draft/open candidate.
    select *
      into v_operation
    from public.parts_lifecycle_operations operation
    where operation.shop_id = v_item_shop_id
      and operation.idempotency_key = p_idempotency_key;
    v_operation_was_visible := found;

    if v_operation_was_visible then
      if v_operation.operation_type <> 'create_or_reuse_po_line'
         or v_operation.part_request_item_id is distinct from p_request_item_id
         or nullif(v_operation.result ->> 'po_id', '') is null then
        raise exception using
          errcode = '22023',
          message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
      end if;

      v_operation_po_text := v_operation.result ->> 'po_id';
      select *
        into v_po
      from public.purchase_orders purchase_order
      where purchase_order.id::text = v_operation_po_text
      for update;
      if found then
        v_po_id := v_po.id;
      end if;
    else
      -- With the supplier row held, this is the sole create/reuse chooser for
      -- the tenant/supplier. If no row exists, leave v_po_id null: after the
      -- item is locked and revalidated a brand-new header can be inserted
      -- without waiting on any pre-existing PO row.
      select *
        into v_po
      from public.purchase_orders purchase_order
      where purchase_order.shop_id = v_item_shop_id
        and purchase_order.supplier_id = p_supplier_id
        and lower(coalesce(purchase_order.status, '')) in ('draft', 'open')
      order by purchase_order.created_at desc, purchase_order.id desc
      limit 1
      for update;
      if found then
        v_po_id := v_po.id;
      end if;
    end if;
  end if;

  if p_po_id is not null and v_po.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase order not found.';
  end if;
  if v_operation_was_visible and v_po.id is null then
    raise exception using
      errcode = '22023',
      message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
  end if;
  if v_po_id is not null
     and v_po.shop_id is distinct from v_item_shop_id then
    raise exception using
      errcode = '42501',
      message = 'Purchase order belongs to a different shop.';
  end if;
  if v_po_id is not null
     and v_po.supplier_id is not null
     and not exists (
       select 1
       from public.suppliers supplier
       where supplier.id = v_po.supplier_id
         and supplier.shop_id = v_item_shop_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Purchase order supplier belongs to a different shop.';
  end if;
  if v_po_id is not null
     and p_supplier_id is not null
     and v_po.supplier_id is distinct from p_supplier_id then
    raise exception using
      errcode = '22023',
      message = 'Purchase order supplier does not match the requested supplier.';
  end if;

  -- Existing targets are now held. Lock and re-read the mutable request item.
  select *
    into v_item
  from public.part_request_items
  where id = p_request_item_id
  for update;

  if not found or v_item.shop_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Request item not found or missing shop.';
  end if;
  if v_item.shop_id is distinct from v_item_shop_id then
    raise exception using
      errcode = '42501',
      message = 'Request item tenant changed while ordering.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_item.shop_id);
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_item.shop_id
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
      message = 'Parts ordering actor is not authorized for this shop.';
  end if;

  if not public.parts_request_is_operationally_released(v_item.request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_APPROVAL_REQUIRED',
      detail = 'A purchase order cannot be created until the linked work is approved.';
  end if;

  -- Exact transport-key replay returns the durable receipt, but never permits
  -- the same tenant key to be rebound to another item or target.
  select *
    into v_operation
  from public.parts_lifecycle_operations operation
  where operation.shop_id = v_item.shop_id
    and operation.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_po_id is null
       or nullif(v_operation.result ->> 'po_id', '')
         is distinct from v_po_id::text
       or v_operation.operation_type <> 'create_or_reuse_po_line'
       or v_operation.part_request_item_id is distinct from p_request_item_id then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
    end if;

    if v_operation.result ? '_request' then
      if v_operation.result -> '_request' is distinct from v_request_payload then
        raise exception using
          errcode = '22023',
          message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
      end if;
    else
      -- Operations written before request payloads were persisted still carry
      -- the durable PO/line result. Bind their first safe exact retry to the
      -- supplied semantics only after proving that immutable domain record,
      -- then all later retries use the strict payload comparison above.
      if jsonb_typeof(v_operation.result) is distinct from 'object'
         or nullif(v_operation.result ->> 'po_id', '') is null
         or nullif(
           v_operation.result ->> 'purchase_order_line_id',
           ''
         ) is null then
        raise exception using
          errcode = '22023',
          message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
      end if;

      select *
        into v_legacy_line
      from public.purchase_order_lines line
      where line.id::text =
          v_operation.result ->> 'purchase_order_line_id'
        and line.po_id::text = v_operation.result ->> 'po_id'
        and line.part_request_item_id = p_request_item_id
        and line.idempotency_key = p_idempotency_key
      for update;

      if not found then
        raise exception using
          errcode = '22023',
          message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
      end if;

      if v_legacy_line.qty is distinct from p_qty
         or v_legacy_line.location_id is distinct from p_location_id
         or (
           p_unit_cost is not null
           and v_legacy_line.unit_cost is distinct from p_unit_cost
         )
         or (v_item.part_id is null and p_unit_cost is null)
         or (
           p_po_id is not null
           and v_legacy_line.po_id is distinct from p_po_id
         )
         or (
           p_supplier_id is not null
           and v_po.supplier_id is distinct from p_supplier_id
         )
         or (
           v_item.vendor_id is not null
           and v_po.supplier_id is distinct from v_item.vendor_id
         )
         or (
           v_operation.result ? 'work_order_part_id'
           and (v_operation.result ->> 'work_order_part_id')
             is distinct from v_legacy_line.work_order_part_id::text
         )
         or (
           v_operation.result ->> 'po_created' = 'true'
           and nullif(trim(p_notes), '')
             is distinct from nullif(trim(v_po.notes), '')
         ) then
        raise exception using
          errcode = '22023',
          message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
      end if;

      v_operation.result := v_operation.result
        || jsonb_build_object('_request', v_request_payload);
      update public.parts_lifecycle_operations
      set result = v_operation.result
      where id = v_operation.id;
    end if;

    v_existing_po_id := nullif(v_operation.result ->> 'po_id', '')::uuid;
    if p_po_id is not null and p_po_id is distinct from v_existing_po_id then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
    end if;
    if p_supplier_id is not null
       and v_po.supplier_id is distinct from p_supplier_id then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
    end if;

    return v_operation.result
      || jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  if v_item.vendor_id is not null
     and v_item.vendor_id is distinct from (
       case
         when v_po_id is not null then v_po.supplier_id
         else p_supplier_id
       end
     ) then
    raise exception using
      errcode = '22023',
      message = 'PARTS_REQUEST_VENDOR_MISMATCH';
  end if;

  v_target := greatest(
    coalesce(v_item.qty_approved, 0),
    coalesce(v_item.qty_requested, 0),
    coalesce(v_item.qty, 0),
    0
  );
  if v_target <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Approved request quantity must be greater than zero.';
  end if;

  select
    coalesce(sum(
      greatest(coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0)
    ), 0),
    (
      array_agg(line.id order by line.created_at, line.id)
      filter (
        where greatest(
          coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0
        ) > 0
      )
    )[1],
    (
      array_agg(line.po_id order by line.created_at, line.id)
      filter (
        where greatest(
          coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0
        ) > 0
      )
    )[1],
    (
      array_agg(line.work_order_part_id order by line.created_at, line.id)
      filter (
        where greatest(
          coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0
        ) > 0
      )
    )[1]
  into
    v_total_ordered,
    v_existing_line_id,
    v_existing_po_id,
    v_existing_wop_id
  from public.purchase_order_lines line
  where line.part_request_item_id = p_request_item_id;

  if v_total_ordered > v_target then
    raise exception using
      errcode = '23514',
      message = format(
        'Active ordered quantity %s exceeds approved quantity %s.',
        v_total_ordered,
        v_target
      );
  end if;

  v_status := case
    when v_total_ordered <= 0 then
      'approved'::public.part_request_item_status
    when v_total_ordered < v_target then
      'partially_ordered'::public.part_request_item_status
    else
      'ordered'::public.part_request_item_status
  end;

  if v_total_ordered >= v_target then
    if p_po_id is not null
       and not exists (
         select 1
         from public.purchase_order_lines line
         where line.part_request_item_id = p_request_item_id
           and line.po_id = p_po_id
           and greatest(
             coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0
           ) > 0
       ) then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ORDER_TARGET_CONFLICT';
    end if;

    if p_supplier_id is not null
       and not exists (
         select 1
         from public.purchase_order_lines line
         join public.purchase_orders purchase_order
           on purchase_order.id = line.po_id
         where line.part_request_item_id = p_request_item_id
           and purchase_order.shop_id = v_item.shop_id
           and purchase_order.supplier_id = p_supplier_id
           and greatest(
             coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0
           ) > 0
       ) then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ORDER_TARGET_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'domain_replay', true,
      'po_created', false,
      'purchase_order_line_id', v_existing_line_id,
      'po_id', v_existing_po_id,
      'work_order_part_id', v_existing_wop_id,
      'approved_qty', v_target,
      'ordered_qty', v_total_ordered,
      'remaining_to_order', 0,
      'status', v_status
    );
  end if;

  v_remaining := v_target - v_total_ordered;
  if p_qty > v_remaining then
    raise exception using
      errcode = '23514',
      message = format(
        'Requested PO quantity %s exceeds remaining approved quantity %s.',
        p_qty,
        v_remaining
      );
  end if;

  if v_po_id is not null then
    if lower(coalesce(v_po.status, '')) not in ('draft', 'open') then
      raise exception using
        errcode = '55000',
        message = format(
          'Purchase order %s is not editable in status %s.',
          v_po_id,
          coalesce(v_po.status, 'unknown')
        );
    end if;
  end if;

  insert into public.parts_lifecycle_operations(
    shop_id,
    idempotency_key,
    operation_type,
    part_request_item_id,
    result,
    created_by
  ) values (
    v_item.shop_id,
    p_idempotency_key,
    'create_or_reuse_po_line',
    p_request_item_id,
    jsonb_build_object(
      'state', 'started',
      '_request', v_request_payload
    ),
    auth.uid()
  )
  on conflict (shop_id, idempotency_key) do nothing
  returning id into v_operation_id;

  if v_operation_id is null then
    select *
      into v_operation
    from public.parts_lifecycle_operations operation
    where operation.shop_id = v_item.shop_id
      and operation.idempotency_key = p_idempotency_key
    for update;

    if not found
       or v_po_id is null
       or nullif(v_operation.result ->> 'po_id', '')
         is distinct from v_po_id::text
       or v_operation.operation_type <> 'create_or_reuse_po_line'
       or v_operation.part_request_item_id is distinct from p_request_item_id
       or v_operation.result -> '_request' is distinct from v_request_payload then
      raise exception using
        errcode = '22023',
        message = 'PARTS_ORDER_IDEMPOTENCY_CONFLICT';
    end if;

    return v_operation.result
      || jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  if v_po_id is null then
    insert into public.purchase_orders(
      shop_id,
      supplier_id,
      status,
      notes
    ) values (
      v_item.shop_id,
      p_supplier_id,
      'draft',
      nullif(trim(p_notes), '')
    )
    returning * into v_po;
    v_po_id := v_po.id;
    v_created := true;
  end if;

  v_result := public.parts_create_po_line_for_request(
    v_po_id,
    p_request_item_id,
    p_qty,
    p_unit_cost,
    p_location_id,
    p_idempotency_key
  ) || jsonb_build_object(
    'po_id', v_po_id,
    'po_created', v_created,
    'idempotent', false,
    '_request', v_request_payload
  );

  update public.parts_lifecycle_operations
  set result = v_result,
      work_order_part_id = case
        when nullif(v_result ->> 'work_order_part_id', '') is null then null
        else (v_result ->> 'work_order_part_id')::uuid
      end
  where id = v_operation_id;

  return v_result;
end;
$$;

revoke all on function public.parts_create_po_line_for_request(
  uuid, uuid, numeric, numeric, uuid, text
) from public, anon;
grant execute on function public.parts_create_po_line_for_request(
  uuid, uuid, numeric, numeric, uuid, text
) to authenticated, service_role;

revoke all on function public.parts_create_or_reuse_po_line_for_request(
  uuid, numeric, text, uuid, uuid, numeric, uuid, text
) from public, anon;
grant execute on function public.parts_create_or_reuse_po_line_for_request(
  uuid, numeric, text, uuid, uuid, numeric, uuid, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
