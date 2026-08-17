import { describe, expect, it } from "vitest";

import {
  acquisitionHomeHref,
  acquisitionOnboardingHref,
} from "./acquisitionSurfaceRouting";

describe("acquisition product routing", () => {
  it.each([
    ["shop", "/dashboard", "/onboarding?surface=shop"],
    ["field", "/mobile/service", "/onboarding?surface=field"],
    ["fleet", "/dashboard/owner/fleet-access", "/onboarding?surface=fleet"],
  ] as const)(
    "keeps %s accounts on their verified product branch",
    (surface, home, onboarding) => {
      expect(acquisitionHomeHref(surface)).toBe(home);
      expect(acquisitionOnboardingHref(surface)).toBe(onboarding);
    },
  );
});
