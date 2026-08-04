begin;

-- The work_order_lines trigger runs as the authenticated shop user. The
-- invoice hardening migration correctly removed unrestricted access to this
-- SECURITY DEFINER helper, but the trigger still needs to execute it. Restore
-- that path with an explicit tenant-membership guard so direct RPC calls
-- cannot recompute another shop's invoice.
-- This helper exists only in the production schema drift currently being
-- reconciled. Keep clean database replay unchanged until that schema is
-- promoted into the canonical baseline.
do $migration$
begin
  if to_regprocedure('public.recompute_live_invoice_costs(uuid)') is null then
    return;
  end if;

  execute $ddl$
create or replace function public.recompute_live_invoice_costs(
  p_work_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role',
    ''
  );
  v_shop_id uuid;
  v_invoice_id uuid;
  v_labor numeric;
  v_parts numeric;
begin
  select wo.shop_id
    into v_shop_id
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_shop_id is null then
    return;
  end if;

  if v_jwt_role <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    if v_actor_user_id is null
       or not exists (
         select 1
         from public.profiles p
         where p.shop_id = v_shop_id
           and (
             p.id = v_actor_user_id
             or p.user_id = v_actor_user_id
           )
       ) then
      raise exception 'Forbidden'
        using errcode = '42501';
    end if;
  end if;

  v_invoice_id := public.get_live_invoice_id(p_work_order_id);
  if v_invoice_id is null then
    return;
  end if;

  v_labor := public.compute_labor_cost_for_work_order(p_work_order_id);
  v_parts := public.compute_parts_cost_for_work_order(p_work_order_id);

  update public.invoices
    set labor_cost = v_labor,
        parts_cost = v_parts
  where id = v_invoice_id;
end;
$function$;

$ddl$;

  execute 'revoke all on function public.recompute_live_invoice_costs(uuid) from public, anon';
  execute 'grant execute on function public.recompute_live_invoice_costs(uuid) to authenticated, service_role';
end
$migration$;

commit;
