-- Forward-only hardening for public.invoices/public.payments, regardless of
-- which baseline mode a database went through.
--
-- 20260705000070_baseline_invoice_dependencies.sql is an already-applied
-- migration and is intentionally not touched here (see AGENTS.md: never edit,
-- rename, reorder, or replace an applied migration). That file's "existing"
-- branch only validates that both tables exist before returning early; it
-- does not guarantee RLS is enabled on them. This migration re-asserts that
-- invariant unconditionally, on any database, regardless of baseline mode or
-- how each table's columns evolved since.
--
-- This intentionally does NOT touch policies. Production's real policy set on
-- these tables is materially more nuanced than the generic bootstrap shape
-- 20260705000070 creates for a brand-new install: public.payments today
-- carries only scoped SELECT policies (same-shop, and further restricted to
-- owner/admin/manager/advisor roles) and no INSERT/UPDATE/DELETE policy at
-- all -- writes are deliberately confined to trusted service-role flows
-- (Stripe webhooks, server routes). Adding a blanket "for all" same-shop
-- policy here, as a first draft of this migration did, would silently widen
-- write access beyond what production intends. If a future audit finds an
-- "existing" install that truly lacks any policy on these tables, that needs
-- its own reviewed migration informed by that install's actual access model,
-- not a copy of the greenfield bootstrap policy.
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

-- public.invoices has not diverged in shape from the bootstrap migration, so
-- this index is safe to (re)assert unconditionally.
create index if not exists invoices_shop_work_order_idx
  on public.invoices(shop_id, work_order_id, created_at desc);

-- public.payments has: production's real table moved to a Stripe-first shape
-- (amount_cents, stripe_session_id, ...) and had its generic invoice_id
-- column retired by 20260806181508_retire_legacy_bootstrap_schema_aliases.sql.
-- Only (re)create this bootstrap-era index when that column still exists, so
-- a database that never had (or already shed) invoice_id is left alone.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payments'
      and column_name = 'invoice_id'
  ) then
    execute $ddl$
      create index if not exists payments_shop_invoice_idx
        on public.payments(shop_id, invoice_id, created_at desc)
    $ddl$;
  end if;
end
$$;
