\set ON_ERROR_STOP on

-- Regression for 20260914013000_harden_existing_baseline_financial_rls.sql.
--
-- By the time this step runs, the job has already replayed the full
-- migration chain, including 20260806181508_retire_legacy_bootstrap_schema_
-- aliases.sql -- so payments.invoice_id is already absent here, matching
-- production's real, current shape. This test proves the migration under
-- test is safe against that (the reported defect: it must not try to
-- recreate payments_shop_invoice_idx against a missing column), then proves
-- the same file still (re)creates that index when invoice_id is present, by
-- adding it back temporarily.
--
-- No outer transaction here: the migration under test wraps itself in its
-- own begin/commit (per the P2 lock-timeout finding on this PR), and nesting
-- a rollback-wrapped test transaction around a file that commits internally
-- would end the outer transaction early. Instead, this test's own steps
-- restore the pre-test shape by construction, ending with invoice_id
-- dropped again -- exactly as it found it -- so later runtime tests in this
-- job (e.g. p0-008-schema-reconciliation, which asserts the retired
-- bootstrap aliases stay gone) are unaffected.

-- --- Confirm the shape this step actually starts from ----------------------
do $starting_shape$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'invoice_id'
  ) then
    raise exception 'Setup assumption failed: payments.invoice_id was already present before this test ran.';
  end if;
end
$starting_shape$;

alter table public.invoices disable row level security;
alter table public.payments disable row level security;

-- --- Re-run the migration under test against the drifted shape ------------
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

-- --- Temporarily add invoice_id back: the index must be (re)created -------
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

-- --- Restore the shape this step started from ------------------------------
-- Dropping invoice_id also drops the index that depends on it, returning the
-- database to exactly the state later runtime tests in this job expect.
alter table public.payments drop column invoice_id;

do $restored$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'invoice_id'
  ) then
    raise exception 'Cleanup failed: payments.invoice_id was not dropped.';
  end if;

  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'payments'
      and indexname = 'payments_shop_invoice_idx'
  ) then
    raise exception 'Cleanup failed: payments_shop_invoice_idx was not dropped.';
  end if;
end
$restored$;
