begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Clean bootstrap historically created this FOR ALL invoice policy while
-- existing production databases carried invoices_modify_by_shop instead.
-- Remove the bootstrap-only path so the role-scoped policies installed by the
-- preceding migration are authoritative in both schema histories.
drop policy if exists invoices_shop_crud on public.invoices;

-- Payments are mutated only through guarded server boundaries (manual payment,
-- Stripe, imports) that use service-role clients. Clean bootstrap historically
-- created payments_shop_crud, even though the existing production schema no
-- longer exposes an authenticated payment mutation policy. Reconcile those
-- paths and remove direct API-role mutation privileges.
drop policy if exists payments_shop_crud on public.payments;
revoke insert, update, delete, truncate on table public.payments
  from anon, authenticated;

notify pgrst, 'reload schema';

commit;
