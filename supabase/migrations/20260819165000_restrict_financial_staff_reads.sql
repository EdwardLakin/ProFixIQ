begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Application RBAC exposes billing and invoice operations only to the canonical
-- billing-operator roles. Keep direct table reads aligned with that contract so
-- a same-shop floor/parts profile cannot bypass the UI and query financial rows
-- through the authenticated Supabase API.
drop policy if exists invoices_staff_select on public.invoices;

create policy invoices_staff_select
on public.invoices
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
);

drop policy if exists payments_staff_select on public.payments;

create policy payments_staff_select
on public.payments
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
);

notify pgrst, 'reload schema';

commit;
