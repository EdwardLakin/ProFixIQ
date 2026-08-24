\set ON_ERROR_STOP on

-- The scoped product-entitlement helper requires a real actor context. Start
-- this runtime as the trusted service caller, then let the included regression
-- switch to authenticated identities for its browser/RLS assertions.
select set_config('request.jwt.claim.role', 'service_role', false);

\ir field-owner-truck-boundary-hotfix.runtime.sql
