begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- This immutable helper only normalizes a caller-supplied role label; it does
-- not read tenant data. Authenticated RLS policies and the security-invoker
-- customer pricing summary both depend on it, so authenticated must be able to
-- execute it. Anonymous access remains closed.
revoke all on function public.canonical_shop_membership_role(text)
  from public, anon;
grant execute on function public.canonical_shop_membership_role(text)
  to authenticated, service_role;

commit;
