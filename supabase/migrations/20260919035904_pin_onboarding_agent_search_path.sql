-- Missed by the original public-schema-scoped search_path pass: this trigger
-- helper lives in the onboarding_agent schema, not public. Guarded with
-- to_regprocedure() for the same clean-replay reason as the other search_path
-- and grant-lockdown migrations in this PR.

do $$
begin
  if to_regprocedure('onboarding_agent.set_updated_at()') is not null then
    execute 'alter routine onboarding_agent.set_updated_at() set search_path = ''onboarding_agent, public, extensions, pg_temp''';
  end if;
end
$$;
