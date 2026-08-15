begin;

-- The preview branch already applied the initial Field truck movement migration.
-- Reinstall both commands so request hashing remains safe with the hardened
-- search path and an exact receipt replay reaches the canonical idempotency
-- check before the selected PO line's remaining-quantity guard.
create or replace function public.field_transfer_stock_to_truck_atomic(
  p_shop_id uuid,
  p_service_vehicle_id uuid,
  p_source_location_id uuid,
  p_part_id uuid,
  p_quantity numeric,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_truck public.service_vehicles%rowtype;
  v_operation public.parts_operation_keys%rowtype;
  v_request jsonb;
  v_request_hash text;
  v_scoped_key text;
  v_out_move_id uuid;
  v_in_move_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select * into v_actor
  from private.profixiq_field_inventory_actor_context(
    p_shop_id,
    p_actor_user_id
  );
  if not found then
    raise exception using errcode = '42501', message = 'Shop membership is required.';
  end if;
  if not private.profixiq_field_inventory_actor_can_use_truck(
    p_shop_id,
    p_actor_user_id,
    p_service_vehicle_id
  ) then
    raise exception using errcode = '42501', message = 'This truck is not available to the authenticated actor.';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 4) then
    raise exception using errcode = '22023', message = 'Transfer quantity must be positive with at most four decimal places.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;

  select * into v_truck
  from public.service_vehicles vehicle
  where vehicle.id = p_service_vehicle_id
    and vehicle.shop_id = p_shop_id
    and vehicle.active
  for update;
  if not found or v_truck.stock_location_id is null then
    raise exception using errcode = '55000', message = 'The service truck does not have an inventory location.';
  end if;
  if v_truck.stock_location_id = p_source_location_id then
    raise exception using errcode = '22023', message = 'Source and truck inventory locations must be different.';
  end if;

  perform 1
  from public.parts part
  where part.id = p_part_id
    and part.shop_id = p_shop_id
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Part not found for this shop.';
  end if;

  perform 1
  from public.stock_locations location
  where location.shop_id = p_shop_id
    and location.id in (p_source_location_id, v_truck.stock_location_id)
  order by location.id
  for update;
  if (select count(*)
      from public.stock_locations location
      where location.shop_id = p_shop_id
        and location.id in (p_source_location_id, v_truck.stock_location_id)) <> 2 then
    raise exception using errcode = '42501', message = 'A transfer location is outside this shop.';
  end if;

  v_scoped_key := p_shop_id::text || ':field-transfer:' || trim(p_operation_key);
  if length(v_scoped_key) > 260 then
    raise exception using errcode = '22023', message = 'Transfer operation key is too long.';
  end if;
  v_request := jsonb_build_object(
    'service_vehicle_id', p_service_vehicle_id,
    'source_location_id', p_source_location_id,
    'destination_location_id', v_truck.stock_location_id,
    'part_id', p_part_id,
    'quantity', p_quantity
  );
  v_request_hash := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(v_scoped_key, 0));
  select * into v_operation
  from public.parts_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_key = v_scoped_key
  for update;
  if found then
    if v_operation.operation_type <> 'field_transfer_to_truck'
       or v_operation.aggregate_type <> 'service_vehicle'
       or v_operation.aggregate_id <> p_service_vehicle_id
       or coalesce(v_operation.result ->> '_request_hash', '') <> v_request_hash then
      raise exception using errcode = '22023', message = 'FIELD_TRUCK_TRANSFER_KEY_CONFLICT';
    end if;
    if v_operation.result is null or v_operation.completed_at is null then
      raise exception using errcode = '55000', message = 'FIELD_TRUCK_TRANSFER_IN_PROGRESS';
    end if;
    return v_operation.result || jsonb_build_object('idempotent', true);
  end if;

  if public.parts_available(
    p_shop_id,
    p_part_id,
    p_source_location_id
  ) < p_quantity then
    raise exception using errcode = '23514', message = 'Insufficient available stock at the source location.';
  end if;

  insert into public.parts_operation_keys (
    shop_id,
    operation_key,
    operation_type,
    aggregate_type,
    aggregate_id,
    created_by
  ) values (
    p_shop_id,
    v_scoped_key,
    'field_transfer_to_truck',
    'service_vehicle',
    p_service_vehicle_id,
    v_actor.profile_id
  ) returning * into v_operation;

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
    lifecycle_quantity
  ) values (
    p_shop_id,
    p_part_id,
    p_source_location_id,
    -p_quantity,
    'transfer_out',
    'field_truck_transfer',
    v_operation.id,
    v_actor.profile_id,
    v_scoped_key || ':out',
    jsonb_build_object(
      'operation', 'field_transfer_to_truck',
      'service_vehicle_id', p_service_vehicle_id,
      'source_location_id', p_source_location_id,
      'destination_location_id', v_truck.stock_location_id,
      'quantity', p_quantity
    ),
    p_quantity
  ) returning id into v_out_move_id;

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
    lifecycle_quantity
  ) values (
    p_shop_id,
    p_part_id,
    v_truck.stock_location_id,
    p_quantity,
    'transfer_in',
    'field_truck_transfer',
    v_operation.id,
    v_actor.profile_id,
    v_scoped_key || ':in',
    jsonb_build_object(
      'operation', 'field_transfer_to_truck',
      'service_vehicle_id', p_service_vehicle_id,
      'source_location_id', p_source_location_id,
      'destination_location_id', v_truck.stock_location_id,
      'quantity', p_quantity,
      'paired_stock_move_id', v_out_move_id
    ),
    p_quantity
  ) returning id into v_in_move_id;

  update public.stock_moves
  set metadata = metadata || jsonb_build_object('paired_stock_move_id', v_in_move_id)
  where id = v_out_move_id;

  update public.parts_operation_keys
  set result = jsonb_build_object(
        'ok', true,
        'idempotent', false,
        'serviceVehicleId', p_service_vehicle_id,
        'partId', p_part_id,
        'sourceLocationId', p_source_location_id,
        'destinationLocationId', v_truck.stock_location_id,
        'quantity', p_quantity,
        'transferOutMoveId', v_out_move_id,
        'transferInMoveId', v_in_move_id,
        'sourceAvailableAfter', public.parts_available(
          p_shop_id,
          p_part_id,
          p_source_location_id
        ),
        'truckOnHandAfter', public.parts_on_hand(
          p_shop_id,
          p_part_id,
          v_truck.stock_location_id
        ),
        'truckAvailableAfter', public.parts_available(
          p_shop_id,
          p_part_id,
          v_truck.stock_location_id
        ),
        '_request_hash', v_request_hash
      ),
      completed_at = now()
  where id = v_operation.id
  returning * into v_operation;

  return v_operation.result;
