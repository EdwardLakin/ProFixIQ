-- P0-008: promote the unapplied portal booking transaction contract.
-- The application invokes this RPC only through the service-role route after
-- authenticating and resolving the customer, so direct client execution is denied.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL search_path = public, extensions, pg_temp;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- The baseline predates the server-backed booking lifecycle columns. Restore
-- the deployed shape before installing indexes, constraints, and triggers.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS work_order_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS lifecycle_metadata jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE public.bookings
  ALTER COLUMN shop_id SET NOT NULL;

DO $p0_008$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('bookings_anchor_chk', 'CHECK (customer_id IS NOT NULL OR vehicle_id IS NOT NULL OR work_order_id IS NOT NULL)'),
      ('bookings_cancelled_by_fkey', 'FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('bookings_time_window_chk', 'CHECK (starts_at < ends_at)'),
      ('bookings_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE SET NULL')
    ) AS expected(constraint_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.bookings'::regclass
        AND conname = item.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.bookings ADD CONSTRAINT %I %s NOT VALID',
        item.constraint_name,
        item.definition
      );
      EXECUTE format(
        'ALTER TABLE public.bookings VALIDATE CONSTRAINT %I',
        item.constraint_name
      );
    END IF;
  END LOOP;
END
$p0_008$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_work_order_id_unique
  ON public.bookings (work_order_id)
  WHERE work_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS work_orders_portal_start_source_row_id_unique
  ON public.work_orders (source_row_id)
  WHERE source_row_id IS NOT NULL
    AND source_row_id LIKE 'portal_start:%';

DO $p0_008$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND conname = 'bookings_no_active_overlap'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_active_overlap
      EXCLUDE USING gist (
        shop_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (
        shop_id IS NOT NULL
        AND status IN ('pending', 'confirmed')
      );
  END IF;
END
$p0_008$;

CREATE OR REPLACE FUNCTION public.enforce_booking_customer_vehicle_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  vehicle_customer_id uuid;
BEGIN
  IF new.vehicle_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT v.customer_id
  INTO vehicle_customer_id
  FROM public.vehicles v
  WHERE v.id = new.vehicle_id;

  IF NOT found THEN
    RAISE EXCEPTION
      'booking % references missing vehicle %',
      new.id,
      new.vehicle_id;
  END IF;

  IF vehicle_customer_id IS NULL THEN
    RETURN new;
  END IF;

  IF new.customer_id IS NULL THEN
    new.customer_id := vehicle_customer_id;
  ELSIF new.customer_id <> vehicle_customer_id THEN
    RAISE EXCEPTION
      'booking % customer_id % does not match vehicle % customer_id %',
      new.id,
      new.customer_id,
      new.vehicle_id,
      vehicle_customer_id;
  END IF;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_booking_work_order_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  wo_shop_id uuid;
  wo_customer_id uuid;
  wo_vehicle_id uuid;
BEGIN
  IF new.work_order_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT wo.shop_id, wo.customer_id, wo.vehicle_id
  INTO wo_shop_id, wo_customer_id, wo_vehicle_id
  FROM public.work_orders wo
  WHERE wo.id = new.work_order_id;

  IF wo_shop_id IS NULL THEN
    RAISE EXCEPTION
      'booking % references missing or invalid work_order %',
      new.id,
      new.work_order_id;
  END IF;

  IF new.shop_id IS NULL THEN
    new.shop_id := wo_shop_id;
  ELSIF new.shop_id <> wo_shop_id THEN
    RAISE EXCEPTION
      'booking % shop_id % does not match work_order % shop_id %',
      new.id,
      new.shop_id,
      new.work_order_id,
      wo_shop_id;
  END IF;

  IF new.customer_id IS NULL AND wo_customer_id IS NOT NULL THEN
    new.customer_id := wo_customer_id;
  ELSIF new.customer_id IS NOT NULL
    AND wo_customer_id IS NOT NULL
    AND new.customer_id <> wo_customer_id THEN
    RAISE EXCEPTION
      'booking % customer_id % does not match work_order % customer_id %',
      new.id,
      new.customer_id,
      new.work_order_id,
      wo_customer_id;
  END IF;

  IF new.vehicle_id IS NULL AND wo_vehicle_id IS NOT NULL THEN
    new.vehicle_id := wo_vehicle_id;
  ELSIF new.vehicle_id IS NOT NULL
    AND wo_vehicle_id IS NOT NULL
    AND new.vehicle_id <> wo_vehicle_id THEN
    RAISE EXCEPTION
      'booking % vehicle_id % does not match work_order % vehicle_id %',
      new.id,
      new.vehicle_id,
      new.work_order_id,
      wo_vehicle_id;
  END IF;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_customer_booking_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_customer_user_id uuid;
BEGIN
  IF public.is_staff_for_shop(new.shop_id) THEN
    RETURN new;
  END IF;

  SELECT c.user_id
  INTO v_customer_user_id
  FROM public.customers c
  WHERE c.id = new.customer_id;

  IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Booking does not belong to the current customer';
  END IF;

  IF tg_op = 'INSERT' THEN
    IF coalesce(new.status, 'pending') <> 'pending' THEN
      RAISE EXCEPTION 'Customer bookings must begin as pending';
    END IF;
    RETURN new;
  END IF;

  IF old.status IN ('cancelled', 'completed')
    AND new.status IS DISTINCT FROM old.status THEN
    RAISE EXCEPTION 'Completed or cancelled bookings cannot be changed';
  END IF;

  IF new.status IS DISTINCT FROM old.status
    AND NOT (
      old.status IN ('pending', 'confirmed')
      AND new.status = 'cancelled'
    ) THEN
    RAISE EXCEPTION 'Customers may only cancel an active booking';
  END IF;

  IF new.shop_id IS DISTINCT FROM old.shop_id
    OR new.customer_id IS DISTINCT FROM old.customer_id
    OR new.vehicle_id IS DISTINCT FROM old.vehicle_id
    OR new.work_order_id IS DISTINCT FROM old.work_order_id
    OR new.starts_at IS DISTINCT FROM old.starts_at
    OR new.ends_at IS DISTINCT FROM old.ends_at
    OR new.notes IS DISTINCT FROM old.notes THEN
    RAISE EXCEPTION 'Customers cannot edit protected booking fields';
  END IF;

  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_booking_customer_vehicle_consistency()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_booking_work_order_consistency()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_customer_booking_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_booking_customer_vehicle_consistency()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_booking_work_order_consistency()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_customer_booking_mutation()
  TO service_role;

DO $p0_008$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      (
        'bookings_guard_customer_mutation',
        'CREATE TRIGGER bookings_guard_customer_mutation BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_customer_booking_mutation()'
      ),
      (
        'trg_enforce_booking_customer_vehicle_consistency',
        'CREATE TRIGGER trg_enforce_booking_customer_vehicle_consistency BEFORE INSERT OR UPDATE OF customer_id, vehicle_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_customer_vehicle_consistency()'
      ),
      (
        'trg_enforce_booking_work_order_consistency',
        'CREATE TRIGGER trg_enforce_booking_work_order_consistency BEFORE INSERT OR UPDATE OF shop_id, customer_id, vehicle_id, work_order_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_work_order_consistency()'
      )
    ) AS expected(trigger_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.bookings'::regclass
        AND tgname = item.trigger_name
        AND NOT tgisinternal
    ) THEN
      EXECUTE item.definition;
    END IF;
  END LOOP;
