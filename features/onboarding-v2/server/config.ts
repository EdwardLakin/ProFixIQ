export type OnboardingAgentConfig = {
  enabled: boolean;
  baseUrl: string | null;
  internalSecret: string | null;
  v2Enabled: boolean;
};

function asEnabled(raw: string | undefined): boolean {
  return String(raw ?? "").trim().toLowerCase() === "true";
}

export function getOnboardingAgentConfig(): OnboardingAgentConfig {
  const baseUrl = process.env.ONBOARDING_AGENT_BASE_URL?.trim() ?? null;
  const internalSecret = process.env.ONBOARDING_AGENT_INTERNAL_SECRET?.trim() ?? null;

  return {
    enabled: asEnabled(process.env.ONBOARDING_AGENT_ENABLED),
    baseUrl,
    internalSecret,
    v2Enabled: asEnabled(process.env.ONBOARDING_V2_ENABLED),
  };
}

export function getOnboardingV2NavEnabled(): boolean {
  return asEnabled(process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED) || asEnabled(process.env.ONBOARDING_V2_ENABLED);
}
