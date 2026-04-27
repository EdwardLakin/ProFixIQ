const DEFAULT_ONBOARDING_MODEL = "gpt-5-mini";

export function getOnboardingAgentModel() {
  return (
    process.env.ONBOARDING_AGENT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_ONBOARDING_MODEL
  );
}

export function getOnboardingAgentEnabled() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
