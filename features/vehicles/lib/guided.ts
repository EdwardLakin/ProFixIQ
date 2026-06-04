import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

export function shouldShowVehicleOnboardingCard(guidedQuery: GuidedOnboardingQuery | null): boolean {
  return guidedQuery?.onboardingStep === "vehicles" && guidedQuery.highlight === "vehicle-import";
}
