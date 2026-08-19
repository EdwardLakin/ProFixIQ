begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Invoice reads have separate customer/shop visibility policies. Production
-- still carried invoices_modify_by_shop, while clean bootstrap carried the
-- older invoices_shop_crud policy. Both were FOR ALL and let any authenticated
-- profile in a shop mutate invoices regardless of role. Remove both paths and
-- keep direct authenticated writes only for canonical billing operators;
-- service-role invoice lifecycle code continues to bypass RLS as intended.
drop policy if exists invoices_modify_by_shop on public.invoices;
drop policy if exists invoices_shop_crud on public.invoices;
drop policy if exists invoices_billing_insert on public.invoices;
drop policy if exists invoices_billing_update on public.invoices;
drop policy if exists invoices_billing_delete on public.invoices;

create policy invoices_billing_insert
on public.invoices
for insert
to authenticated
with check (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
);

create policy invoices_billing_update
on public.invoices
for update
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
)
with check (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
);

create policy invoices_billing_delete
on public.invoices
for delete
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
);

-- Payments are created through guarded server boundaries (manual payment,
-- Stripe, imports) using service-role clients. Clean bootstrap still exposed a
-- payments_shop_crud FOR ALL policy that production no longer has. Retire that
-- bootstrap-only mutation path and remove API-role table mutation privileges.
drop policy if exists payments_shop_crud on public.payments;
revoke insert, update, delete, truncate on table public.payments
  from anon, authenticated;

-- TRUNCATE is not governed by row-level security and is never a valid browser
-- or portal invoice operation. Preserve row-level DML grants needed by legacy
-- authenticated invoice workflows, but remove the unconstrained table action.
revoke truncate on table public.invoices from anon, authenticated;

notify pgrst, 'reload schema';

commit;
