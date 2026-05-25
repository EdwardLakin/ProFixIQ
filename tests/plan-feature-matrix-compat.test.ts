import { describe, expect, it } from "vitest";

import { featureMap } from "@/features/shared/lib/plan/features";

describe("plan feature matrix compatibility", () => {
  it("enables work_orders for starter", () => {
    expect(featureMap.work_orders.access.starter).toBe(true);
  });

  it("enables inspection_flow for starter", () => {
    expect(featureMap.inspection_flow.access.starter).toBe(true);
  });

  it("enables customer_portal for starter", () => {
    expect(featureMap.customer_portal.access.starter).toBe(true);
  });

  it("enables smart_scheduling for starter", () => {
    expect(featureMap.smart_scheduling.access.starter).toBe(true);
  });

  it("does not imply purchasable add-ons", () => {
    for (const feature of Object.values(featureMap)) {
      expect(feature.access.addOnAvailable ?? false).toBe(false);
    }
  });

  it("keeps unknown feature access safe/false", () => {
    const unknownFeature = (featureMap as Record<string, unknown>)[
      "unknown_feature"
    ];
    expect(unknownFeature).toBeUndefined();
    expect(Boolean(unknownFeature)).toBe(false);
  });
});
