\set ON_ERROR_STOP on

-- Regression for a P1 review finding on 20260930000000_exempt_demo_shop_from_seat_limits.sql's
-- shops_active_user_count_le_max_users constraint: its exemption clause
-- compared billing_entitlement_override directly to 'internal_demo'.
-- billing_entitlement_override is NULL for every ordinary (non-demo) shop,
-- so that comparison evaluated to NULL, and `false OR NULL` is NULL in SQL
-- three-valued logic -- which Postgres CHECK constraints treat as satisfied
-- (only an explicit FALSE fails a check). That silently disabled the seat
-- cap for every real, paying shop, not just the internal demo shop.
--
-- Reproduces the exact constraint expression on a throwaway table (mirroring
-- 20260930040000_fix_demo_exemption_null_override_check.sql verbatim) to
-- prove it now correctly rejects an over-limit row when the override is
-- NULL, while still exempting the internal_demo sentinel and still
-- accepting a real shop within its limit.

begin;

create temporary table seat_limit_constraint_probe (
  active_user_count integer,
  max_users integer,
  billing_entitlement_override text
) on commit drop;

alter table seat_limit_constraint_probe
  add constraint seat_limit_constraint_probe_check
  check (
    coalesce(active_user_count, 0) <= coalesce(max_users, 1)
    or coalesce(billing_entitlement_override, '') = 'internal_demo'
  );

-- Real shop, over limit, no override: must be rejected.
do $seat_limit_constraint_real_shop_rejected$
begin
  insert into seat_limit_constraint_probe (active_user_count, max_users, billing_entitlement_override)
  values (11, 10, null);

  -- Distinct errcode so this deliberate test-failure signal is never
  -- swallowed by the "expected" handler below.
  raise exception
    'Regression: an over-limit row with a NULL billing_entitlement_override was accepted -- the seat-limit CHECK constraint is not enforcing for real shops.'
    using errcode = 'PXQ03';
exception
  when check_violation then
    -- Expected: the constraint correctly rejected the over-limit real shop.
    null;
end;
$seat_limit_constraint_real_shop_rejected$;

-- Demo shop, over limit, override set: must still be accepted.
insert into seat_limit_constraint_probe (active_user_count, max_users, billing_entitlement_override)
values (11, 10, 'internal_demo');

-- Real shop, within limit, no override: must be accepted.
insert into seat_limit_constraint_probe (active_user_count, max_users, billing_entitlement_override)
values (10, 10, null);

rollback;
