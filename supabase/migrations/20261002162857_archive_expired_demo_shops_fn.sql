begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Follow-up to 20261002000000_demo_prospect_shop_isolation.sql.
--
-- archiveExpiredDemoProspects() previously archived shops in three separate
-- round trips (SELECT expired profile ids, SELECT their shops, UPDATE those
-- shops), each unbounded by any row cap. That left two problems: (1) a race
-- window between the SELECTs and the UPDATE -- an operator's extend() could
-- land in that window and still get overwritten by the archive, leaving the
-- shop archived while its owner's new expiry says otherwise; (2) each
-- unbounded SELECT is capped at the Data API's default 1000-row limit
-- (supabase/config.toml), so once the number of ever-created demo
-- prospects passed that cap, newer expired prospects could stop being
-- archived at all.
--
-- This function folds the whole operation into one atomic UPDATE ... FROM,
-- re-checking each profile's current demo_access_expires_at at the moment
-- of the single statement rather than against an earlier snapshot, and with
-- no row cap since it runs server-side, not through the Data API.
--
-- It also expires every member profile of a shop it archives (not just the
-- owner): a prospect can invite staff into their own demo shop (the
-- internal_demo billing override exempts it from the seat-count check), and
-- those staff profiles are provisioned with demo_access_expires_at = null,
-- so the already-shipped per-profile expiry checks in current_shop_id(),
-- is_shop_member(), shop_role(), and is_staff_for_shop() (see
-- 20260922160000_demo_shop_access_expiry.sql and
-- 20260923000000_demo_shop_current_shop_context_expiry.sql) would otherwise
-- never block them. Setting their demo_access_expires_at here reuses that
-- exact, already-approved mechanism instead of changing any of those shared
-- functions -- an archived shop's staff lose access the same way its owner
-- does, through the same existing check every other RLS policy already
-- relies on.
CREATE OR REPLACE FUNCTION public.archive_expired_demo_shops(p_cutoff timestamptz)
RETURNS TABLE(shop_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
begin
  RETURN QUERY
  WITH archived AS (
    UPDATE public.shops s
    SET demo_shop_archived_at = now()
    FROM public.profiles p
    WHERE s.demo_prospect_profile_id = p.id
      AND s.billing_entitlement_override = 'internal_demo'
      AND s.demo_shop_archived_at IS NULL
      AND p.role = 'owner'
      AND p.demo_access_expires_at IS NOT NULL
      AND p.demo_access_expires_at < p_cutoff
    RETURNING s.id
  ),
  expired_members AS (
    UPDATE public.profiles pr
    SET demo_access_expires_at = now()
    WHERE pr.shop_id IN (SELECT id FROM archived)
      AND (pr.demo_access_expires_at IS NULL OR pr.demo_access_expires_at > now())
    RETURNING 1
  )
  SELECT id FROM archived;
end;
$$;

REVOKE ALL ON FUNCTION public.archive_expired_demo_shops(timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.archive_expired_demo_shops(timestamptz) TO service_role;

commit;
