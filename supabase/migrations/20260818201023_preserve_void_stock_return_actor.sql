begin;

-- The line-void route authorizes the caller, then invokes this command through
-- the service-role client. The nested return helper therefore sees a null
-- auth.uid(). Preserve the already-authorized actor on the stock ledger row
-- without changing the canonical return-to-stock contract used elsewhere.
do $migration$
declare
  v_signature constant text :=
    'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)';
  v_definition text;
  v_original_call constant text := $original_call$
        perform public.parts_return_to_stock(
          v_wop.id,
          v_location.location_id,
          v_location.qty,
          p_operation_key || ':return:' || v_wop.id::text || ':' || v_location.location_id::text
        );
$original_call$;
  v_attributed_call constant text := $attributed_call$
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
$attributed_call$;
begin
  if to_regprocedure(v_signature) is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'VOID_STOCK_RETURN_ACTOR_FAILED: canonical line-void command is missing';
  end if;

  select pg_get_functiondef(to_regprocedure(v_signature))
  into v_definition;

  if position(v_original_call in v_definition) = 0 then
    if position('set created_by = p_actor_user_id' in v_definition) > 0 then
      -- Replay-safe if this repair was applied manually before its ledger entry.
      return;
    end if;

    raise exception
      using
        errcode = 'P0001',
        message = 'VOID_STOCK_RETURN_ACTOR_FAILED: canonical return call has an unexpected shape';
  end if;

  v_definition := replace(v_definition, v_original_call, v_attributed_call);
  execute v_definition;
end;
$migration$;

-- Reassert the boundary established by the preceding RPC-hardening migration.
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

  if position('set created_by = p_actor_user_id' in v_definition) = 0
     or position('sm.shop_id = p_shop_id' in v_definition) = 0
     or position('sm.created_by is null' in v_definition) = 0 then
    raise exception
      using
        errcode = 'P0001',
        message = 'VOID_STOCK_RETURN_ACTOR_FAILED: ledger attribution repair is missing';
  end if;

  if has_function_privilege('public', v_signature, 'EXECUTE')
     or has_function_privilege('anon', v_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception
      using
        errcode = 'P0001',
        message = 'VOID_STOCK_RETURN_ACTOR_FAILED: line-void ACL is unsafe';
  end if;
end;
$postcheck$;

notify pgrst, 'reload schema';

commit;
