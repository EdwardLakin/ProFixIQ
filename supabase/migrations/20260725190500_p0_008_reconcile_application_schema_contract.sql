-- P0-008: restore application-visible columns and views that exist in the
-- production contract but were still absent from a clean migration replay.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Email delivery queue fields. A legacy database with unscoped rows must be
-- reconciled manually rather than assigning those rows to an arbitrary shop.
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS shop_id uuid,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS template_id text,
  ADD COLUMN IF NOT EXISTS to_email text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'sendgrid'::text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

DO $p0_008_email_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_logs'
      AND column_name = 'email'
  ) THEN
    EXECUTE $sql$
      UPDATE public.email_logs
      SET to_email = email
      WHERE to_email IS NULL
        AND email IS NOT NULL
    $sql$;
  END IF;
END
$p0_008_email_backfill$;

UPDATE public.email_logs
SET template_key = 'legacy_event'
WHERE template_key IS NULL;

DO $p0_008_email_scope$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.email_logs
    WHERE shop_id IS NULL
       OR template_key IS NULL
       OR to_email IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'P0-008 cannot infer shop_id/template_key/to_email for legacy email_logs rows';
  END IF;
END
$p0_008_email_scope$;

ALTER TABLE public.email_logs
  ALTER COLUMN shop_id SET NOT NULL,
  ALTER COLUMN template_key SET NOT NULL,
  ALTER COLUMN to_email SET NOT NULL;

-- Imported service-history detail used by customer history and import jobs.
ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS source_row_id text,
  ADD COLUMN IF NOT EXISTS imported_from_session_id uuid,
  ADD COLUMN IF NOT EXISTS work_order_number text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS historical_status text,
  ADD COLUMN IF NOT EXISTS advisor_name text,
  ADD COLUMN IF NOT EXISTS assigned_tech_name text,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS odometer numeric,
  ADD COLUMN IF NOT EXISTS symptom text,
  ADD COLUMN IF NOT EXISTS cause text,
  ADD COLUMN IF NOT EXISTS correction text,
  ADD COLUMN IF NOT EXISTS labor_hours numeric,
  ADD COLUMN IF NOT EXISTS labor_sale numeric,
  ADD COLUMN IF NOT EXISTS parts_sale numeric,
  ADD COLUMN IF NOT EXISTS shop_supplies numeric,
  ADD COLUMN IF NOT EXISTS sublet_sale numeric,
  ADD COLUMN IF NOT EXISTS discount numeric,
  ADD COLUMN IF NOT EXISTS tax numeric,
  ADD COLUMN IF NOT EXISTS total numeric,
  ADD COLUMN IF NOT EXISTS approval_state text,
  ADD COLUMN IF NOT EXISTS payment_state text,
  ADD COLUMN IF NOT EXISTS tags text[],
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.menu_item_parts
  ADD COLUMN IF NOT EXISTS part_id uuid,
  ADD COLUMN IF NOT EXISTS shop_id uuid;

ALTER TABLE public.parts_barcodes
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

-- Preserve both canonical invoice amounts and Stripe cent-denominated fields.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS amount_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS stripe_connected_account_id text,
  ADD COLUMN IF NOT EXISTS work_order_line_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer NOT NULL DEFAULT 0;

UPDATE public.payments
SET amount_cents = round(amount * 100)::integer
WHERE amount_cents IS NULL;

DO $p0_008_payment_identity$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE stripe_session_id IS NULL
       OR amount_cents IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'P0-008 cannot infer Stripe session identity for legacy payments rows';
  END IF;
END
$p0_008_payment_identity$;

ALTER TABLE public.payments
  ALTER COLUMN stripe_session_id SET NOT NULL,
  ALTER COLUMN amount_cents SET NOT NULL;

ALTER TABLE public.payroll_pay_periods
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false;

UPDATE public.payroll_pay_periods
SET start_date = period_start,
    end_date = period_end,
    processed = coalesce(processed, status IN ('approved', 'exported'))
