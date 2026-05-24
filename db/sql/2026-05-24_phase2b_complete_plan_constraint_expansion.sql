-- Phase 2B: expand DB plan constraints to support dual-vocabulary plan keys.
--
-- This is a transition migration only:
-- - keeps legacy canonical keys (starter/pro/unlimited)
-- - allows future complete_* keys for forward compatibility
-- - does not backfill data
-- - does not change runtime write paths

BEGIN;

-- 1) Expand enum-backed plan vocabulary used by public.profiles.plan.
--    Keep this additive so existing values remain valid.
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
        AND e.enumlabel = 'complete_10'
    ) THEN
      ALTER TYPE public.plan_t ADD VALUE 'complete_10';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'plan_t'
        AND e.enumlabel = 'complete_50'
    ) THEN
      ALTER TYPE public.plan_t ADD VALUE 'complete_50';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'plan_t'
        AND e.enumlabel = 'complete_100'
    ) THEN
      ALTER TYPE public.plan_t ADD VALUE 'complete_100';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'plan_t'
        AND e.enumlabel = 'complete_unlimited'
    ) THEN
      ALTER TYPE public.plan_t ADD VALUE 'complete_unlimited';
    END IF;
  END IF;
END
$$;

-- 2) public.shops.plan check: expand accepted values for dual-vocabulary transition.
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
IS 'Phase 2B dual-vocabulary transition: accepts legacy (starter/pro/unlimited) and future complete_* keys.';

-- 3) public.profiles.plan check (if present): normalize to same dual-vocabulary acceptance.
--    profiles.plan remains enum-backed; this preserves compatibility with environments
--    that may still include a text check constraint.
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
IS 'Phase 2B dual-vocabulary transition: accepts legacy (starter/pro/unlimited) and future complete_* keys.';

-- 4) Expand DB-level seat-cap helper for complete_* aliases.
create or replace function public.plan_user_limit(p_plan text, p_stripe_subscription_status text default null)
returns integer
language plpgsql
stable
as $$
declare
  v_plan text := lower(trim(coalesce(p_plan, '')));
  v_status text := lower(trim(coalesce(p_stripe_subscription_status, '')));
begin
  if v_plan in ('pro_plus', 'unlimited', 'complete_unlimited') then
    return 2147483647;
  end if;

  if v_plan in ('complete_100') then
    return 100;
  end if;

  if v_plan in ('pro', 'pro50', 'complete_50') then
    return 50;
  end if;

  if v_plan in ('starter', 'starter10', 'free', 'diy', 'complete_10') then
    return 10;
  end if;

  if v_status = 'trialing' then
    return 10;
  end if;

  return 10;
end;
$$;

comment on function public.plan_user_limit(text, text)
is 'Phase 2B dual-vocabulary seat cap resolver: legacy + complete_* aliases with trial fallback=10.';

COMMIT;
