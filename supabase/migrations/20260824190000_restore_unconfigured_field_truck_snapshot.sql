begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Truck inventory is optional configuration. The activity projection added in
-- 20260818184534 must not turn a valid truck-without-inventory snapshot into a
-- fatal route error. Preserve the canonical snapshot and return an empty
-- movement ledger until the truck has a stock location.
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
  v_stock_location_id uuid;
  v_activity jsonb := '[]'::jsonb;
begin
  v_snapshot := public.field_truck_inventory_snapshot(
    p_shop_id,
    p_actor_user_id,
    p_service_visit_id,
    p_service_vehicle_id,
    p_query
  );

  v_service_vehicle_id :=
    nullif(v_snapshot -> 'truck' ->> 'id', '')::uuid;
  v_stock_location_id :=
    nullif(v_snapshot -> 'truck' ->> 'stockLocationId', '')::uuid;

  if v_service_vehicle_id is not null
     and v_stock_location_id is not null then
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
  'Returns the authorized Field truck snapshot and same-snapshot movement ledger; unconfigured truck inventory has an empty ledger.';

do $postcheck$
begin
  if not has_function_privilege(
    'authenticated',
    'public.field_truck_inventory_snapshot_with_activity(uuid,uuid,uuid,uuid,text,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.field_truck_inventory_snapshot_with_activity(uuid,uuid,uuid,uuid,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.field_truck_inventory_snapshot_with_activity(uuid,uuid,uuid,uuid,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'field_truck_inventory_snapshot_with_activity ACL mismatch';
  end if;

  if not exists (
    select 1
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'field_truck_inventory_snapshot_with_activity'
      and pg_get_function_identity_arguments(proc.oid) =
        'p_shop_id uuid, p_actor_user_id uuid, p_service_visit_id uuid, p_service_vehicle_id uuid, p_query text, p_activity_limit integer'
      and proc.provolatile = 's'
      and not proc.prosecdef
  ) then
    raise exception 'field_truck_inventory_snapshot_with_activity execution contract mismatch';
  end if;
end;
$postcheck$;

notify pgrst, 'reload schema';

commit;
