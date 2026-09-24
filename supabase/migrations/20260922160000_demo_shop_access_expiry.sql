-- Demo Shop access foundation (PR 1 of the Demo Shop project).
--
-- Adds a nullable expiry marker to the canonical membership table
-- (public.profiles) and teaches the SQL helpers that other membership
-- checks delegate through, or that are used independently by RLS
-- policies and DB mutation guards, to treat an expired profile as not a
-- member/not staff. Null = normal (non-demo) user, entirely unaffected.
--
-- public.is_staff_for_shop(uuid) is a separate profiles-reading helper
-- from is_shop_member()/shop_role() (used independently by existing RLS
-- policies and DB mutation guards, not by delegation from either of
-- them), so it gets the same expiry condition added directly below,
-- with its existing role semantics and function/security/search-path
-- characteristics otherwise unchanged.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_access_expires_at timestamptz;

-- Preserve the existing argument name on either supported database lineage:
-- clean baseline uses p_shop; canonical production uses p_shop_id. PostgreSQL
-- rejects a CREATE OR REPLACE that renames an existing input parameter.
DO $migration$
DECLARE
  v_arg_name text;
BEGIN
  SELECT p.proargnames[1] INTO v_arg_name
  FROM pg_proc p
  WHERE p.oid = 'public.is_shop_member(uuid)'::regprocedure;

  IF v_arg_name NOT IN ('p_shop', 'p_shop_id') OR v_arg_name IS NULL THEN
    RAISE EXCEPTION 'Unexpected is_shop_member argument name: %', v_arg_name;
  END IF;

  EXECUTE format($definition$
CREATE OR REPLACE FUNCTION "public"."is_shop_member"(%I uuid) RETURNS boolean
    LANGUAGE "sql" STABLE
    SET search_path TO 'public, extensions, pg_temp'
    AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = auth.uid()
      AND pr.shop_id = $1
      AND (pr.demo_access_expires_at IS NULL OR pr.demo_access_expires_at > now())
  );
$function$;
$definition$, v_arg_name);
END;
$migration$;

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

CREATE OR REPLACE FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET search_path TO 'public, extensions, pg_temp'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id   = auth.uid()
      and p.shop_id = _shop
      and p.role in ('owner','admin','manager','advisor','parts','mechanic')
      and (p.demo_access_expires_at is null or p.demo_access_expires_at > now())
  );
$$;
