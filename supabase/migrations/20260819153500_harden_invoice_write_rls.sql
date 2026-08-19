begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Invoice reads have separate customer/shop visibility policies. The legacy
-- invoices_modify_by_shop policy was FOR ALL, so every authenticated profile
-- in a shop inherited INSERT/UPDATE/DELETE access regardless of role. Keep
-- direct authenticated writes only for the canonical billing-operator roles;
-- service-role invoice lifecycle code continues to bypass RLS as intended.
drop policy if exists invoices_modify_by_shop on public.invoices;
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

-- TRUNCATE is not governed by row-level security and is never a valid browser
-- or portal operation. Remove it from untrusted API roles while preserving the
-- existing row-level DML grants required by authenticated billing workflows.
revoke truncate on table public.invoices from anon, authenticated;

notify pgrst, 'reload schema';

commit;
