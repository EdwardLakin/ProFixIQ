-- Canonicalize billing plan vocabulary to starter / pro / unlimited.
-- Safe + additive migration: backfills legacy plan values and updates constraints
-- so Stripe hydration writes no longer violate shops.plan checks.

BEGIN;

-- 1) If legacy enum exists, add canonical values needed for backfill writes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'plan_t'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'plan_t'
        AND e.enumlabel = 'starter'
    ) THEN
      ALTER TYPE public.plan_t ADD VALUE 'starter';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'plan_t'
        AND e.enumlabel = 'unlimited'
    ) THEN
      ALTER TYPE public.plan_t ADD VALUE 'unlimited';
    END IF;
  END IF;
END
$$;

-- 2) Backfill legacy plans to canonical values.
UPDATE public.shops
SET plan = CASE
  WHEN plan IN ('free', 'diy', 'starter10', 'starter') THEN 'starter'
  WHEN plan IN ('pro', 'pro50') THEN 'pro'
  WHEN plan IN ('pro_plus', 'unlimited') THEN 'unlimited'
  ELSE plan
END
WHERE plan IS NOT NULL;

UPDATE public.profiles
SET plan = CASE
  WHEN plan IN ('free', 'diy', 'starter10', 'starter') THEN 'starter'
  WHEN plan IN ('pro', 'pro50') THEN 'pro'
  WHEN plan IN ('pro_plus', 'unlimited') THEN 'unlimited'
  ELSE plan
END
WHERE plan IS NOT NULL;

-- 3) Replace legacy checks with canonical checks.
ALTER TABLE public.shops
  DROP CONSTRAINT IF EXISTS shops_plan_check;

ALTER TABLE public.shops
  ADD CONSTRAINT shops_plan_check
  CHECK (
    plan IS NULL
    OR plan = ANY (ARRAY['starter'::text, 'pro'::text, 'unlimited'::text])
  ) NOT VALID;

ALTER TABLE public.shops
  VALIDATE CONSTRAINT shops_plan_check;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (
    plan IS NULL
    OR plan = ANY (ARRAY['starter'::text, 'pro'::text, 'unlimited'::text])
  ) NOT VALID;

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_plan_check;

-- 4) Known broken shop safe customer-link backfill (enables immediate hydration via GET /api/stripe/subscription).
UPDATE public.shops
SET stripe_customer_id = 'cus_UO9aNf2rSJvwQp'
WHERE id = 'e9e87cda-3cbe-4785-956f-e8d05fcde539'
  AND (
    stripe_customer_id IS NULL
    OR stripe_customer_id = ''
    OR stripe_customer_id <> 'cus_UO9aNf2rSJvwQp'
  );

COMMIT;
