-- P0-008: restore the live work-order creation contract without preserving the
-- ambiguous or anonymously executable production overloads.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

DO $p0_008$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.work_orders'::regclass
      AND attname = 'shop_id'
      AND NOT attnotnull
      AND NOT attisdropped
  ) THEN
    IF EXISTS (SELECT 1 FROM public.work_orders WHERE shop_id IS NULL) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23502',
        MESSAGE = 'P0-008 cannot require work_orders.shop_id while null rows exist.';
    END IF;

    ALTER TABLE public.work_orders
      ALTER COLUMN shop_id SET NOT NULL;
  END IF;
END
$p0_008$;

-- Production accumulated a six-argument overload plus a seven-argument
-- overload whose final argument has a default. Keeping both makes six-argument
-- PostgREST calls ambiguous. One canonical function supports both callers.
DROP FUNCTION IF EXISTS public.create_work_order_with_custom_id(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  boolean
);

CREATE OR REPLACE FUNCTION public.create_work_order_with_custom_id(
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_notes text DEFAULT ''::text,
  p_priority integer DEFAULT 3,
  p_is_waiter boolean DEFAULT false,
  p_advisor_id uuid DEFAULT NULL::uuid
)
RETURNS public.work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_actor_role text;
  v_custom_id text;
  v_row public.work_orders%ROWTYPE;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'Authentication is required to create a work order.';
  END IF;

  SELECT CASE lower(btrim(coalesce(p.role::text, '')))
    WHEN 'lead' THEN 'lead_hand'
    WHEN 'leadhand' THEN 'lead_hand'
    WHEN 'lead hand' THEN 'lead_hand'
    ELSE lower(btrim(coalesce(p.role::text, '')))
  END
  INTO v_actor_role
  FROM public.profiles p
  WHERE p.user_id = v_actor_user_id
    AND p.shop_id = p_shop_id
  ORDER BY p.id
  LIMIT 1;

  IF v_actor_role IS NULL OR v_actor_role NOT IN (
    'owner',
    'admin',
    'manager',
    'advisor',
    'service',
    'lead_hand',
    'foreman'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Actor is not allowed to create work orders for this shop.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.shop_id = p_shop_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Customer does not belong to the requested shop.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = p_vehicle_id
      AND v.shop_id = p_shop_id
      AND v.customer_id = p_customer_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Vehicle does not belong to the requested customer and shop.';
  END IF;

  IF p_advisor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles advisor
    WHERE advisor.id = p_advisor_id
      AND advisor.shop_id = p_shop_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Advisor does not belong to the requested shop.';
  END IF;

  IF p_priority IS NOT NULL AND (p_priority < 1 OR p_priority > 5) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Work-order priority must be between 1 and 5.';
  END IF;

  LOOP
    v_custom_id := 'WO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    INSERT INTO public.work_orders (
      shop_id,
      customer_id,
      vehicle_id,
      notes,
      priority,
      is_waiter,
      created_by,
      advisor_id,
      custom_id,
      status
    )
    VALUES (
      p_shop_id,
      p_customer_id,
      p_vehicle_id,
      coalesce(p_notes, ''),
      coalesce(p_priority, 3),
      coalesce(p_is_waiter, false),
      v_actor_user_id,
      p_advisor_id,
      v_custom_id,
      'awaiting'
    )
    -- Clean replays have a global custom_id key while the live schema has a
    -- shop-scoped custom_id key. An untargeted conflict handler is compatible
    -- with both uniqueness contracts and only retries the random identifier.
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_row;

    IF FOUND THEN
      RETURN v_row;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_work_order_with_custom_id(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  boolean,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_work_order_with_custom_id(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  boolean,
  uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_work_order_with_custom_id(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  boolean,
  uuid
) IS 'Creates one work order for an authenticated same-shop actor after tenant and role validation.';

COMMIT;
