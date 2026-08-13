begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

create or replace function public.field_use_truck_part_atomic(
  p_shop_id uuid,
  p_service_visit_id uuid,
  p_work_order_line_id uuid,
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
  v_visit public.service_visits%rowtype;
  v_truck public.service_vehicles%rowtype;
  v_result jsonb;
  v_stock_move_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select * into v_actor
  from private.profixiq_field_inventory_actor_context(
    p_shop_id,
    p_actor_user_id
  );
  if not found or not v_actor.has_field_access then
    raise exception using errcode = '42501', message = 'Field Service access is required.';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 4) then
    raise exception using errcode = '22023', message = 'Use quantity must be positive with at most four decimal places.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;

  select * into v_visit
  from public.service_visits visit
  where visit.id = p_service_visit_id
    and visit.shop_id = p_shop_id
  for update;
  if not found
     or v_visit.mode <> 'mobile'
     or v_visit.assigned_user_id is distinct from v_actor.profile_id then
    raise exception using errcode = '42501', message = 'The service call is not assigned to this field technician.';
  end if;
  if v_visit.status not in ('arrived','working','paused') then
    raise exception using errcode = '55000', message = 'Arrive at the service call before using truck inventory.';
  end if;
  if v_visit.work_order_id is null then
    raise exception using errcode = '55000', message = 'Create or link the repair before using a part.';
  end if;
  if v_visit.service_vehicle_id is null then
    raise exception using errcode = '55000', message = 'Assign a service truck before using truck inventory.';
  end if;

  select * into v_truck
  from public.service_vehicles vehicle
  where vehicle.id = v_visit.service_vehicle_id
    and vehicle.shop_id = p_shop_id
    and vehicle.active
  for update;
  if not found or v_truck.stock_location_id is null then
    raise exception using errcode = '55000', message = 'The assigned service truck has no inventory location.';
  end if;

  if not exists (
    select 1
    from public.work_order_lines line
    where line.id = p_work_order_line_id
      and line.shop_id = p_shop_id
      and line.work_order_id = v_visit.work_order_id
      and line.voided_at is null
  ) then
    raise exception using errcode = '42501', message = 'The repair line is outside this service call.';
  end if;

  v_result := public.parts_issue_by_line_part_atomic(
    p_shop_id,
    p_work_order_line_id,
    p_part_id,
    v_truck.stock_location_id,
    p_quantity,
    p_shop_id::text || ':field-use:' || trim(p_operation_key),
    p_actor_user_id
  );

  v_stock_move_id := nullif(v_result ->> 'stock_move_id', '')::uuid;
  if v_stock_move_id is not null then
    update public.stock_moves
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'field_service', true,
      'service_visit_id', p_service_visit_id,
      'service_vehicle_id', v_truck.id,
      'truck_stock_location_id', v_truck.stock_location_id,
      'work_order_id', v_visit.work_order_id,
      'work_order_line_id', p_work_order_line_id,
      'canonical_part_id', p_part_id
    )
    where id = v_stock_move_id
      and shop_id = p_shop_id;
  end if;

  return v_result || jsonb_build_object(
    'serviceVisitId', p_service_visit_id,
    'serviceVehicleId', v_truck.id,
    'truckStockLocationId', v_truck.stock_location_id,
    'workOrderId', v_visit.work_order_id,
    'workOrderLineId', p_work_order_line_id,
    'partId', p_part_id
  );
end;
$$;

