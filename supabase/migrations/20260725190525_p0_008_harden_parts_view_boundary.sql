-- P0-008: part_stock_summary is a security-invoker view, so its tenant
-- boundary must be enforced by the underlying parts relation.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parts_rw ON public.parts;
DROP POLICY IF EXISTS parts_shop_delete ON public.parts;
DROP POLICY IF EXISTS parts_shop_insert ON public.parts;
DROP POLICY IF EXISTS parts_shop_select ON public.parts;
DROP POLICY IF EXISTS parts_shop_update ON public.parts;
DROP POLICY IF EXISTS parts_authenticated_shop_select ON public.parts;
DROP POLICY IF EXISTS parts_authenticated_shop_insert ON public.parts;
DROP POLICY IF EXISTS parts_authenticated_shop_update ON public.parts;
DROP POLICY IF EXISTS parts_authenticated_shop_delete ON public.parts;

CREATE POLICY parts_authenticated_shop_select
ON public.parts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = (SELECT auth.uid()) OR actor.user_id = (SELECT auth.uid()))
      AND actor.shop_id = parts.shop_id
  )
);

CREATE POLICY parts_authenticated_shop_insert
ON public.parts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = (SELECT auth.uid()) OR actor.user_id = (SELECT auth.uid()))
      AND actor.shop_id = parts.shop_id
  )
);

CREATE POLICY parts_authenticated_shop_update
ON public.parts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = (SELECT auth.uid()) OR actor.user_id = (SELECT auth.uid()))
      AND actor.shop_id = parts.shop_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = (SELECT auth.uid()) OR actor.user_id = (SELECT auth.uid()))
      AND actor.shop_id = parts.shop_id
  )
);

CREATE POLICY parts_authenticated_shop_delete
ON public.parts
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = (SELECT auth.uid()) OR actor.user_id = (SELECT auth.uid()))
      AND actor.shop_id = parts.shop_id
  )
);

REVOKE ALL PRIVILEGES ON TABLE public.parts FROM anon;

COMMIT;
