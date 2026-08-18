begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- The snapshot is read-only. Marking it STABLE makes every query executed by
-- the snapshot use the calling statement's MVCC snapshot. The additive
-- wrapper below can therefore return quantities and activity that describe
-- the same database state without changing the existing snapshot contract.
alter function public.field_truck_inventory_snapshot(uuid,uuid,uuid,uuid,text)
  stable;

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
        'quantity', case
          when move.reason in ('wo_allocate', 'wo_release')
            then abs(coalesce(move.lifecycle_quantity, 0))
          else abs(move.qty_change)
        end,
        'direction', case
          when move.reason = 'wo_allocate' then 'out'
          when move.reason = 'wo_release' then 'in'
          when move.qty_change >= 0 then 'in'
          else 'out'
        end,
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

create or replace function public.field_truck_inventory_snapshot_with_activity(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_service_visit_id uuid default null,
  p_service_vehicle_id uuid default null,
  p_query text default null,
  p_activity_limit integer default 50
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_service_vehicle_id uuid;
  v_activity jsonb := '[]'::jsonb;
begin
  v_snapshot := public.field_truck_inventory_snapshot(
    p_shop_id,
    p_actor_user_id,
    p_service_visit_id,
    p_service_vehicle_id,
    p_query
  );

  v_service_vehicle_id := nullif(v_snapshot -> 'truck' ->> 'id', '')::uuid;
  if v_service_vehicle_id is not null then
    v_activity := public.field_truck_inventory_activity(
      p_shop_id,
      p_actor_user_id,
      v_service_vehicle_id,
      p_activity_limit
    );
  end if;

  return v_snapshot || jsonb_build_object('movements', v_activity);
end;
$$;

revoke all on function public.field_truck_inventory_snapshot_with_activity(
  uuid,uuid,uuid,uuid,text,integer
) from public, anon;
grant execute on function public.field_truck_inventory_snapshot_with_activity(
  uuid,uuid,uuid,uuid,text,integer
) to authenticated, service_role;

comment on function public.field_truck_inventory_snapshot_with_activity(
  uuid,uuid,uuid,uuid,text,integer
) is
  'Returns the authorized Field truck snapshot and movement ledger from one stable MVCC snapshot.';

do $postcheck$
begin
  if not exists (
    select 1
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'field_truck_inventory_snapshot'
      and pg_get_function_identity_arguments(proc.oid) = 'p_shop_id uuid, p_actor_user_id uuid, p_service_visit_id uuid, p_service_vehicle_id uuid, p_query text'
      and proc.provolatile = 's'
  ) then
    raise exception 'field_truck_inventory_snapshot must be STABLE';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.field_truck_inventory_snapshot_with_activity(uuid,uuid,uuid,uuid,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.field_truck_inventory_snapshot_with_activity(uuid,uuid,uuid,uuid,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'field_truck_inventory_snapshot_with_activity ACL mismatch';
  end if;
end;
$postcheck$;

notify pgrst, 'reload schema';

commit;
