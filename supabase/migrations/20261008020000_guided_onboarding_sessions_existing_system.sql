-- Reconcile guided onboarding tables with the columns and statuses the app writes.
-- The migration chain never created these (only db/sql/2026-06-07_guided_onboarding_v2_foundation.sql
-- declared them), so the Yes/No starting question failed with a schema-cache error,
-- skipping guided setup violated the status check, and event inserts silently failed.
-- Additive and idempotent.

ALTER TABLE public.guided_onboarding_sessions
  ADD COLUMN IF NOT EXISTS existing_system text,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now();

ALTER TABLE public.guided_onboarding_events
  ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.guided_onboarding_events'::regclass
      AND conname = 'guided_onboarding_events_created_by_fkey'
  ) THEN
    ALTER TABLE public.guided_onboarding_events
      ADD CONSTRAINT guided_onboarding_events_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.guided_onboarding_sessions
  DROP CONSTRAINT IF EXISTS guided_onboarding_sessions_status_check;
ALTER TABLE public.guided_onboarding_sessions
  ADD CONSTRAINT guided_onboarding_sessions_status_check
  CHECK (status = ANY (ARRAY['active', 'in_progress', 'completed', 'cancelled', 'paused', 'skipped']));

NOTIFY pgrst, 'reload schema';
