begin;

-- Repair production ACL drift without broadening the public API surface. The
-- work_order_lines trigger runs in the authenticated shop user's transaction
-- and must be able to invoke this tenant-guarded SECURITY DEFINER helper.
-- Keep clean replay compatible with environments where this legacy helper is
-- absent.
do $migration$
begin
  if to_regprocedure('public.recompute_live_invoice_costs(uuid)') is null then
    return;
  end if;

  execute 'revoke all on function public.recompute_live_invoice_costs(uuid) from public, anon';
  execute 'grant execute on function public.recompute_live_invoice_costs(uuid) to authenticated, service_role';
end
$migration$;

commit;
