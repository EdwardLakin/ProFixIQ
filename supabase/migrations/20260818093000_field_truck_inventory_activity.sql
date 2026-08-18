begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Stock loading is a Parts-management command. Keep the existing paired,
-- idempotent ledger implementation private and put the capability check at the
-- database boundary so direct Data API RPC calls cannot bypass the route guard.
alter function public.field_transfer_stock_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) rename to field_transfer_stock_to_truck_atomic_impl;

alter function public.field_transfer_stock_to_truck_atomic_impl(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) set schema private;

revoke all on function private.field_transfer_stock_to_truck_atomic_impl(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) from public, anon, authenticated, service_role;

create function public.field_transfer_stock_to_truck_atomic(
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
    raise exception using errcode = '42501', message = 'Parts management permission is required.';
  end if;

  return private.field_transfer_stock_to_truck_atomic_impl(
    p_shop_id,
    p_service_vehicle_id,
    p_source_location_id,
    p_part_id,
    p_quantity,
    p_actor_user_id,
    p_operation_key
  );
end;
$$;

revoke all on function public.field_transfer_stock_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) from public, anon;
grant execute on function public.field_transfer_stock_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) to authenticated, service_role;

comment on function public.field_transfer_stock_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) is
  'Parts-authorized Field command that delegates to the canonical paired truck-transfer ledger implementation.';

create index if not exists stock_moves_shop_location_created_idx
  on public.stock_moves (shop_id, location_id, created_at desc);

create or replace function public.field_truck_inventory_activity(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_service_vehicle_id uuid,
  p_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_truck public.service_vehicles%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_activity jsonb := '[]'::jsonb;
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
  if not found or v_truck.stock_location_id is null then
    raise exception using errcode = 'P0002', message = 'The service truck has no inventory location.';
  end if;

  select coalesce(jsonb_agg(activity.payload order by activity.created_at desc), '[]'::jsonb)
  into v_activity
  from (
    select
      move.created_at,
      jsonb_build_object(
        'id', move.id,
        'partId', move.part_id,
        'partName', coalesce(nullif(trim(part.name), ''), 'Part'),
        'partNumber', coalesce(part.part_number, part.sku),
        'quantity', abs(move.qty_change),
        'direction', case when move.qty_change >= 0 then 'in' else 'out' end,
        'reason', move.reason::text,
        'createdAt', move.created_at,
        'actorName', creator.actor_name,
        'sourceLocationName', source_location.name,
        'destinationLocationName', destination_location.name,
        'purchaseOrderNumber', purchase_order.po_number,
        'workOrderNumber', work_order.custom_id
      ) as payload
    from public.stock_moves move
    join public.parts part
      on part.id = move.part_id
     and part.shop_id = move.shop_id
    left join public.purchase_order_lines purchase_line
      on purchase_line.id = move.purchase_order_line_id
    left join public.purchase_orders purchase_order
      on purchase_order.shop_id = move.shop_id
     and (
       purchase_order.id = purchase_line.po_id
       or (
         move.reference_kind = 'purchase_order'
         and purchase_order.id = move.reference_id
       )
     )
    left join public.work_order_parts work_part
      on work_part.id = move.work_order_part_id
     and work_part.shop_id = move.shop_id
    left join public.work_orders work_order
      on work_order.id = work_part.work_order_id
     and work_order.shop_id = move.shop_id
    left join public.stock_locations source_location
      on source_location.shop_id = move.shop_id
     and source_location.id::text = move.metadata ->> 'source_location_id'
    left join public.stock_locations destination_location
      on destination_location.shop_id = move.shop_id
     and destination_location.id::text = coalesce(
       move.metadata ->> 'destination_location_id',
       move.location_id::text
     )
    left join lateral (
      select coalesce(
        nullif(trim(profile.full_name), ''),
        nullif(trim(profile.email), '')
      ) as actor_name
      from public.profiles profile
      where profile.shop_id = p_shop_id
        and (
          profile.id = move.created_by
          or profile.user_id = move.created_by
        )
      order by (profile.id = move.created_by) desc, profile.id
      limit 1
    ) creator on true
    where move.shop_id = p_shop_id
      and move.location_id = v_truck.stock_location_id
    order by move.created_at desc, move.id desc
    limit v_limit
  ) activity;

  return v_activity;
end;
$$;

revoke all on function public.field_truck_inventory_activity(uuid,uuid,uuid,integer)
  from public, anon;
grant execute on function public.field_truck_inventory_activity(uuid,uuid,uuid,integer)
  to authenticated, service_role;

comment on function public.field_truck_inventory_activity(uuid,uuid,uuid,integer) is
  'Tenant- and truck-scoped Field inventory activity projection over the canonical stock_moves ledger.';

notify pgrst, 'reload schema';

commit;