WHERE start_date IS NULL
   OR end_date IS NULL
   OR processed IS NULL;

ALTER TABLE public.payroll_pay_periods
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.shop_payroll_settings
  ADD COLUMN IF NOT EXISTS paid_breaks_per_day smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS paid_break_duration_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS breaks_are_paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lunch_is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_lunch_duration_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS lunch_required_after_minutes integer NOT NULL DEFAULT 300;

ALTER TABLE public.shop_reviews
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_name text;

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS pricing_refresh_days integer DEFAULT 30;

ALTER TABLE public.tech_sessions
  ADD COLUMN IF NOT EXISTS shop_id uuid,
  ADD COLUMN IF NOT EXISTS shift_id uuid,
  ADD COLUMN IF NOT EXISTS work_order_line_id uuid;

-- Production assignments have a stable row identity in addition to the
-- unique technician/line pair.
ALTER TABLE public.work_order_line_technicians
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE public.work_order_line_technicians
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.work_order_line_technicians
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;

DO $p0_008_assignment_pk$
DECLARE
  primary_columns text[];
BEGIN
  SELECT array_agg(attribute.attname ORDER BY key_column.ordinality)
    INTO primary_columns
  FROM pg_constraint constraint_row
  CROSS JOIN LATERAL unnest(constraint_row.conkey)
    WITH ORDINALITY AS key_column(attnum, ordinality)
  JOIN pg_attribute attribute
    ON attribute.attrelid = constraint_row.conrelid
   AND attribute.attnum = key_column.attnum
  WHERE constraint_row.conrelid = 'public.work_order_line_technicians'::regclass
    AND constraint_row.contype = 'p';

  IF primary_columns IS DISTINCT FROM ARRAY['id']::text[] THEN
    ALTER TABLE public.work_order_line_technicians
      DROP CONSTRAINT IF EXISTS work_order_line_technicians_pkey;
    ALTER TABLE public.work_order_line_technicians
      ADD CONSTRAINT work_order_line_technicians_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.work_order_line_technicians'::regclass
      AND conname = 'work_order_line_technicians_work_order_line_id_technician_i_key'
  ) THEN
    ALTER TABLE public.work_order_line_technicians
      ADD CONSTRAINT work_order_line_technicians_work_order_line_id_technician_i_key
      UNIQUE (work_order_line_id, technician_id);
  END IF;
END
$p0_008_assignment_pk$;

ALTER TABLE public.work_order_quote_lines
  ADD COLUMN IF NOT EXISTS vehicle_id uuid,
  ADD COLUMN IF NOT EXISTS suggested_by uuid,
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'tech-suggested'::text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS ai_complaint text,
  ADD COLUMN IF NOT EXISTS ai_cause text,
  ADD COLUMN IF NOT EXISTS ai_correction text,
  ADD COLUMN IF NOT EXISTS qty numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS sent_to_customer_at timestamptz;

ALTER TABLE public.work_order_quote_lines
  ALTER COLUMN status SET DEFAULT 'pending_parts'::text,
  ALTER COLUMN est_labor_hours DROP NOT NULL,
  ALTER COLUMN labor_hours DROP NOT NULL,
  ALTER COLUMN labor_total DROP NOT NULL,
  ALTER COLUMN parts_total DROP NOT NULL,
  ALTER COLUMN subtotal DROP NOT NULL,
  ALTER COLUMN tax_total DROP NOT NULL,
  ALTER COLUMN grand_total DROP NOT NULL,
  ALTER COLUMN metadata DROP NOT NULL;

