begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Use the canonical SECURITY DEFINER portal-membership predicate already used
-- by work_orders. This avoids making invoice visibility depend on whatever RLS
-- happens to exist on customers in a particular schema history, and it requires
-- durable accepted, non-revoked invite evidence before a customer can read an
-- invoice row.
drop policy if exists invoices_customer_select on public.invoices;

create policy invoices_customer_select
on public.invoices
for select
to authenticated
using (
  customer_id is not null
  and public.profixiq_is_portal_customer_for(customer_id, shop_id)
);

notify pgrst, 'reload schema';

commit;
