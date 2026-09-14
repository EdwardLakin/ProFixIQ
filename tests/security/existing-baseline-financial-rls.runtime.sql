\set ON_ERROR_STOP on

-- Regression for 20260914013000_harden_existing_baseline_financial_rls.sql.
--
-- A plain clean replay only ever exercises this file against a freshly
-- bootstrapped payments/invoices shape (invoice_id present, per
-- 20260705000070_baseline_invoice_dependencies.sql's bootstrap branch), so it
-- can never reproduce the reported defect on its own: a database whose
-- payments table already moved to the Stripe-first shape and had invoice_id
-- retired by 20260806181508_retire_legacy_bootstrap_schema_aliases.sql. This
-- test manufactures that shape directly and proves the migration is safe
-- against it, then proves the same file still (re)creates the bootstrap-era
-- index when invoice_id is present.

begin;

-- --- Simulate a pre-hardening, post-alias-retirement install --------------
-- Dropping invoice_id also drops payments_shop_invoice_idx (it depends on
-- the column), so this alone reproduces the "index missing, column missing"
-- state the migration must tolerate.
alter table public.payments drop column if exists invoice_id;
alter table public.invoices disable row level security;
alter table public.payments disable row level security;

do $existing_shape$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'invoice_id'
  ) then
    raise exception 'Setup failed: payments.invoice_id still present.';
  end if;
end
$existing_shape$;

-- --- Re-run the migration under test against that shape --------------------
\i supabase/migrations/20260914013000_harden_existing_baseline_financial_rls.sql

do $assert_drifted$
declare
  v_invoices_rls boolean;
  v_payments_rls boolean;
begin
  select relrowsecurity into strict v_invoices_rls
  from pg_class where oid = 'public.invoices'::regclass;
  select relrowsecurity into strict v_payments_rls
  from pg_class where oid = 'public.payments'::regclass;

  if not v_invoices_rls or not v_payments_rls then
    raise exception 'Migration must enable RLS on invoices/payments unconditionally.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'invoices'
      and indexname = 'invoices_shop_work_order_idx'
  ) then
    raise exception 'invoices_shop_work_order_idx must exist regardless of baseline mode.';
  end if;

  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'payments'
      and indexname = 'payments_shop_invoice_idx'
  ) then
    raise exception 'payments_shop_invoice_idx must not be (re)created when invoice_id is absent.';
  end if;
end
$assert_drifted$;

-- --- Same file, greenfield shape: the index must still get (re)created ----
alter table public.payments add column invoice_id uuid;

\i supabase/migrations/20260914013000_harden_existing_baseline_financial_rls.sql

do $assert_greenfield$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'payments'
      and indexname = 'payments_shop_invoice_idx'
  ) then
    raise exception 'payments_shop_invoice_idx must be created when invoice_id is present.';
  end if;
end
$assert_greenfield$;

rollback;
