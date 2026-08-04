begin;

-- The work_order_lines trigger runs as the authenticated shop user. The
-- invoice hardening migration correctly removed unrestricted access to this
-- SECURITY DEFINER helper, but the trigger still needs to execute it. Restore
-- that path with an explicit tenant-membership guard so direct RPC calls
-- cannot recompute another shop's invoice.
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
         from public.user_shops us
         where us.user_id = v_actor_user_id
           and us.shop_id = v_shop_id
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

revoke all on function public.recompute_live_invoice_costs(uuid)
  from public, anon;
grant execute on function public.recompute_live_invoice_costs(uuid)
  to authenticated, service_role;

commit;

