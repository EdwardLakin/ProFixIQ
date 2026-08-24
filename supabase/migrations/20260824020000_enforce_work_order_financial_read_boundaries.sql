begin;

-- RLS predicates resolve the canonical staff profile by both supported auth
-- identities and then evaluate the same effective capability chain as the app.
create or replace function public.workspace_actor_is_staff_for_shop(
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
  );
$$;

create or replace function public.workspace_actor_has_capability(
  p_shop_id uuid,
  p_capability_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_granted boolean := false;
begin
  if auth.uid() is null
     or p_shop_id is null
     or nullif(btrim(p_capability_key), '') is null then
    return false;
  end if;

  select profile.id
    into v_profile_id
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = auth.uid() or profile.user_id = auth.uid())
  order by (profile.id = auth.uid()) desc,
           profile.updated_at desc nulls last,
           profile.id
  limit 1;

  if v_profile_id is null then
    return false;
  end if;

  select decision.granted
    into v_granted
  from private.resolve_workspace_profile_capability(
    v_profile_id,
    p_shop_id,
    p_capability_key
  ) decision;

  return coalesce(v_granted, false);
end;
$$;

revoke all on function public.workspace_actor_is_staff_for_shop(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_actor_is_staff_for_shop(uuid)
  to authenticated, service_role;
revoke all on function public.workspace_actor_has_capability(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_actor_has_capability(uuid, text)
  to authenticated, service_role;

-- Mixed operational/financial rows remain readable to durable non-staff
-- customer/fleet policies. Staff readers must have a capability that makes the
-- sell/invoice payload legitimate; actors without it use the server projection.
drop policy if exists work_orders_financial_capability_select
  on public.work_orders;
create policy work_orders_financial_capability_select
on public.work_orders
as restrictive
for select
to authenticated
using (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(
    shop_id,
    'work_order.financial.sell.view'
  )
  or public.workspace_actor_has_capability(shop_id, 'work_order.invoice.view')
);

drop policy if exists work_order_lines_financial_capability_select
  on public.work_order_lines;
create policy work_order_lines_financial_capability_select
on public.work_order_lines
as restrictive
for select
to authenticated
using (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(
    shop_id,
    'work_order.financial.sell.view'
  )
  or public.workspace_actor_has_capability(shop_id, 'work_order.invoice.view')
);

drop policy if exists work_order_quote_lines_financial_capability_select
  on public.work_order_quote_lines;
create policy work_order_quote_lines_financial_capability_select
on public.work_order_quote_lines
as restrictive
for select
to authenticated
using (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(
    shop_id,
    'work_order.financial.sell.view'
  )
  or public.workspace_actor_has_capability(shop_id, 'work_order.invoice.view')
);

drop policy if exists shops_financial_capability_select
  on public.shops;
create policy shops_financial_capability_select
on public.shops
as restrictive
for select
to authenticated
using (
  not public.workspace_actor_is_staff_for_shop(id)
  or public.workspace_actor_has_capability(
    id,
    'work_order.financial.sell.view'
  )
  or public.workspace_actor_has_capability(id, 'work_order.invoice.view')
);

-- Cost-bearing part rows are never a customer/field fallback. Staff need the
-- precise cost capability; canonical parts carry both sell and cost, so direct
-- table reads require both and partial access is served by the projection.
drop policy if exists work_order_part_allocations_financial_capability_select
  on public.work_order_part_allocations;
create policy work_order_part_allocations_financial_capability_select
on public.work_order_part_allocations
as restrictive
for select
to authenticated
using (
  public.workspace_actor_has_capability(
    shop_id,
    'work_order.parts.cost.view'
  )
);

drop policy if exists work_order_parts_financial_capability_select
  on public.work_order_parts;
create policy work_order_parts_financial_capability_select
on public.work_order_parts
as restrictive
for select
to authenticated
using (
  public.workspace_actor_has_capability(
    shop_id,
    'work_order.parts.sell.view'
  )
  and public.workspace_actor_has_capability(
    shop_id,
    'work_order.parts.cost.view'
  )
);

-- Existing portal policies remain independent. Restrictive staff predicates
-- apply only when the authenticated identity resolves to a staff profile.
do $financial_staff_read_policies$
declare
  v_table text;
  v_action text;
begin
  foreach v_table in array array[
    'invoices',
    'invoice_versions',
    'payment_events',
    'payment_receipts',
    'payments',
    'work_order_invoice_reviews'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_workspace_invoice_view',
      v_table
    );
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (
        not public.workspace_actor_is_staff_for_shop(shop_id)
        or public.workspace_actor_has_capability(shop_id, %L)
      )',
      v_table || '_workspace_invoice_view',
      v_table,
      'work_order.invoice.view'
    );
  end loop;
end
$financial_staff_read_policies$;

drop policy if exists invoice_pricing_overrides_workspace_read
  on public.invoice_pricing_overrides;
create policy invoice_pricing_overrides_workspace_read
on public.invoice_pricing_overrides
as restrictive
for select
to authenticated
using (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(
    shop_id,
    'work_order.pricing.edit'
  )
  or public.workspace_actor_has_capability(shop_id, 'work_order.invoice.view')
);

-- Direct authenticated mutations cannot bypass an individual DENY. Service
-- backed canonical routes still bypass RLS only after their capability gate.
do $financial_staff_mutation_policies$
declare
  v_table text;
begin
  foreach v_table in array array[
    'invoices',
    'invoice_versions',
    'payment_events',
    'payment_receipts',
    'payments',
    'work_order_invoice_reviews'
  ]
  loop
    foreach v_action in array array['insert', 'update', 'delete']
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        v_table || '_workspace_invoice_manage_' || v_action,
        v_table
      );
    end loop;
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
       with check (
         not public.workspace_actor_is_staff_for_shop(shop_id)
         or public.workspace_actor_has_capability(shop_id, %L)
       )',
      v_table || '_workspace_invoice_manage_insert',
      v_table,
      'work_order.invoice.manage'
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
       using (
         not public.workspace_actor_is_staff_for_shop(shop_id)
         or public.workspace_actor_has_capability(shop_id, %L)
       )
       with check (
         not public.workspace_actor_is_staff_for_shop(shop_id)
         or public.workspace_actor_has_capability(shop_id, %L)
       )',
      v_table || '_workspace_invoice_manage_update',
      v_table,
      'work_order.invoice.manage',
      'work_order.invoice.manage'
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
       using (
         not public.workspace_actor_is_staff_for_shop(shop_id)
         or public.workspace_actor_has_capability(shop_id, %L)
       )',
      v_table || '_workspace_invoice_manage_delete',
      v_table,
      'work_order.invoice.manage'
    );
  end loop;