-- Recreate production constraints only when the clean baseline does not
-- already provide an equivalent named constraint.
DO $p0_008_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_shop_id_fkey' AND conrelid = 'public.email_logs'::regclass) THEN
    ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_created_by_fkey' AND conrelid = 'public.email_logs'::regclass) THEN
    ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_parts_part_id_fkey' AND conrelid = 'public.menu_item_parts'::regclass) THEN
    ALTER TABLE public.menu_item_parts ADD CONSTRAINT menu_item_parts_part_id_fkey FOREIGN KEY (part_id) REFERENCES public.parts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_parts_shop_id_fkey' AND conrelid = 'public.menu_item_parts'::regclass) THEN
    ALTER TABLE public.menu_item_parts ADD CONSTRAINT menu_item_parts_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parts_barcodes_supplier_id_fkey' AND conrelid = 'public.parts_barcodes'::regclass) THEN
    ALTER TABLE public.parts_barcodes ADD CONSTRAINT parts_barcodes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_stripe_session_id_key' AND conrelid = 'public.payments'::regclass) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_stripe_session_id_key UNIQUE (stripe_session_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_unique_payment_intent' AND conrelid = 'public.payments'::regclass) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_unique_payment_intent UNIQUE (stripe_payment_intent_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_unique_session' AND conrelid = 'public.payments'::regclass) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_unique_session UNIQUE (stripe_checkout_session_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_cents_check' AND conrelid = 'public.payments'::regclass) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_amount_cents_check CHECK (amount_cents >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_platform_fee_nonnegative' AND conrelid = 'public.payments'::regclass) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_platform_fee_nonnegative CHECK (platform_fee_cents >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_sessions_shift_fk' AND conrelid = 'public.tech_sessions'::regclass) THEN
    ALTER TABLE public.tech_sessions ADD CONSTRAINT tech_sessions_shift_fk FOREIGN KEY (shift_id) REFERENCES public.tech_shifts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_sessions_shop_fk' AND conrelid = 'public.tech_sessions'::regclass) THEN
    ALTER TABLE public.tech_sessions ADD CONSTRAINT tech_sessions_shop_fk FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_sessions_wol_fk' AND conrelid = 'public.tech_sessions'::regclass) THEN
    ALTER TABLE public.tech_sessions ADD CONSTRAINT tech_sessions_wol_fk FOREIGN KEY (work_order_line_id) REFERENCES public.work_order_lines(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_quote_lines_suggested_by_fkey' AND conrelid = 'public.work_order_quote_lines'::regclass) THEN
    ALTER TABLE public.work_order_quote_lines ADD CONSTRAINT work_order_quote_lines_suggested_by_fkey FOREIGN KEY (suggested_by) REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_quote_lines_vehicle_id_fkey' AND conrelid = 'public.work_order_quote_lines'::regclass) THEN
    ALTER TABLE public.work_order_quote_lines ADD CONSTRAINT work_order_quote_lines_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);
  END IF;
END
$p0_008_constraints$;

