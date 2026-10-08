-- Guided onboarding writes the "existing shop/system to import?" answer to
-- guided_onboarding_sessions.existing_system, but the migration chain never
-- created the column (only db/sql/2026-06-07_guided_onboarding_v2_foundation.sql
-- declared it), so the Yes/No starting question failed with a schema-cache error.
-- Additive and idempotent.
ALTER TABLE public.guided_onboarding_sessions
  ADD COLUMN IF NOT EXISTS existing_system text;

NOTIFY pgrst, 'reload schema';
