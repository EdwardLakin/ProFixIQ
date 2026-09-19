-- Missed by the original public-schema-scoped search_path pass: this trigger
-- helper lives in the onboarding_agent schema, not public.
alter function onboarding_agent.set_updated_at() set search_path = 'onboarding_agent, public, extensions, pg_temp';
