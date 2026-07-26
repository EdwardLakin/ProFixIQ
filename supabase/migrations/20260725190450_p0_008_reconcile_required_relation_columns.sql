-- P0-008: preserve required-column contracts already enforced by the live
-- schema but missing from the canonical clean-replay history.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

-- Tables created by older deployments predate the stricter baseline shapes.
-- Normalize only fields whose canonical create-table contract already defines
-- an unambiguous default before enforcing the matching NOT NULL invariant.
UPDATE public.demo_shop_boosts
SET snapshot = '{}'::jsonb
WHERE snapshot IS NULL;

UPDATE public.inspections
SET locked = false
WHERE locked IS NULL;

UPDATE public.payments
SET updated_at = coalesce(created_at, now())
WHERE updated_at IS NULL;

UPDATE public.payroll_pay_periods
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.work_order_quote_lines
SET labor_hours = coalesce(labor_hours, 0),
    est_labor_hours = coalesce(est_labor_hours, 0),
    labor_total = coalesce(labor_total, 0),
    parts_total = coalesce(parts_total, 0),
    subtotal = coalesce(subtotal, 0),
    tax_total = coalesce(tax_total, 0),
    grand_total = coalesce(grand_total, 0),
    metadata = coalesce(metadata, '{}'::jsonb)
WHERE labor_hours IS NULL
   OR est_labor_hours IS NULL
   OR labor_total IS NULL
   OR parts_total IS NULL
   OR subtotal IS NULL
   OR tax_total IS NULL
   OR grand_total IS NULL
   OR metadata IS NULL;

ALTER TABLE public.demo_shop_boosts
  ALTER COLUMN snapshot SET DEFAULT '{}'::jsonb;

ALTER TABLE public.inspections
  ALTER COLUMN locked SET DEFAULT false;

ALTER TABLE public.payments
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.payroll_pay_periods
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.work_order_quote_lines
  ALTER COLUMN labor_hours SET DEFAULT 0,
  ALTER COLUMN est_labor_hours SET DEFAULT 0,
  ALTER COLUMN labor_total SET DEFAULT 0,
  ALTER COLUMN parts_total SET DEFAULT 0,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN tax_total SET DEFAULT 0,
  ALTER COLUMN grand_total SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

DO $p0_008$
DECLARE
  item record;
  column_is_required boolean;
  has_null_rows boolean;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('chat_participants', 'chat_id'),
      ('chat_participants', 'profile_id'),
      ('conversation_participants', 'conversation_id'),
      ('conversation_participants', 'user_id'),
      ('demo_shop_boosts', 'snapshot'),
      ('email_logs', 'created_at'),
      ('email_logs', 'status'),
      ('inspections', 'shop_id'),
      ('inspections', 'status'),
      ('inspections', 'locked'),
      ('payments', 'updated_at'),
      ('payroll_pay_periods', 'created_at'),
      ('payroll_pay_periods', 'period_end'),
      ('payroll_pay_periods', 'period_start'),
      ('payroll_pay_periods', 'shop_id'),
      ('portal_notifications', 'title'),
      ('quote_lines', 'status'),
      ('quote_lines', 'work_order_id'),
      ('shops', 'owner_id'),
      ('work_order_approvals', 'work_order_id'),
      ('work_order_lines', 'shop_id'),
      ('work_order_lines', 'status'),
      ('work_order_lines', 'work_order_id'),
      ('work_order_part_allocations', 'shop_id'),
      ('work_order_parts', 'work_order_id'),
      ('work_order_quote_lines', 'est_labor_hours'),
      ('work_order_quote_lines', 'description'),
      ('work_order_quote_lines', 'grand_total'),
      ('work_order_quote_lines', 'labor_hours'),
      ('work_order_quote_lines', 'labor_total'),
      ('work_order_quote_lines', 'metadata'),
      ('work_order_quote_lines', 'parts_total'),
      ('work_order_quote_lines', 'subtotal'),
      ('work_order_quote_lines', 'tax_total'),
      ('work_orders', 'status')
    ) AS expected(table_name, column_name)
  LOOP
    SELECT a.attnotnull
      INTO column_is_required
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass(format('public.%I', item.table_name))
      AND a.attname = item.column_name
      AND NOT a.attisdropped;

    IF column_is_required IS NULL THEN
      RAISE EXCEPTION 'P0-008 required column is missing: %.%',
        item.table_name,
        item.column_name;
    END IF;

    IF NOT column_is_required THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I IS NULL)',
        item.table_name,
        item.column_name
      ) INTO has_null_rows;

      IF has_null_rows THEN
        RAISE EXCEPTION USING
          ERRCODE = '23502',
          MESSAGE = format(
            'P0-008 cannot require %I.%I while null rows exist.',
            item.table_name,
            item.column_name
          );
      END IF;

      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL',
        item.table_name,
        item.column_name
      );
    END IF;
  END LOOP;
END
$p0_008$;

COMMIT;
