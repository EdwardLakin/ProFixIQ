-- P0-008: reconcile the canonical decimal payment amount before the
-- application schema migration backfills cent-denominated Stripe fields.
--
-- Some deployed projects were created from the Stripe-first payment shape and
-- therefore have amount_cents but not the canonical amount column.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL search_path = public, pg_temp;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount numeric(14,2);

DO $p0_008_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'amount_cents'
  ) THEN
    EXECUTE $sql$
      UPDATE public.payments
      SET amount = round(amount_cents::numeric / 100, 2)
      WHERE amount IS NULL
        AND amount_cents IS NOT NULL
    $sql$;
  END IF;
END
$p0_008_backfill$;

DO $p0_008$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE amount IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'P0-008 cannot infer payments.amount for legacy payment rows';
  END IF;
END
$p0_008$;

ALTER TABLE public.payments
  ALTER COLUMN amount SET DEFAULT 0,
  ALTER COLUMN amount SET NOT NULL;

COMMIT;
