-- Demo Shop access foundation — follow-up to PR 1 (20260922160000).
--
-- Audit after PR 1 landed found that most tenant-scoped tables (work_orders,
-- work_order_lines, invoices, payments, history, inspections, and more) are
-- gated by RLS policies of the shape "shop_id = current_shop_id()", not by
-- is_shop_member()/shop_role()/is_staff_for_shop() (the three helpers PR 1
-- made expiry-aware). Until now, neither current_shop_id() nor
-- set_current_shop_id(uuid) checked profiles.demo_access_expires_at, so an
-- expired demo profile could still establish a valid shop context and reach
-- those tables' data — a gap independent of, and not closed by, PR 1.
--
-- Per 20260802024436_advisor_estimate_workflow.sql's own comment,
-- current_shop_id() no longer reads the request-local GUC that
-- set_current_shop_id() sets — it resolves the shop directly from the
-- authenticated profile on every call, exactly like is_shop_member().
-- set_current_shop_id() is kept only for existing callers that still call it
-- before a write; it revalidates the same profile identity independently.
-- Both are therefore independent authorization gates and both need the same
-- expiry condition; fixing only one would leave the other's callers exposed.
--
-- Both functions get exactly the same narrow addition already applied to
-- is_shop_member()/shop_role()/is_staff_for_shop() in PR 1: an added
-- "demo_access_expires_at is null or demo_access_expires_at > now()"
-- condition on the existing profile-membership check. Everything else about
-- each function — signature, return type, language, SECURITY DEFINER,
-- search_path, the profiles.id/profiles.user_id identity resolution, the
-- GUC-setting behavior, and the exception raised by set_current_shop_id()
-- for a real shop mismatch — is unchanged.
--
-- Residual, intentionally not touched here (out of scope for this narrow
-- fix, consistent with PR 1's own deferred findings): three policies
-- (parts_disposition_events, parts_operation_keys,
-- work_order_correction_sessions) OR the app.current_shop_id GUC check with
-- a raw "EXISTS (SELECT 1 FROM profiles ...)" fallback that does not go
-- through current_shop_id() at all, so their fallback branch stays
-- expiry-blind. Tracked as the same class of residual RLS gap as PR 1's
-- assistant_daily_summaries_*/agent_requests_* finding.

CREATE OR REPLACE FUNCTION public.current_shop_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  select p.shop_id
  from public.profiles p
  where (
      p.id = (select auth.uid())
      or p.user_id = (select auth.uid())
    )
    and (p.demo_access_expires_at is null or p.demo_access_expires_at > now())
  order by
    case when p.id = (select auth.uid()) then 0 else 1 end,
    p.id
  limit 1;
$$;

CREATE OR REPLACE FUNCTION public.set_current_shop_id(p_shop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
begin
  if p_shop_id is null or not exists (
    select 1
    from public.profiles p
    where p.shop_id = p_shop_id
      and (
        p.id = (select auth.uid())
        or p.user_id = (select auth.uid())
      )
      and (p.demo_access_expires_at is null or p.demo_access_expires_at > now())
  ) then
    raise exception 'Not allowed to set current shop to %', p_shop_id
      using errcode = '42501';
  end if;

  perform set_config('app.current_shop_id', p_shop_id::text, true);
end;
$$;
