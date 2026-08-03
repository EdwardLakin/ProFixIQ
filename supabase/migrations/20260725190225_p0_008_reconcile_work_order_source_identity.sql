-- P0-008: reconcile the deployed work-order source identity before the
-- portal request migration begins storing namespaced idempotency keys.
--
-- Some existing projects created source_row_id as uuid. The portal contract
-- stores values such as "portal_start:<customer>:<operation>", so text is the
-- canonical type. UUID values cast to text losslessly.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL search_path = public, pg_temp;

DO $p0_008$
DECLARE
  source_row_id_type regtype;
BEGIN
  SELECT a.atttypid::regtype
  INTO source_row_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.work_orders'::regclass
    AND a.attname = 'source_row_id'
    AND NOT a.attisdropped;

  IF source_row_id_type IS NULL THEN
    ALTER TABLE public.work_orders
      ADD COLUMN source_row_id text;
  ELSIF source_row_id_type = 'uuid'::regtype THEN
    ALTER TABLE public.work_orders
      ALTER COLUMN source_row_id TYPE text
      USING source_row_id::text;
  ELSIF source_row_id_type <> 'text'::regtype THEN
    RAISE EXCEPTION
      'work_orders.source_row_id has unsupported type %, expected uuid or text',
      source_row_id_type;
  END IF;
END
$p0_008$;

COMMIT;

