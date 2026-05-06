import { describe, expect, it } from "vitest";

import { TILES } from "@/features/shared/config/tiles";
import { isOnboardingV2NavEnabled } from "@/features/onboarding-v2/lib/flags";

function resolveOnboardingNavForRole(role: string) {
  const navEnabled = isOnboardingV2NavEnabled();
  return TILES
    .filter((tile) => tile.roles.includes(role as never))
    .filter((tile) => (tile.href === "/dashboard/onboarding-v2" ? navEnabled : true))
    .some((tile) => tile.href === "/dashboard/onboarding-v2");
}

describe("onboarding v2 nav entry visibility", () => {
  it("shows Onboarding Agent to owner/admin when ONBOARDING_V2_ENABLED=true", () => {
    const existing = process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED;
    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = "true";

    expect(resolveOnboardingNavForRole("owner")).toBe(true);
    expect(resolveOnboardingNavForRole("admin")).toBe(true);

    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = existing;
  });

  it("hides Onboarding Agent when ONBOARDING_V2_ENABLED=false", () => {
    const existing = process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED;
    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = "false";

    expect(resolveOnboardingNavForRole("owner")).toBe(false);
    expect(resolveOnboardingNavForRole("admin")).toBe(false);

    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = existing;
  });

  it("never shows Onboarding Agent to non-owner/admin roles", () => {
    const existing = process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED;
    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = "true";

    expect(resolveOnboardingNavForRole("advisor")).toBe(false);
    expect(resolveOnboardingNavForRole("mechanic")).toBe(false);
    expect(resolveOnboardingNavForRole("parts")).toBe(false);

    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = existing;
  });
});
