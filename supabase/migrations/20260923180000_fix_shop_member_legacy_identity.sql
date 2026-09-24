-- Codex review on #1731 (the demo-access-expiry reconciliation PR) found a
-- P1 correctness defect in the already-live is_shop_member()/shop_role():
-- the shop_members-joined bodies recorded by that reconciliation (copied
-- verbatim from what a manual production hotfix had already applied) join
-- profiles to shop_members on "pr.user_id = sm.user_id" and then require
-- "sm.user_id = auth.uid()".
--
-- That assumes shop_members.user_id always equals profiles.user_id
-- (= auth.uid()). It does not. The trigger and every code path that
-- inserts shop_members (trg_profiles_sync_shop_membership from
-- 20260804120000_codex_review_followup_hardening.sql, the seed backfill in
-- 20260804053000_seed_canonical_shop_membership.sql, and the owner
-- bootstrap functions) all insert shop_members.user_id = profiles.id, the
-- canonical profile id -- not profiles.user_id. For a normal profile where
-- id = user_id = auth.uid() this happens to work by coincidence. For an
-- imported/legacy profile where id and user_id differ (the case
-- resolveCanonicalStaffProfile()/admin-access.ts and current_shop_id()'s
-- own "p.id = auth.uid() or p.user_id = auth.uid()" pattern already exist
-- to support), shop_members.user_id holds profiles.id while auth.uid()
-- matches profiles.user_id instead -- so "sm.user_id = auth.uid()" never
-- matches, and both functions incorrectly deny a real member.
--
-- Verified against canonical production (read-only): zero profiles
-- currently have id <> user_id, so this has not yet denied any real user,
-- but it is a live latent defect in a security-relevant function, not a
-- hypothetical -- the moment any imported/legacy profile exists, every RLS
-- policy and application check delegating to is_shop_member()/shop_role()
-- (including their is_shop_member_v2()/shop_role_v2() wrappers, which call
-- straight through) would wrongly reject that member.
--
-- Fix: join shop_members to profiles on the invariant those write paths
-- actually maintain (pr.id = sm.user_id), then check the calling user's
-- identity against either supported profiles column, exactly matching
-- current_shop_id()'s already-established dual-identity pattern. Everything
-- else -- signature, return type, language, STABLE/SECURITY DEFINER,
-- search_path, the demo_access_expires_at condition PR 1 (#1720) and its
-- follow-up (#1723) added -- is unchanged.

-- Preserve the argument name installed by the existing database lineage.
-- The clean baseline uses p_shop; canonical production uses p_shop_id.
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
CREATE OR REPLACE FUNCTION public.is_shop_member(%I uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public, extensions, pg_temp'
AS $function$
  select exists (
    select 1
    from public.shop_members sm
    join public.profiles pr
      on pr.id = sm.user_id
     and pr.shop_id = sm.shop_id
    where sm.shop_id = $1
      and (pr.id = auth.uid() or pr.user_id = auth.uid())
      and (pr.demo_access_expires_at is null or pr.demo_access_expires_at > now())
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
    on pr.id = sm.user_id
   and pr.shop_id = sm.shop_id
  where sm.shop_id = $1
    and (pr.id = auth.uid() or pr.user_id = auth.uid())
    and (pr.demo_access_expires_at is null or pr.demo_access_expires_at > now())
  limit 1;
$function$;
