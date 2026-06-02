# Fleet Audit Access for Launch

This note documents the safe launch path for granting `edwardlakin35@icloud.com` internal fleet audit access without hardcoding the email into application guards.

## Guard model verified

- `/fleet/:path*` is covered by the middleware matcher, so unauthenticated users entering internal fleet pages are redirected through the same authenticated app route flow as dashboard, work orders, inspections, parts, mobile, and tech queue pages.
- Internal fleet pages continue to rely on the shared fleet actor guard in `app/fleet/layout.tsx`, which calls `resolveFleetActorContext` and only allows authenticated internal shop actors or existing fleet actors through.
- Fleet UI pages that need page-level capabilities continue to call `resolveFleetUiContext`; this cleanup does not bypass those checks.
- Portal fleet access remains separate: `/portal/fleet` still requires the existing `fleet_members` membership path. Internal profile role assignment alone is not portal fleet membership.

## Preferred admin UI path

If the account already exists in the target demo shop, use the existing People admin flow:

1. Sign in as an owner for the target demo shop.
2. Open **Dashboard → Admin → People** (`/dashboard/admin/people`).
3. Open the person record for `edwardlakin35@icloud.com`.
4. In **Identity & Access**, set **App role** to `manager`, `admin`, or `owner`.
   - `manager` is preferred for internal fleet audit unless admin/owner privileges are specifically needed.
   - Only owners can assign `owner` or `admin` roles.
5. Save profile updates.
6. Confirm the profile remains scoped to the target demo shop.

If the account does not exist yet, create it through **Dashboard → Admin → Create User** (`/dashboard/admin/create-user`) or the equivalent owner create-user redirect, assign the initial role, then complete the People record.

## Manual Supabase SQL fallback

Use this only when the UI path is unavailable. Run it in the Supabase SQL editor with service/admin privileges after replacing the demo shop identifier.

```sql
-- Replace with the target demo shop id or a shop lookup unique to the demo environment.
-- Example shop lookup alternative:
-- select id, name, shop_name from public.shops order by created_at desc;

begin;

with target_shop as (
  select '<TARGET_DEMO_SHOP_ID>'::uuid as shop_id
), target_user as (
  select u.id as user_id, u.email
  from auth.users u
  where lower(u.email) = lower('edwardlakin35@icloud.com')
  limit 1
), updated_profile as (
  update public.profiles p
  set
    shop_id = target_shop.shop_id,
    role = 'manager',
    updated_at = now()
  from target_shop, target_user
  where p.id = target_user.user_id
  returning p.id, p.shop_id, p.role
)
select * from updated_profile;

-- Optional verification. Expect one row with role manager and the target shop_id.
select p.id, p.email, p.shop_id, p.role
from public.profiles p
where lower(p.email) = lower('edwardlakin35@icloud.com');

commit;
```

## Optional portal fleet membership

Do **not** add this for internal fleet audit. Add `fleet_members` only if the account must also audit the external fleet portal experience.

```sql
-- Replace both ids before running. Use role 'manager' for portal-level fleet audit.
begin;

with target_user as (
  select u.id as user_id
  from auth.users u
  where lower(u.email) = lower('edwardlakin35@icloud.com')
  limit 1
), target_fleet as (
  select
    '<TARGET_FLEET_ID>'::uuid as fleet_id,
    '<TARGET_DEMO_SHOP_ID>'::uuid as shop_id
), inserted as (
  insert into public.fleet_members (user_id, fleet_id, shop_id, role)
  select target_user.user_id, target_fleet.fleet_id, target_fleet.shop_id, 'manager'
  from target_user, target_fleet
  where not exists (
    select 1
    from public.fleet_members fm
    where fm.user_id = target_user.user_id
      and fm.fleet_id = target_fleet.fleet_id
  )
  returning user_id, fleet_id, shop_id, role
)
select * from inserted;

commit;
```