end;
$$;

create or replace function private.profixiq_receive_po_line_to_location_atomic(
  p_shop_id uuid,
  p_purchase_order_id uuid,
  p_purchase_order_line_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_actor_user_id uuid,
  p_operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_po public.purchase_orders%rowtype;
  v_line public.purchase_order_lines%rowtype;
  v_item public.part_request_items%rowtype;
  v_move public.stock_moves%rowtype;
  v_operation_key text;
  v_line_received numeric;
  v_target numeric;
  v_item_received numeric;
  v_allocated numeric := 0;
  v_po_closed boolean := false;
  v_result jsonb;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  select * into v_actor
  from private.profixiq_field_inventory_actor_context(p_shop_id, p_actor_user_id);
  if not found or not v_actor.can_manage_parts then
    raise exception using errcode = '42501', message = 'Parts receiving permission is required.';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 2) then
    raise exception using errcode = '22023', message = 'Receipt quantity must be positive with at most two decimal places.';
  end if;

  select * into v_po
  from public.purchase_orders purchase_order
  where purchase_order.id = p_purchase_order_id
    and purchase_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Purchase order not found for this shop.';
  end if;
  select * into v_line
  from public.purchase_order_lines line
  where line.id = p_purchase_order_line_id
    and line.po_id = p_purchase_order_id
    and line.part_id = p_part_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'PARTS_PO_LINE_RECEIPT_TARGET_MISMATCH';
  end if;

  if not exists (
    select 1 from public.stock_locations location
    where location.id = p_location_id
      and location.shop_id = p_shop_id
  ) then
    raise exception using errcode = '42501', message = 'Receipt location is outside this shop.';
  end if;

  v_operation_key := p_shop_id::text || ':po-receive:' || p_operation_id::text;
  select * into v_move
  from public.stock_moves move
  where move.shop_id = p_shop_id
    and move.idempotency_key = v_operation_key
  for update;
  if found then
    if v_move.part_id is distinct from p_part_id
       or v_move.location_id is distinct from p_location_id
       or v_move.qty_change is distinct from p_quantity
       or v_move.reference_kind is distinct from 'purchase_order'
       or v_move.reference_id is distinct from p_purchase_order_id
       or (
         v_move.metadata ? 'purchase_order_line_id'
         and nullif(v_move.metadata ->> 'purchase_order_line_id', '')::uuid
           is distinct from p_purchase_order_line_id
       ) then
      raise exception using errcode = '22023', message = 'PO_RECEIVE_IDEMPOTENCY_CONFLICT';
    end if;
    return coalesce(v_move.metadata -> 'receipt_result', '{}'::jsonb)
      || jsonb_build_object('ok', true, 'replayed', true, 'move_id', v_move.id);
  end if;

  if lower(coalesce(v_po.status::text, '')) in (
    'received', 'closed', 'cancelled', 'canceled', 'void'
  ) then
    raise exception using errcode = '55000', message = 'PARTS_PO_NOT_RECEIVABLE';
  end if;

  v_line_received := coalesce(v_line.received_qty, 0) + p_quantity;
  if v_line_received > greatest(
    coalesce(v_line.qty, 0) - coalesce(v_line.cancelled_qty, 0),
    0
  ) then
    raise exception using errcode = '23514', message = 'Receipt quantity exceeds the selected purchase-order line.';
  end if;

  if v_line.part_request_item_id is not null then
    select * into v_item
    from public.part_request_items item
    where item.id = v_line.part_request_item_id
      and item.shop_id = p_shop_id
      and item.part_id = p_part_id
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'PARTS_PO_LINE_REQUEST_TARGET_MISMATCH';
    end if;
  end if;

  insert into public.stock_moves (
    shop_id, part_id, location_id, qty_change, reason, reference_kind,
    reference_id, created_by, idempotency_key, metadata, lifecycle_quantity,
    work_order_part_id
  ) values (
    p_shop_id, p_part_id, p_location_id, p_quantity, 'receive',
    'purchase_order', p_purchase_order_id, v_actor.profile_id, v_operation_key,
    jsonb_build_object(
      'operation', 'purchase_order_line_receipt',
      'operation_id', p_operation_id,
      'po_id', p_purchase_order_id,
      'purchase_order_line_id', p_purchase_order_line_id,
      'part_request_item_id', v_line.part_request_item_id
    ),
    p_quantity,
    v_line.work_order_part_id
  ) returning * into v_move;

  update public.purchase_order_lines
  set received_qty = v_line_received
  where id = p_purchase_order_line_id;

  if v_line.part_request_item_id is not null then
    v_target := greatest(
      coalesce(v_item.qty_approved, 0),
      coalesce(v_item.qty_requested, 0),
      coalesce(v_item.qty, 0),
      0
    );
    v_allocated := least(
      p_quantity,
      greatest(v_target - coalesce(v_item.qty_received, 0), 0)
    );
    v_item_received := coalesce(v_item.qty_received, 0) + v_allocated;
    if v_allocated > 0 then
      update public.part_request_items
      set qty_received = v_item_received,
          status = case
            when v_item_received >= v_target
              then 'received'::public.part_request_item_status
            else 'partially_received'::public.part_request_item_status
          end,
          updated_at = now()
      where id = v_item.id;
    end if;
  end if;

  perform 1
  from public.purchase_order_lines line
  where line.po_id = p_purchase_order_id
  order by line.created_at, line.id
  for update;
  if not exists (
    select 1
    from public.purchase_order_lines line
    where line.po_id = p_purchase_order_id
      and coalesce(line.received_qty, 0) < greatest(
        coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0),
        0
      )
  ) then
    update public.purchase_orders
    set status = 'received'
    where id = p_purchase_order_id;
    v_po_closed := true;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'move_id', v_move.id,
    'po_id', p_purchase_order_id,
    'purchase_order_line_id', p_purchase_order_line_id,
    'po_closed', v_po_closed,
    'po_status', (
      select purchase_order.status::text
      from public.purchase_orders purchase_order
      where purchase_order.id = p_purchase_order_id
    ),
    'part_id', p_part_id,
    'qty_received_total', p_quantity,
    'allocations', case
      when v_line.part_request_item_id is not null and v_allocated > 0
        then jsonb_build_array(jsonb_build_object(
          'request_item_id', v_line.part_request_item_id,
          'qty_allocated', v_allocated
        ))
      else '[]'::jsonb
    end,
    'unallocated_qty', greatest(p_quantity - v_allocated, 0)
  );
  update public.stock_moves
  set metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('receipt_result', v_result)
  where id = v_move.id;
  return v_result;
