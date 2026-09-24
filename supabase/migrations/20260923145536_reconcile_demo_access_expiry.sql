begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Promotes an already-applied production hotfix into the ordered repository
-- history, matching the precedent in
-- 20260806181455_reconcile_production_billing_protections.sql.
--
-- Demo Shop PR 1 (#1720) and its follow-up (#1723) added
-- profiles.demo_access_expires_at and taught is_shop_member(),
-- shop_role(), is_staff_for_shop(), current_shop_id(), and
-- set_current_shop_id() to treat an expired profile as not a member/not
-- staff/unable to establish shop context. Those two PRs' own migration
-- files (20260922160000_demo_shop_access_expiry.sql and
-- 20260923000000_demo_shop_current_shop_context_expiry.sql) were
-- deliberately never applied to canonical production during that work,
-- per this repo's standing instruction to defer production application
-- for explicit confirmation.
--
-- Before that confirmation happened, the same fix was applied directly to
-- canonical production under this migration's version, consolidating both
-- PRs' function changes into one statement set. This migration is that
-- SQL, added here so repository history and the remote migration ledger
-- agree going forward. All statements are idempotent (ALTER TABLE ...
-- ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION) and safe to
-- (re)apply from a clean replay of 20260922160000 -> 20260923000000 ->
-- this file, in order.
--
-- Clean replay and production both use the established p_shop_id argument
-- name for is_shop_member(uuid). CREATE OR REPLACE FUNCTION cannot rename an
-- existing input parameter, so preserve p_shop_id through this reconciliation.
-- The function body and expiry behavior otherwise remain unchanged.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_access_expires_at timestamptz;

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
      on pr.user_id = sm.user_id
     and pr.shop_id = sm.shop_id
    where sm.shop_id = $1
      and sm.user_id = auth.uid()
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
    on pr.user_id = sm.user_id
   and pr.shop_id = sm.shop_id
  where sm.shop_id = $1
    and sm.user_id = auth.uid()
    and (pr.demo_access_expires_at is null or pr.demo_access_expires_at > now())
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_staff_for_shop(_shop uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public, extensions, pg_temp'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = _shop
      and p.role in ('owner','admin','manager','advisor','parts','mechanic')
      and (p.demo_access_expires_at is null or p.demo_access_expires_at > now())
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_shop_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_current_shop_id(p_shop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

commit;
