-- P0-008: keep clean-replay and existing-database inserts aligned with the
-- live email delivery queue contract.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.email_logs
  ALTER COLUMN status SET DEFAULT 'queued'::text;

COMMIT;
