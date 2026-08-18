begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Forward-only production reconciliation for the already-applied Phase 3
-- migration. Preserve every existing function and schema object. The original
-- paired/idempotent transfer command becomes service-role-only, while the
-- additive endpoint performs actor and Parts-capability authorization before
-- delegating to it.
revoke all on function public.field_transfer_stock_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) from public, anon, authenticated;
grant execute on function public.field_transfer_stock_to_truck_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) to service_role;

create or replace function public.field_transfer_stock_to_truck_authorized_atomic(
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

  return public.field_transfer_stock_to_truck_atomic(
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

revoke all on function public.field_transfer_stock_to_truck_authorized_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) from public, anon;
grant execute on function public.field_transfer_stock_to_truck_authorized_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) to authenticated, service_role;

comment on function public.field_transfer_stock_to_truck_authorized_atomic(
  uuid,uuid,uuid,uuid,numeric,uuid,text
) is
  'Additive Parts-authorized Field command that delegates to the preserved canonical paired truck-transfer ledger implementation.';

notify pgrst, 'reload schema';

commit;
