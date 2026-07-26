-- P0-008: promote the deployed Complete-plan constraints into canonical history.
--
-- Production environments that already carry these constraints are unchanged.
-- Clean replays created from supabase/migrations receive the same accepted plan
-- vocabulary before runtime functions and authorization tests are installed.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $p0_008$
DECLARE
  v_constraint_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid, true)
  INTO v_constraint_definition
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'shops'
    AND c.conname = 'shops_plan_check';

  IF v_constraint_definition IS NULL
     OR v_constraint_definition NOT LIKE '%complete_100%' THEN
    ALTER TABLE public.shops
      DROP CONSTRAINT IF EXISTS shops_plan_check;

    ALTER TABLE public.shops
      ADD CONSTRAINT shops_plan_check
      CHECK (
        plan IS NULL
        OR plan = ANY (
          ARRAY[
            'starter'::text,
            'pro'::text,
            'unlimited'::text,
            'complete_10'::text,
            'complete_50'::text,
            'complete_100'::text,
            'complete_unlimited'::text
          ]
        )
      ) NOT VALID;

    ALTER TABLE public.shops
      VALIDATE CONSTRAINT shops_plan_check;

    COMMENT ON CONSTRAINT shops_plan_check ON public.shops
      IS 'Accepts legacy and Complete plan keys during the plan-vocabulary transition.';
  END IF;
END
$p0_008$;

DO $p0_008$
DECLARE
  v_constraint_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid, true)
  INTO v_constraint_definition
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'profiles'
    AND c.conname = 'profiles_plan_check';

  IF v_constraint_definition IS NULL
     OR v_constraint_definition NOT LIKE '%complete_100%' THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_plan_check;

    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check
      CHECK (
        plan IS NULL
        OR plan::text = ANY (
          ARRAY[
            'starter'::text,
            'pro'::text,
            'unlimited'::text,
            'complete_10'::text,
            'complete_50'::text,
            'complete_100'::text,
            'complete_unlimited'::text
          ]
        )
      ) NOT VALID;

    ALTER TABLE public.profiles
      VALIDATE CONSTRAINT profiles_plan_check;

    COMMENT ON CONSTRAINT profiles_plan_check ON public.profiles
      IS 'Accepts legacy and Complete plan keys during the plan-vocabulary transition.';
  END IF;
END
$p0_008$;

COMMIT;