end
$financial_staff_mutation_policies$;

drop policy if exists invoice_pricing_overrides_workspace_edit_insert
  on public.invoice_pricing_overrides;
drop policy if exists invoice_pricing_overrides_workspace_edit_update
  on public.invoice_pricing_overrides;
drop policy if exists invoice_pricing_overrides_workspace_edit_delete
  on public.invoice_pricing_overrides;
create policy invoice_pricing_overrides_workspace_edit_insert
on public.invoice_pricing_overrides
as restrictive
for insert
to authenticated
with check (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(
    shop_id,
    'work_order.pricing.edit'
  )
);
create policy invoice_pricing_overrides_workspace_edit_update
on public.invoice_pricing_overrides
as restrictive
for update
to authenticated
using (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(
    shop_id,
    'work_order.pricing.edit'
  )
)
with check (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(
    shop_id,
    'work_order.pricing.edit'
  )
);
create policy invoice_pricing_overrides_workspace_edit_delete
on public.invoice_pricing_overrides
as restrictive
for delete
to authenticated
using (
  not public.workspace_actor_is_staff_for_shop(shop_id)
  or public.workspace_actor_has_capability(
    shop_id,
    'work_order.pricing.edit'
  )
);

comment on function public.workspace_actor_has_capability(uuid, text) is
  'Fail-closed RLS predicate for an authenticated staff actor effective workspace capability.';

commit;
