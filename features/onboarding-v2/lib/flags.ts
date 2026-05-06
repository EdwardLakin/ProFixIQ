export function isOnboardingV2NavEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED ?? process.env.ONBOARDING_V2_ENABLED ?? "";
  return raw.trim().toLowerCase() === "true";
}
