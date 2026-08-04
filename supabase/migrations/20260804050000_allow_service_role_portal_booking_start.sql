BEGIN;

CREATE OR REPLACE FUNCTION public.guard_customer_booking_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_customer_user_id uuid;
BEGIN
  -- Portal request creation is performed by a tenant-validated server route
  -- through the service-role client. Service role already bypasses RLS and is
  -- the only non-user actor allowed to bypass the customer mutation rules.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN new;
  END IF;

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

REVOKE ALL ON FUNCTION public.guard_customer_booking_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_customer_booking_mutation()
  TO service_role;

COMMIT;
