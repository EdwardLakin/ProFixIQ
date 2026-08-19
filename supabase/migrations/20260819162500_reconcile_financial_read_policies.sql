begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Existing production and clean bootstrap reached different invoice policy
-- states. Canonicalize reads before relying on the role-scoped write policies:
-- staff keep the same-shop visibility production already provided, including
-- imported profile identities supported by current_shop_id(), while portal
-- customers keep read-only access to invoices for their own work orders.
drop policy if exists customer_select_invoices_for_own_work_orders
  on public.invoices;
drop policy if exists invoices_select_by_shop on public.invoices;
drop policy if exists shop_members_can_select_invoices on public.invoices;
drop policy if exists invoices_staff_select on public.invoices;
drop policy if exists invoices_customer_select on public.invoices;

create policy invoices_staff_select
on public.invoices
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
);

create policy invoices_customer_select
on public.invoices
for select
to authenticated
using (
  exists (
    select 1
    from public.work_orders wo
    join public.customers c
      on c.id = wo.customer_id
     and c.shop_id = wo.shop_id
    where wo.id = invoices.work_order_id
      and wo.shop_id = invoices.shop_id
      and c.user_id = (select auth.uid())
  )
);

-- Production historically allowed same-shop authenticated profiles to read
-- payment rows, while clean bootstrap depended on payments_shop_crud for that
-- access. Preserve the read contract without restoring any direct payment DML.
drop policy if exists payments_select_same_shop on public.payments;
drop policy if exists payments_select_shop on public.payments;
drop policy if exists payments_staff_select on public.payments;

create policy payments_staff_select
on public.payments
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
);

notify pgrst, 'reload schema';

commit;
