begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

create or replace function public.field_truck_inventory_snapshot(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_service_visit_id uuid default null,
  p_service_vehicle_id uuid default null,
  p_query text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_visit public.service_visits%rowtype;
  v_truck public.service_vehicles%rowtype;
  v_query text := nullif(trim(p_query), '');
  v_items jsonb := '[]'::jsonb;
  v_catalog jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_locations jsonb := '[]'::jsonb;
  v_trucks jsonb := '[]'::jsonb;
  v_recent_uses jsonb := '[]'::jsonb;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select * into v_actor
  from private.profixiq_field_inventory_actor_context(
    p_shop_id,
    p_actor_user_id
  );
  if not found or not v_actor.can_view_field then
    raise exception using errcode = '42501', message = 'Field inventory access is required.';
  end if;

  if p_service_visit_id is not null then
    select * into v_visit
    from public.service_visits visit
    where visit.id = p_service_visit_id
      and visit.shop_id = p_shop_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Service visit not found.';
    end if;
    if not v_actor.can_manage_parts
       and (
         v_visit.mode <> 'mobile'
         or v_visit.assigned_user_id is distinct from v_actor.profile_id
       ) then
      raise exception using errcode = '42501', message = 'This Field Service visit is assigned to another technician.';
    end if;
  elsif v_actor.has_field_access then
    select * into v_visit
    from public.service_visits visit
    where visit.shop_id = p_shop_id
      and visit.assigned_user_id = v_actor.profile_id
      and visit.mode = 'mobile'
      and visit.status not in ('completed','cancelled')
    order by
      case visit.status
        when 'working' then 0
        when 'paused' then 1
        when 'arrived' then 2
        when 'en_route' then 3
        when 'dispatched' then 4
        else 5
      end,
      visit.scheduled_start nulls last,
      visit.created_at
    limit 1;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', vehicle.id,
      'name', vehicle.name,
      'unitNumber', vehicle.unit_number,
      'stockLocationId', vehicle.stock_location_id,
      'primaryUserId', vehicle.primary_user_id,
      'active', vehicle.active
    ) order by vehicle.name, vehicle.unit_number, vehicle.id
  ), '[]'::jsonb)
  into v_trucks
  from public.service_vehicles vehicle
  where vehicle.shop_id = p_shop_id
    and vehicle.active
    and vehicle.stock_location_id is not null
    and (
      v_actor.can_manage_parts
      or vehicle.primary_user_id = v_actor.profile_id
      or exists (
        select 1
        from public.service_visits assigned_visit
        where assigned_visit.shop_id = p_shop_id
          and assigned_visit.mode = 'mobile'
          and assigned_visit.assigned_user_id = v_actor.profile_id
          and assigned_visit.service_vehicle_id = vehicle.id
          and assigned_visit.status not in ('completed','cancelled')
      )
    );

  if p_service_vehicle_id is not null then
    if not private.profixiq_field_inventory_actor_can_use_truck(
      p_shop_id,
      p_actor_user_id,
      p_service_vehicle_id
    ) then
      raise exception using errcode = '42501', message = 'This truck is not available to the authenticated actor.';
    end if;
    select * into v_truck
    from public.service_vehicles vehicle
    where vehicle.id = p_service_vehicle_id
      and vehicle.shop_id = p_shop_id
      and vehicle.active;
  elsif v_visit.service_vehicle_id is not null then
    select * into v_truck
    from public.service_vehicles vehicle
    where vehicle.id = v_visit.service_vehicle_id
      and vehicle.shop_id = p_shop_id
      and vehicle.active;
  end if;

  if v_truck.id is null then
    select * into v_truck
    from public.service_vehicles vehicle
    where vehicle.shop_id = p_shop_id
      and vehicle.primary_user_id = v_actor.profile_id
      and vehicle.active
    order by vehicle.updated_at desc, vehicle.id
    limit 1;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', location.id,
      'code', location.code,
      'name', location.name,
      'serviceVehicleId', vehicle.id,
      'serviceVehicleName', vehicle.name,
      'serviceVehicleUnitNumber', vehicle.unit_number
    ) order by location.code, location.name
  ), '[]'::jsonb)
  into v_locations
  from public.stock_locations location
  left join public.service_vehicles vehicle
    on vehicle.shop_id = location.shop_id
   and vehicle.stock_location_id = location.id
   and vehicle.active
  where location.shop_id = p_shop_id;

  if v_truck.id is not null and v_truck.stock_location_id is not null then
    select coalesce(jsonb_agg(item.payload order by item.sort_name), '[]'::jsonb)
    into v_items
    from (
      select
        lower(coalesce(part.name, part.part_number, part.sku, part.id::text)) as sort_name,
        jsonb_build_object(
          'partId', part.id,
          'name', coalesce(nullif(trim(part.name), ''), 'Part'),
          'description', part.description,
          'partNumber', part.part_number,
          'sku', part.sku,
          'manufacturer', part.manufacturer,
          'supplier', part.supplier,
          'onHand', stock.qty_on_hand,
          'reserved', stock.qty_reserved,
          'available', stock.qty_available,
          'barcodes', coalesce((
            select jsonb_agg(distinct barcode.barcode)
            from public.parts_barcodes barcode
            where barcode.shop_id = p_shop_id
              and barcode.part_id = part.id
          ), '[]'::jsonb),
          'identities', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', identity.id,
                'provider', identity.provider,
                'externalId', identity.external_id,
                'supplierId', identity.supplier_id,
                'supplierSku', identity.supplier_sku,
                'barcode', identity.barcode,
                'partNumber', identity.part_number,
                'manufacturer', identity.manufacturer,
                'unitOfMeasure', identity.unit_of_measure,
                'packageQuantity', identity.package_quantity
              ) order by identity.provider, identity.updated_at desc
            )
            from public.part_external_identities identity
            where identity.shop_id = p_shop_id
              and identity.part_id = part.id
              and identity.active
          ), '[]'::jsonb)
        ) as payload
      from public.v_part_stock stock
      join public.parts part
        on part.id = stock.part_id
       and part.shop_id = p_shop_id
      where stock.location_id = v_truck.stock_location_id
        and (
          coalesce(stock.qty_on_hand, 0) <> 0
          or coalesce(stock.qty_reserved, 0) <> 0
        )
      order by lower(coalesce(part.name, part.part_number, part.sku, part.id::text))
      limit 300
    ) item;

    select coalesce(jsonb_agg(use_row.payload order by use_row.created_at desc), '[]'::jsonb)
    into v_recent_uses
    from (
      select
        move.created_at,
        jsonb_build_object(
          'stockMoveId', move.id,
          'workOrderPartId', move.work_order_part_id,
          'workOrderLineId', work_part.work_order_line_id,
          'partId', move.part_id,
          'name', coalesce(part.name, work_part.description_snapshot, 'Part'),
          'partNumber', coalesce(part.part_number, work_part.part_number_snapshot),
          'quantity', abs(move.qty_change),
          'createdAt', move.created_at,
          'returnedQuantity', coalesce((
            select sum(return_move.qty_change)
            from public.stock_moves return_move
            where return_move.shop_id = move.shop_id
              and return_move.work_order_part_id = move.work_order_part_id
              and return_move.location_id = move.location_id
              and return_move.reason = 'return'
          ), 0)
        ) as payload
      from public.stock_moves move
      join public.work_order_parts work_part
        on work_part.id = move.work_order_part_id
       and work_part.shop_id = move.shop_id
      left join public.parts part
        on part.id = move.part_id
       and part.shop_id = move.shop_id
      where move.shop_id = p_shop_id
        and move.location_id = v_truck.stock_location_id
        and move.reason = 'consume'
        and (
          v_visit.work_order_id is null
          or work_part.work_order_id = v_visit.work_order_id
        )
      order by move.created_at desc
      limit 30
    ) use_row;
  end if;

  if v_visit.work_order_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', line.id,
        'lineNumber', line.line_no,
        'description', coalesce(
          nullif(trim(line.description), ''),
          nullif(trim(line.complaint), ''),
          'Repair line'
        ),
        'status', coalesce(line.status, line.line_status),
        'approvalState', line.approval_state,
        'assignedTechnicianId', coalesce(line.assigned_tech_id, line.assigned_to)
      ) order by line.line_no nulls last, line.created_at, line.id
    ), '[]'::jsonb)
    into v_lines
    from public.work_order_lines line
    where line.shop_id = p_shop_id
      and line.work_order_id = v_visit.work_order_id
      and line.voided_at is null;
  end if;

  if v_truck.id is not null and v_truck.stock_location_id is not null then
    select coalesce(jsonb_agg(receipt.payload order by receipt.created_at, receipt.line_id), '[]'::jsonb)
    into v_receipts
    from (
      select
        line.created_at,
        line.id as line_id,
        jsonb_build_object(
          'purchaseOrderId', purchase_order.id,
          'purchaseOrderNumber', coalesce(purchase_order.po_number, purchase_order.id::text),
          'purchaseOrderStatus', purchase_order.status,
          'purchaseOrderLineId', line.id,
          'partId', line.part_id,
          'requiresCanonicalIdentity', line.part_id is null,
          'description', coalesce(part.name, line.description, 'Part'),
          'partNumber', part.part_number,
          'sku', coalesce(line.sku, part.sku),
          'orderedQuantity', line.qty,
          'receivedQuantity', line.received_qty,
          'remainingQuantity', greatest(
            coalesce(line.qty, 0)
              - coalesce(line.cancelled_qty, 0)
              - coalesce(line.received_qty, 0),
            0
          ),
          'targetLocationId', line.location_id,
          'truckTargeted', line.location_id = v_truck.stock_location_id
        ) as payload
      from public.purchase_order_lines line
      join public.purchase_orders purchase_order
        on purchase_order.id = line.po_id
       and purchase_order.shop_id = p_shop_id
      left join public.parts part
        on part.id = line.part_id
       and part.shop_id = purchase_order.shop_id
      where greatest(
          coalesce(line.qty, 0)
            - coalesce(line.cancelled_qty, 0)
            - coalesce(line.received_qty, 0),
          0
        ) > 0
        and lower(coalesce(purchase_order.status, '')) not in (
          'received','closed','cancelled','canceled','void'
        )
      order by line.created_at, line.id
      limit 100
    ) receipt;
  end if;

  if v_query is not null then
    select coalesce(jsonb_agg(catalog.payload order by catalog.sort_name), '[]'::jsonb)
    into v_catalog
    from (
      select
        lower(coalesce(part.name, part.part_number, part.sku, part.id::text)) as sort_name,
        jsonb_build_object(
          'partId', part.id,
          'name', coalesce(nullif(trim(part.name), ''), 'Part'),
          'description', part.description,
          'partNumber', part.part_number,
          'sku', part.sku,
          'manufacturer', part.manufacturer,
          'supplier', part.supplier,
          'barcodes', coalesce((
            select jsonb_agg(distinct barcode.barcode)
            from public.parts_barcodes barcode
            where barcode.shop_id = p_shop_id
              and barcode.part_id = part.id
          ), '[]'::jsonb),
          'locations', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'locationId', location.id,
                'code', location.code,
                'name', location.name,
                'onHand', stock.qty_on_hand,
                'reserved', stock.qty_reserved,
                'available', stock.qty_available,
                'serviceVehicleId', vehicle.id,
                'serviceVehicleName', vehicle.name
              ) order by location.code, location.name
            )
            from public.v_part_stock stock
            join public.stock_locations location
              on location.id = stock.location_id
             and location.shop_id = p_shop_id
            left join public.service_vehicles vehicle
              on vehicle.shop_id = location.shop_id
             and vehicle.stock_location_id = location.id
             and vehicle.active
            where stock.part_id = part.id
              and (
                coalesce(stock.qty_on_hand, 0) <> 0
                or coalesce(stock.qty_reserved, 0) <> 0
              )
          ), '[]'::jsonb)
        ) as payload
      from public.parts part
      where part.shop_id = p_shop_id
        and lower(concat_ws(
          ' ',
          part.name,
          part.description,
          part.part_number,
          part.sku,
          part.manufacturer,
          part.supplier
        )) like '%' || lower(v_query) || '%'
      order by lower(coalesce(part.name, part.part_number, part.sku, part.id::text))
      limit 60
    ) catalog;
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'actorProfileId', v_actor.profile_id,
    'canManageParts', v_actor.can_manage_parts,
    'hasFieldAccess', v_actor.has_field_access,
    'visit', case
      when v_visit.id is null then null
      else jsonb_build_object(
        'id', v_visit.id,
        'status', v_visit.status,
        'mode', v_visit.mode,
        'workOrderId', v_visit.work_order_id,
        'serviceVehicleId', v_visit.service_vehicle_id,
        'assignedTechnicianId', v_visit.assigned_user_id,
        'scheduledStart', v_visit.scheduled_start,
        'scheduledEnd', v_visit.scheduled_end
      )
    end,
    'trucks', v_trucks,
    'truck', case
      when v_truck.id is null then null
      else jsonb_build_object(
        'id', v_truck.id,
        'name', v_truck.name,
        'unitNumber', v_truck.unit_number,
        'stockLocationId', v_truck.stock_location_id,
        'primaryUserId', v_truck.primary_user_id,
        'active', v_truck.active
      )
    end,
    'workOrderLines', v_lines,
    'items', v_items,
    'catalog', v_catalog,
    'openReceipts', v_receipts,
    'locations', v_locations,
    'recentUses', v_recent_uses
  );
end;
$$;


commit;
