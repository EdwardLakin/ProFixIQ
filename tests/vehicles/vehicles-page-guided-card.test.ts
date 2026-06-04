import { describe, expect, it } from "vitest";
import { parseGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";
import { shouldShowVehicleOnboardingCard } from "@/features/vehicles/lib/guided";

describe("Vehicles page guided onboarding card visibility", () => {
  it("does not show the onboarding card during a normal Vehicles visit", () => {
    expect(shouldShowVehicleOnboardingCard(parseGuidedOnboardingQuery(new URLSearchParams()))).toBe(false);
  });

  it("shows the onboarding card for the vehicles import highlight query", () => {
    const guidedQuery = parseGuidedOnboardingQuery(new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "vehicles",
      highlight: "vehicle-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    }));

    expect(shouldShowVehicleOnboardingCard(guidedQuery)).toBe(true);
  });
});
