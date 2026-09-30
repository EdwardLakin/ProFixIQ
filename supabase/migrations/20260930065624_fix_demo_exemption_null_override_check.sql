begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Fixes a critical regression in the demo-shop seat-limit exemption added by
-- 20260930000000_exempt_demo_shop_from_seat_limits.sql: the constraint's
-- exemption clause compared billing_entitlement_override directly to
-- 'internal_demo' without a coalesce. For every ordinary (non-demo) shop,
-- billing_entitlement_override is NULL, so that comparison evaluates to
-- NULL (SQL three-valued logic), and `false OR NULL` is NULL -- which
-- Postgres CHECK constraints treat as satisfied (only an explicit FALSE
-- fails a check). That silently disabled shops_active_user_count_le_max_users
-- for every real, paying shop, not just the internal demo shop: once a real
-- shop's active_user_count exceeded max_users, the constraint's boolean
-- expression evaluated to NULL and the row was accepted anyway.
--
-- Coalescing the override comparison to a proper boolean restores the
-- original enforcement for real shops while leaving the internal_demo
-- exemption unchanged.
alter table public.shops
  drop constraint if exists shops_active_user_count_le_max_users;

alter table public.shops
  add constraint shops_active_user_count_le_max_users
  check (
    coalesce(active_user_count, 0) <= coalesce(max_users, 1)
    or coalesce(billing_entitlement_override, '') = 'internal_demo'
  );

commit;
