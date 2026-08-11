import { describe, expect, it } from "vitest";

import { resolveMobileFieldServiceAccess } from "./access";

describe("resolveMobileFieldServiceAccess", () => {
  it("does not grant Field Service to a standard shop mechanic", () => {
    expect(
      resolveMobileFieldServiceAccess({
        serviceModel: "mobile",
        onboardingCompletedAt: new Date().toISOString(),
        isFieldOperator: false,
        canonicalRole: "mechanic",
      }),
    ).toMatchObject({
      fieldServiceEnabled: true,
      canAccessFieldService: false,
    });
  });

  it("requires a completed mobile or both configuration", () => {
    expect(
      resolveMobileFieldServiceAccess({
        serviceModel: "shop",
        onboardingCompletedAt: new Date().toISOString(),
        isFieldOperator: true,
        canonicalRole: "mechanic",
      }).canAccessFieldService,
    ).toBe(false);
    expect(
      resolveMobileFieldServiceAccess({
        serviceModel: "both",
        onboardingCompletedAt: new Date().toISOString(),
        isFieldOperator: true,
        canonicalRole: "mechanic",
      }).canAccessFieldService,
    ).toBe(true);
  });
});