end;
$$;

revoke all on function private.profixiq_receive_po_line_to_location_atomic(
  uuid, uuid, uuid, uuid, uuid, numeric, uuid, uuid
) from public, anon, authenticated;

create or replace function public.field_receive_po_part_to_truck_atomic(
  p_shop_id uuid,
  p_service_vehicle_id uuid,
  p_purchase_order_id uuid,
  p_purchase_order_line_id uuid,
  p_quantity numeric,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_truck public.service_vehicles%rowtype;
  v_po public.purchase_orders%rowtype;
  v_line public.purchase_order_lines%rowtype;
  v_item public.part_request_items%rowtype;
  v_part_id uuid;
  v_work_order_part_id uuid;
  v_supplier_name text;
  v_identity_result jsonb;
  v_result jsonb;
  v_move_id uuid;
  v_operation_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select * into v_actor
  from private.profixiq_field_inventory_actor_context(
    p_shop_id,
    p_actor_user_id
  );
  if not found or not v_actor.can_manage_parts then
    raise exception using errcode = '42501', message = 'Parts receiving permission is required.';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 2) then
    raise exception using errcode = '22023', message = 'Receipt quantity must be positive with at most two decimal places.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;

  select * into v_truck
  from public.service_vehicles vehicle
  where vehicle.id = p_service_vehicle_id
    and vehicle.shop_id = p_shop_id
    and vehicle.active
  for update;
  if not found or v_truck.stock_location_id is null then
    raise exception using errcode = '55000', message = 'The service truck does not have an inventory location.';
  end if;

  select * into v_po
  from public.purchase_orders purchase_order
  where purchase_order.id = p_purchase_order_id
    and purchase_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Purchase order not found for this shop.';
  end if;
  select * into v_line
  from public.purchase_order_lines line
  where line.id = p_purchase_order_line_id
    and line.po_id = p_purchase_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Purchase-order line not found.';
  end if;

  v_operation_id := md5(
    p_shop_id::text || ':field-po-receive:' || trim(p_operation_key)
  )::uuid;
  if v_line.part_id is not null and exists (
    select 1
    from public.stock_moves move
    where move.shop_id = p_shop_id
      and move.idempotency_key =
        p_shop_id::text || ':po-receive:' || v_operation_id::text
  ) then
    v_part_id := v_line.part_id;
    v_work_order_part_id := v_line.work_order_part_id;
    v_result := private.profixiq_receive_po_line_to_location_atomic(
      p_shop_id,
      p_purchase_order_id,
      p_purchase_order_line_id,
      v_part_id,
      v_truck.stock_location_id,
      p_quantity,
      p_actor_user_id,
      v_operation_id
    );
    return v_result || jsonb_build_object(
      'serviceVehicleId', p_service_vehicle_id,
      'truckStockLocationId', v_truck.stock_location_id,
      'purchaseOrderLineId', p_purchase_order_line_id,
      'partId', v_part_id,
      'workOrderPartId', v_work_order_part_id,
      'directToTruck', true
    );
  end if;

  if greatest(
    coalesce(v_line.qty, 0)
      - coalesce(v_line.cancelled_qty, 0)
      - coalesce(v_line.received_qty, 0),
    0
  ) < p_quantity then
    raise exception using errcode = '23514', message = 'Receipt quantity exceeds the selected purchase-order line.';
  end if;

  v_part_id := v_line.part_id;
  if v_part_id is null then
    select supplier.name into v_supplier_name
    from public.suppliers supplier
    where supplier.id = v_po.supplier_id
      and supplier.shop_id = p_shop_id;

    v_identity_result := public.field_resolve_or_create_part_identity_atomic(
      p_shop_id,
      p_actor_user_id,
      coalesce(nullif(trim(v_line.sku), ''), 'po-line-' || v_line.id::text),
      'purchase_order',
      v_line.id::text,
      null,
      v_po.supplier_id,
      coalesce(nullif(trim(v_line.description), ''), nullif(trim(v_line.sku), ''), 'Purchased part'),
      null,
      nullif(trim(v_line.sku), ''),
      nullif(trim(v_line.sku), ''),
      null,
      1,
      true,
      v_line.unit_cost,
      null,
      jsonb_build_object(
        'source', 'field_direct_po_receipt',
        'purchase_order_id', v_po.id,
        'purchase_order_line_id', v_line.id,
        'supplier_name', v_supplier_name
      ),
      trim(p_operation_key) || ':identity'
    );
    v_part_id := nullif(v_identity_result ->> 'partId', '')::uuid;
    if v_part_id is null then
      raise exception using errcode = 'P0001', message = 'Unable to create the canonical part for this purchase-order line.';
    end if;
  end if;

  if v_line.part_request_item_id is not null then
    select * into v_item
    from public.part_request_items item
    where item.id = v_line.part_request_item_id
      and item.shop_id = p_shop_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Linked request item not found.';
    end if;
    if v_item.part_id is not null and v_item.part_id <> v_part_id then
      raise exception using errcode = '23505', message = 'PURCHASE_ORDER_LINE_PART_IDENTITY_CONFLICT';
    end if;
    if v_item.part_id is null then
      update public.part_request_items
      set part_id = v_part_id,
          description = coalesce(nullif(trim(description), ''), nullif(trim(v_line.description), ''), 'Part'),
          updated_at = now()
      where id = v_item.id;
    end if;
    v_work_order_part_id := public.parts_ensure_work_order_part(v_item.id);
  else
    v_work_order_part_id := v_line.work_order_part_id;
  end if;

  update public.purchase_order_lines
  set part_id = v_part_id,
      work_order_part_id = coalesce(work_order_part_id, v_work_order_part_id),
      location_id = v_truck.stock_location_id
  where id = v_line.id;

  v_operation_id := md5(
    p_shop_id::text || ':field-po-receive:' || trim(p_operation_key)
  )::uuid;

  v_result := private.profixiq_receive_po_line_to_location_atomic(
    p_shop_id,
    p_purchase_order_id,
    p_purchase_order_line_id,
    v_part_id,
    v_truck.stock_location_id,
    p_quantity,
    p_actor_user_id,
    v_operation_id
  );

  v_move_id := nullif(
    coalesce(v_result ->> 'move_id', v_result ->> 'stock_move_id'),
    ''
  )::uuid;
  if v_move_id is not null then
    update public.stock_moves
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'field_service', true,
      'service_vehicle_id', p_service_vehicle_id,
      'truck_stock_location_id', v_truck.stock_location_id,
      'direct_to_truck', true
    )
    where id = v_move_id
      and shop_id = p_shop_id;
  end if;

  return v_result || jsonb_build_object(
    'serviceVehicleId', p_service_vehicle_id,
    'truckStockLocationId', v_truck.stock_location_id,
    'purchaseOrderLineId', p_purchase_order_line_id,
    'partId', v_part_id,
    'workOrderPartId', v_work_order_part_id,
    'directToTruck', true
  );
end;
$$;

commit;