END
$p0_008$;

CREATE OR REPLACE FUNCTION public.portal_request_start_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_visit_type text,
  p_notes text,
  p_source_row_id text DEFAULT NULL
)
RETURNS TABLE (
  work_order_id uuid,
  booking_id uuid,
  deduped boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_work_order_id uuid;
  v_booking_id uuid;
  v_existing_work_order_id uuid;
  v_existing_booking_id uuid;
  v_normalized_visit_type text;
BEGIN
  v_normalized_visit_type := CASE
    WHEN p_visit_type = 'waiter' THEN 'waiter'
    WHEN p_visit_type = 'drop_off' THEN 'drop_off'
    ELSE NULL
  END;

  IF p_shop_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Missing shop/customer for portal request start';
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Invalid booking window';
  END IF;

  IF v_normalized_visit_type IS NULL THEN
    RAISE EXCEPTION 'visitType must be waiter or drop_off';
  END IF;

  IF p_source_row_id IS NOT NULL AND length(trim(p_source_row_id)) > 0 THEN
    SELECT w.id
      INTO v_existing_work_order_id
    FROM public.work_orders w
    WHERE w.shop_id = p_shop_id
      AND w.customer_id = p_customer_id
      AND w.source_row_id = p_source_row_id
    ORDER BY w.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_existing_work_order_id IS NOT NULL THEN
      SELECT b.id
        INTO v_existing_booking_id
      FROM public.bookings b
      WHERE b.work_order_id = v_existing_work_order_id
      ORDER BY b.created_at DESC
      LIMIT 1;

      IF v_existing_booking_id IS NOT NULL THEN
        RETURN QUERY
        SELECT v_existing_work_order_id, v_existing_booking_id, true;
        RETURN;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.work_orders (
    shop_id,
    customer_id,
    vehicle_id,
    status,
    approval_state,
    is_waiter,
    scheduled_at,
    notes,
    source_row_id
  )
  VALUES (
    p_shop_id,
    p_customer_id,
    p_vehicle_id,
    'awaiting_approval',
    'pending',
    (v_normalized_visit_type = 'waiter'),
    p_starts_at,
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_source_row_id, '')), '')
  )
  RETURNING id INTO v_work_order_id;

  INSERT INTO public.bookings (
    shop_id,
    customer_id,
    vehicle_id,
    work_order_id,
    starts_at,
    ends_at,
    status,
    notes
  )
  VALUES (
    p_shop_id,
    p_customer_id,
    p_vehicle_id,
    v_work_order_id,
    p_starts_at,
    p_ends_at,
    'pending',
    nullif(trim(coalesce(p_notes, '')), '')
  )
  RETURNING id INTO v_booking_id;

  RETURN QUERY
  SELECT v_work_order_id, v_booking_id, false;
EXCEPTION
  WHEN unique_violation THEN
    IF p_source_row_id IS NOT NULL AND length(trim(p_source_row_id)) > 0 THEN
      SELECT w.id
        INTO v_existing_work_order_id
      FROM public.work_orders w
      WHERE w.shop_id = p_shop_id
        AND w.customer_id = p_customer_id
        AND w.source_row_id = p_source_row_id
      ORDER BY w.created_at DESC NULLS LAST
      LIMIT 1;

      IF v_existing_work_order_id IS NOT NULL THEN
        SELECT b.id
          INTO v_existing_booking_id
        FROM public.bookings b
        WHERE b.work_order_id = v_existing_work_order_id
        ORDER BY b.created_at DESC
        LIMIT 1;

        IF v_existing_booking_id IS NOT NULL THEN
          RETURN QUERY
          SELECT v_existing_work_order_id, v_existing_booking_id, true;
          RETURN;
        END IF;
      END IF;
    END IF;

    RAISE;
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'This time overlaps an existing booking'
      USING errcode = 'P0001';
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_request_start_atomic(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.portal_request_start_atomic(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, text
) TO service_role;

COMMIT;
