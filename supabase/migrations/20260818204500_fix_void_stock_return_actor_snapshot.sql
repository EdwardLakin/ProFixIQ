begin;

-- A preview of 20260818201023 used a data-modifying helper call and the
-- attribution UPDATE in one SQL statement. PostgreSQL's statement snapshot can
-- hide the helper's newly inserted row from that UPDATE. Convert the repair to
-- two PL/pgSQL statements and keep this migration replay-safe when the corrected
-- 20260818201023 definition has already been applied.
do $migration$
declare
  v_signature constant text :=
    'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)';
  v_definition text;
  v_stale_call constant text := $stale_call$
        with returned_move as materialized (
          select public.parts_return_to_stock(
            v_wop.id,
            v_location.location_id,
            v_location.qty,
            p_operation_key || ':return:' || v_wop.id::text || ':' || v_location.location_id::text
          ) as result
        )
        update public.stock_moves as sm
        set created_by = p_actor_user_id
        from returned_move
        where sm.id = nullif(returned_move.result ->> 'stock_move_id', '')::uuid
          and sm.shop_id = p_shop_id
          and sm.created_by is null;
$stale_call$;
  v_fixed_call constant text := $fixed_call$
        declare
          v_return_result jsonb;
        begin
          v_return_result := public.parts_return_to_stock(
            v_wop.id,
            v_location.location_id,
            v_location.qty,
            p_operation_key || ':return:' || v_wop.id::text || ':' || v_location.location_id::text
          );

          update public.stock_moves as sm
          set created_by = p_actor_user_id
          where sm.id = nullif(v_return_result ->> 'stock_move_id', '')::uuid
            and sm.shop_id = p_shop_id
            and sm.created_by is null;
        end;
$fixed_call$;
begin
  if to_regprocedure(v_signature) is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'VOID_STOCK_RETURN_ACTOR_SNAPSHOT_FIX_FAILED: canonical line-void command is missing';
  end if;

  select pg_get_functiondef(to_regprocedure(v_signature))
  into v_definition;

  if position(v_fixed_call in v_definition) > 0 then
    return;
  end if;

  if position(v_stale_call in v_definition) = 0 then
    raise exception
      using
        errcode = 'P0001',
        message = 'VOID_STOCK_RETURN_ACTOR_SNAPSHOT_FIX_FAILED: return attribution has an unexpected shape';
  end if;

  v_definition := replace(v_definition, v_stale_call, v_fixed_call);
  execute v_definition;
end;
$migration$;

revoke execute on function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to service_role;

do $postcheck$
declare
  v_signature constant text :=
    'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)';
  v_definition text;
begin
  select pg_get_functiondef(to_regprocedure(v_signature))
  into v_definition;

  if position('v_return_result := public.parts_return_to_stock' in v_definition) = 0
     or position('set created_by = p_actor_user_id' in v_definition) = 0
     or position('sm.shop_id = p_shop_id' in v_definition) = 0
     or position('sm.created_by is null' in v_definition) = 0 then
    raise exception
      using
        errcode = 'P0001',
        message = 'VOID_STOCK_RETURN_ACTOR_SNAPSHOT_FIX_FAILED: two-statement repair is missing';
  end if;

  if has_function_privilege('anon', v_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception
      using
        errcode = 'P0001',
        message = 'VOID_STOCK_RETURN_ACTOR_SNAPSHOT_FIX_FAILED: line-void ACL is unsafe';
  end if;
end;
$postcheck$;

notify pgrst, 'reload schema';

commit;
