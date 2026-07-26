-- P0-008: promote the unapplied portal booking transaction contract.
-- The application invokes this RPC only through the service-role route after
-- authenticating and resolving the customer, so direct client execution is denied.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL search_path = public, extensions, pg_temp;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

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