DO $p0_008_payroll_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_payroll_settings_paid_breaks_per_day_chk' AND conrelid = 'public.shop_payroll_settings'::regclass) THEN
    ALTER TABLE public.shop_payroll_settings ADD CONSTRAINT shop_payroll_settings_paid_breaks_per_day_chk CHECK (paid_breaks_per_day BETWEEN 0 AND 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_payroll_settings_paid_break_duration_minutes_chk' AND conrelid = 'public.shop_payroll_settings'::regclass) THEN
    ALTER TABLE public.shop_payroll_settings ADD CONSTRAINT shop_payroll_settings_paid_break_duration_minutes_chk CHECK (paid_break_duration_minutes BETWEEN 0 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_payroll_settings_default_lunch_duration_minutes_chk' AND conrelid = 'public.shop_payroll_settings'::regclass) THEN
    ALTER TABLE public.shop_payroll_settings ADD CONSTRAINT shop_payroll_settings_default_lunch_duration_minutes_chk CHECK (default_lunch_duration_minutes BETWEEN 0 AND 240);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_payroll_settings_lunch_required_after_minutes_chk' AND conrelid = 'public.shop_payroll_settings'::regclass) THEN
    ALTER TABLE public.shop_payroll_settings ADD CONSTRAINT shop_payroll_settings_lunch_required_after_minutes_chk CHECK (lunch_required_after_minutes BETWEEN 0 AND 1440);
  END IF;
END
$p0_008_payroll_checks$;

-- The clean baseline carried a legacy materialized summary table while the
-- application and production use a security-invoker aggregate view. Refuse
-- to discard non-empty legacy rows because they require manual reconciliation.
DO $p0_008_stock_summary$
DECLARE
  relation_kind "char";
  legacy_rows bigint;
BEGIN
  SELECT c.relkind
    INTO relation_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'part_stock_summary';

  IF relation_kind = 'r' THEN
    SELECT count(*) INTO legacy_rows FROM public.part_stock_summary;
    IF legacy_rows > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'P0-008 requires manual reconciliation of non-empty legacy part_stock_summary rows';
    END IF;
    DROP TABLE public.part_stock_summary;
  ELSIF relation_kind IS NOT NULL AND relation_kind <> 'v' THEN
    RAISE EXCEPTION 'P0-008 unsupported public.part_stock_summary relkind %', relation_kind;
  END IF;
END
$p0_008_stock_summary$;

CREATE OR REPLACE VIEW public.part_stock_summary
WITH (security_invoker = true)
AS
SELECT
  p.id AS part_id,
  p.shop_id,
  p.name,
  p.sku,
  p.category,
  p.price,
  coalesce(sum(sm.qty_change), 0::numeric) AS on_hand,
  count(sm.id) AS move_count
FROM public.parts p
LEFT JOIN public.stock_moves sm ON sm.part_id = p.id
GROUP BY p.id, p.shop_id, p.name, p.sku, p.category, p.price;

CREATE OR REPLACE VIEW public.v_quote_queue
WITH (security_invoker = true)
AS
SELECT
  wol.id,
  wol.work_order_id,
  wol.complaint,
  wol.cause,
  wol.correction,
  wol.tools,
  wol.labor_time,
  wol.created_at,
  wol.line_status,
  wol.parts_required,
  wol.parts_received,
  wol.on_hold_since,
  wol.hold_reason,
  wol.description,
  wol.user_id,
  wol.vehicle_id,
  wol.assigned_to,
  wol.job_type,
  wol.priority,
  wol.status,
  wol.punched_in_at,
  wol.punched_out_at,
  wol.assigned_tech_id,
  wol.updated_at,
  wol.parts_needed,
  wol.template_id,
  wol.notes,
  wol.shop_id,
  wol.approval_state,
  wol.approval_at,
  wol.approval_by,
  wol.approval_note,
  wol.inspection_session_id,
  wol.urgency,
  wol.parts,
  wol.price_estimate,
  wo.custom_id AS work_order_custom_id,
  wo.vehicle_id AS work_order_vehicle_id,
  wo.customer_id AS work_order_customer_id
FROM public.work_order_lines wol
JOIN public.work_orders wo ON wo.id = wol.work_order_id
WHERE wol.approval_state = 'pending'::text
ORDER BY wol.created_at;

CREATE OR REPLACE VIEW public.v_work_order_board_cards_fleet
WITH (security_invoker = true)
AS
SELECT
  s.work_order_id,
  s.custom_id,
  s.shop_id,
  s.customer_id,
  s.vehicle_id,
  fv.fleet_id,
  f.name AS fleet_name,
  s.display_name,
  s.unit_label,
  s.vehicle_label,
  s.jobs_total,
  s.jobs_completed,
  s.progress_pct,
  s.parts_blocker_count,
  s.has_waiting_parts,
  s.assigned_tech_count,
  s.assigned_summary,
  s.overall_stage,
  s.risk_level,
  s.risk_reason,
  s.time_in_stage_seconds,
  s.activity_at,
  s.portal_stage_label,
  s.portal_status_note,
  CASE
    WHEN s.overall_stage = 'completed'::text THEN 'Completed'::text
    WHEN s.overall_stage = 'waiting_parts'::text THEN 'Waiting parts'::text
    WHEN s.overall_stage = 'awaiting_approval'::text THEN 'Awaiting approval'::text
    WHEN s.overall_stage = 'in_progress'::text THEN 'In progress'::text
    WHEN s.overall_stage = 'on_hold'::text THEN 'On hold'::text
    WHEN s.overall_stage = 'empty'::text THEN 'Empty'::text
    ELSE 'Awaiting'::text
  END AS fleet_stage_label,
  s.priority,
  s.is_waiter,
  s.advisor_id,
  s.advisor_name,
  s.first_tech_name,
  s.tech_names,
  s.jobs_open,
  s.jobs_blocked,
  s.jobs_waiting_parts
FROM public.v_work_order_board_cards_shop s
LEFT JOIN public.fleet_vehicles fv ON fv.vehicle_id = s.vehicle_id
LEFT JOIN public.fleets f ON f.id = fv.fleet_id;

CREATE OR REPLACE VIEW public.v_work_order_board_cards_portal
WITH (security_invoker = true)
AS
SELECT
  s.work_order_id,
  s.custom_id,
  s.shop_id,
  s.customer_id,
  s.vehicle_id,
  NULL::uuid AS fleet_id,
  NULL::text AS fleet_name,
  s.display_name,
  s.unit_label,
  s.vehicle_label,
  s.jobs_total,
  s.jobs_completed,
  s.progress_pct,
  s.parts_blocker_count,
  s.has_waiting_parts,
  s.assigned_tech_count,
  NULL::text AS assigned_summary,
  s.overall_stage,
  s.risk_level,
  s.risk_reason,
  s.time_in_stage_seconds,
  s.activity_at,
  CASE
    WHEN s.overall_stage = 'completed'::text THEN 'Completed'::text
    WHEN s.overall_stage = 'waiting_parts'::text THEN 'Waiting on parts'::text
    WHEN s.overall_stage = 'awaiting_approval'::text THEN 'Awaiting approval'::text
    WHEN s.overall_stage = 'in_progress'::text THEN 'In progress'::text
    WHEN s.overall_stage = 'on_hold'::text THEN 'On hold'::text
    WHEN s.overall_stage = 'empty'::text THEN 'Not started'::text
    ELSE 'Awaiting service'::text
  END AS portal_stage_label,
  CASE
    WHEN s.overall_stage = 'completed'::text THEN 'Your work order is complete.'::text
    WHEN s.overall_stage = 'waiting_parts'::text THEN 'We are waiting on parts for your repair.'::text
    WHEN s.overall_stage = 'awaiting_approval'::text THEN 'We are waiting for approval before continuing.'::text
    WHEN s.overall_stage = 'in_progress'::text THEN 'Your vehicle is currently being worked on.'::text
    WHEN s.overall_stage = 'on_hold'::text THEN 'Your work order is temporarily on hold.'::text
    WHEN s.overall_stage = 'empty'::text THEN 'Your work order has been created.'::text
    ELSE 'Your work order is in queue.'::text
  END AS portal_status_note,
  NULL::text AS fleet_stage_label,
  s.priority,
  s.is_waiter,
  s.advisor_id,
  NULL::text AS advisor_name,
  s.first_tech_name,
  NULL::text[] AS tech_names,
  s.jobs_open,
  s.jobs_blocked,
  s.jobs_waiting_parts
FROM public.v_work_order_board_cards_shop s;

REVOKE ALL PRIVILEGES ON TABLE
  public.part_stock_summary,
  public.v_quote_queue,
  public.v_work_order_board_cards_fleet,
  public.v_work_order_board_cards_portal
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.part_stock_summary,
  public.v_quote_queue,
  public.v_work_order_board_cards_fleet,
  public.v_work_order_board_cards_portal
TO authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.part_stock_summary,
  public.v_quote_queue,
  public.v_work_order_board_cards_fleet,
  public.v_work_order_board_cards_portal
TO service_role;

COMMIT;