create or replace function public.field_return_truck_part_atomic(
  p_shop_id uuid,
  p_service_visit_id uuid,
  p_work_order_part_id uuid,
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
  v_visit public.service_visits%rowtype;
  v_truck public.service_vehicles%rowtype;
  v_work_part public.work_order_parts%rowtype;
  v_result jsonb;
  v_stock_move_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select * into v_actor
  from private.profixiq_field_inventory_actor_context(
    p_shop_id,
    p_actor_user_id
  );
  if not found or not v_actor.has_field_access then
    raise exception using errcode = '42501', message = 'Field Service access is required.';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 4) then
    raise exception using errcode = '22023', message = 'Return quantity must be positive with at most four decimal places.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;

  select * into v_visit
  from public.service_visits visit
  where visit.id = p_service_visit_id
    and visit.shop_id = p_shop_id
  for update;
  if not found
     or v_visit.mode <> 'mobile'
     or v_visit.assigned_user_id is distinct from v_actor.profile_id
     or v_visit.work_order_id is null
     or v_visit.service_vehicle_id is null then
    raise exception using errcode = '42501', message = 'The service call is not assigned to this field technician.';
  end if;

  select * into v_truck
  from public.service_vehicles vehicle
  where vehicle.id = v_visit.service_vehicle_id
    and vehicle.shop_id = p_shop_id
    and vehicle.active
  for update;
  if not found or v_truck.stock_location_id is null then
    raise exception using errcode = '55000', message = 'The assigned service truck has no inventory location.';
  end if;

  select * into v_work_part
  from public.work_order_parts work_part
  where work_part.id = p_work_order_part_id
    and work_part.shop_id = p_shop_id
    and work_part.work_order_id = v_visit.work_order_id
    and work_part.is_active
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Work-order part not found for this service call.';
  end if;

  v_result := public.parts_return_to_stock(
    p_work_order_part_id,
    v_truck.stock_location_id,
    p_quantity,
    p_shop_id::text || ':field-return:' || trim(p_operation_key)
  );

  v_stock_move_id := nullif(v_result ->> 'stock_move_id', '')::uuid;
  if v_stock_move_id is not null then
    update public.stock_moves
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'field_service', true,
      'service_visit_id', p_service_visit_id,
      'service_vehicle_id', v_truck.id,
      'truck_stock_location_id', v_truck.stock_location_id,
      'work_order_id', v_visit.work_order_id,
      'work_order_part_id', p_work_order_part_id,
      'canonical_part_id', v_work_part.part_id
    )
    where id = v_stock_move_id
      and shop_id = p_shop_id;
  end if;

  return v_result || jsonb_build_object(
    'serviceVisitId', p_service_visit_id,
    'serviceVehicleId', v_truck.id,
    'truckStockLocationId', v_truck.stock_location_id,
    'workOrderId', v_visit.work_order_id,
    'workOrderPartId', p_work_order_part_id,
    'partId', v_work_part.part_id
  );
end;
$$;

revoke all on function private.profixiq_field_inventory_actor_context(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.profixiq_field_inventory_actor_can_use_truck(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.profixiq_validate_part_external_identity()
  from public, anon, authenticated, service_role;
revoke all on function private.profixiq_validate_integration_scope()
  from public, anon, authenticated, service_role;

revoke all on function public.field_resolve_or_create_part_identity_atomic(
  uuid,uuid,text,text,text,uuid,uuid,text,text,text,text,text,numeric,boolean,numeric,numeric,jsonb,text
) from public, anon;
grant execute on function public.field_resolve_or_create_part_identity_atomic(
  uuid,uuid,text,text,text,uuid,uuid,text,text,text,text,text,numeric,boolean,numeric,numeric,jsonb,text
) to authenticated, service_role;

revoke all on function public.field_truck_inventory_snapshot(uuid,uuid,uuid,uuid,text)
  from public, anon;
grant execute on function public.field_truck_inventory_snapshot(uuid,uuid,uuid,uuid,text)
  to authenticated, service_role;

revoke all on function public.field_transfer_stock_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) from public, anon;
grant execute on function public.field_transfer_stock_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) to authenticated, service_role;

revoke all on function public.field_receive_po_part_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) from public, anon;
grant execute on function public.field_receive_po_part_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) to authenticated, service_role;

revoke all on function public.field_use_truck_part_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) from public, anon;
grant execute on function public.field_use_truck_part_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) to authenticated, service_role;

revoke all on function public.field_return_truck_part_atomic(
  uuid,uuid,uuid,numeric,uuid,text
) from public, anon;
grant execute on function public.field_return_truck_part_atomic(
  uuid,uuid,uuid,numeric,uuid,text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
