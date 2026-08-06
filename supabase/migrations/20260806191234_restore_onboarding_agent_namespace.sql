begin;

-- Production API config exposes the legacy onboarding_agent namespace. Its
-- production-owned objects are outside this public-schema reconciliation, but
-- the namespace must exist on clean databases or PostgREST cannot build its
-- schema cache. Keep the empty compatibility namespace service-role only.
create schema if not exists onboarding_agent;
revoke all on schema onboarding_agent from public, anon, authenticated;
grant usage on schema onboarding_agent to service_role;

-- Deliver after commit so PostgREST retries the schema cache immediately.
notify pgrst, 'reload schema';

commit;
