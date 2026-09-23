-- Production reconciliation for the demo-expiry rollout.
--
-- The app began selecting profiles.demo_access_expires_at before production
-- had the column. Middleware therefore treated otherwise-valid owner profiles
-- as unresolved and redirected /dashboard -> /onboarding, while the onboarding
-- page (which selects a narrower profile shape) redirected back to /dashboard.
-- Keep this additive/idempotent so production and clean replay converge.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_access_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_shop_member(p_shop_id uuid)
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
    where sm.shop_id = p_shop_id
      and sm.user_id = auth.uid()
      and (pr.demo_access_expires_at is null or pr.demo_access_expires_at > now())
  );
$function$;

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
