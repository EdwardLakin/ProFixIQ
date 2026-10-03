begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Every demo prospect previously shared the exact same internal demo shop
-- (the one pointed to by the server-only DEMO_SHOP_ID env var), with zero
-- isolation beyond this app's standard "any staff sees the whole shop"
-- visibility: two concurrent prospects would see each other's live work
-- orders, customers, and vehicles as they created them during testing.
--
-- Going forward, that one shop becomes a read-only template; each prospect
-- gets their own cloned shop (see createDemoProspect() in
-- features/ops/server/demoAccess.ts), isolated by the same shop_id-scoped
-- RLS every other tenant in this app already relies on -- no new RLS is
-- needed, since shop_id is already the proven tenant boundary everywhere.
--
-- demo_prospect_profile_id marks a shop as a per-prospect clone (the
-- template shop itself keeps this null) and identifies its owning prospect.
-- Nullable so a shop can be created first and the profile linked back after
-- (the profile's own shop_id FK requires the shop to already exist, and
-- vice versa -- this breaks that ordering cycle).
alter table public.shops
  add column if not exists demo_prospect_profile_id uuid references public.profiles(id) on delete set null;

-- A profile owns at most one prospect shop.
create unique index if not exists shops_demo_prospect_profile_id_key
  on public.shops (demo_prospect_profile_id)
  where demo_prospect_profile_id is not null;

-- Archive marker for an expired prospect's shop. Archiving only ever marks a
-- shop (and excludes it from ops/login) -- it never deletes or clears data,
-- so extending an archived prospect's access can simply clear this column
-- to restore their still-intact shop.
alter table public.shops
  add column if not exists demo_shop_archived_at timestamptz;

commit;
