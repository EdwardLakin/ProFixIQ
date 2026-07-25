-- P0-002 production compatibility preflight.
--
-- Clean replay includes the historical enum overload below, but at least one
-- deployed schema never created it. The following P0-002 hardening migration
-- revokes this exact signature and must be able to do so on both histories.
-- Create a locked, fail-closed placeholder only when the overload is absent.
-- Do not replace an existing implementation or expose this legacy contract.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)'
  ) is null then
    execute $function$
      create function public.apply_stock_move(
        p_part uuid,
        p_loc uuid,
        p_qty numeric,
        p_reason public.stock_move_reason,
        p_ref_kind text default null,
        p_ref_id uuid default null
      ) returns uuid
      language plpgsql
      security invoker
      set search_path = pg_catalog, public
      as $body$
      begin
        raise exception using
          errcode = '42501',
          message = 'LEGACY_STOCK_MOVE_OVERLOAD_DISABLED';
      end;
      $body$
    $function$;
  end if;

  execute $revoke$
    revoke all privileges on function public.apply_stock_move(
      uuid,
      uuid,
      numeric,
      public.stock_move_reason,
      text,
      uuid
    ) from public, anon, authenticated, service_role
  $revoke$;
end
$migration$;
