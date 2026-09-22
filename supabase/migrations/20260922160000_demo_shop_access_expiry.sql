-- Demo Shop access foundation (PR 1 of the Demo Shop project).
--
-- Adds a nullable expiry marker to the canonical membership table
-- (public.profiles) and teaches the two SQL helpers that every other
-- membership check delegates through to treat an expired profile as not a
-- member. Null = normal (non-demo) user, entirely unaffected.
--
-- Follow-up required before demo access is fully expiry-safe at the DB
-- layer: public.is_staff_for_shop(uuid) is a separate profiles-reading
-- helper (used by RLS policies independent of is_shop_member/shop_role)
-- that this migration intentionally does not touch. An expired demo
-- profile would still pass it today. Out of scope here per the additive
-- boundary for this PR; track as a follow-up before relying on demo
-- expiry as a full RLS-layer guarantee.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_access_expires_at timestamptz;

CREATE OR REPLACE FUNCTION "public"."is_shop_member"("p_shop" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET search_path TO 'public, extensions, pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = auth.uid()
      AND pr.shop_id = p_shop
      AND (pr.demo_access_expires_at IS NULL OR pr.demo_access_expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.shop_role(shop_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select sm.role
  from public.shop_members sm
  join public.profiles pr
    on pr.user_id = sm.user_id
   and pr.shop_id = sm.shop_id
  where sm.shop_id = $1
    and sm.user_id = auth.uid()
    and (pr.demo_access_expires_at is null or pr.demo_access_expires_at > now())
  limit 1;
$function$
;
