import { describe, expect, it } from "vitest";
import {
  isKnownPlanInput,
  isUnsupportedCompletePlanForCheckout,
  normalizeCanonicalPlan,
} from "../features/stripe/lib/stripe/plan-normalization";
import { getPlanDisplayLabel, resolveSeatLimitForPlan } from "../features/stripe/lib/stripe/constants";

describe("plan normalization complete aliases", () => {
  it("keeps legacy plans normalized to legacy canonical keys", () => {
    expect(normalizeCanonicalPlan("starter")).toBe("starter");
    expect(normalizeCanonicalPlan("pro")).toBe("pro");
    expect(normalizeCanonicalPlan("unlimited")).toBe("unlimited");
  });

  it("normalizes complete_10/50/unlimited into storage-compatible legacy keys", () => {
    expect(normalizeCanonicalPlan("complete_10")).toBe("starter");
    expect(normalizeCanonicalPlan("complete_50")).toBe("pro");
    expect(normalizeCanonicalPlan("complete_unlimited")).toBe("unlimited");
  });

  it("recognizes complete_100 but does not normalize it to a storage/checkout key", () => {
    expect(isKnownPlanInput("complete_100")).toBe(true);
    expect(normalizeCanonicalPlan("complete_100")).toBeNull();
    expect(isUnsupportedCompletePlanForCheckout("complete_100")).toBe(true);
  });

  it("maps legacy and complete keys to Complete display labels", () => {
    expect(getPlanDisplayLabel("starter")).toBe("Complete 10");
    expect(getPlanDisplayLabel("pro")).toBe("Complete 50");
    expect(getPlanDisplayLabel("unlimited")).toBe("Complete Unlimited");
    expect(getPlanDisplayLabel("complete_10")).toBe("Complete 10");
    expect(getPlanDisplayLabel("complete_50")).toBe("Complete 50");
    expect(getPlanDisplayLabel("complete_100")).toBe("Complete 100");
    expect(getPlanDisplayLabel("complete_unlimited")).toBe("Complete Unlimited");
  });

  it("resolves seat limits for complete aliases", () => {
    expect(resolveSeatLimitForPlan("complete_10")).toBe(10);
    expect(resolveSeatLimitForPlan("complete_50")).toBe(50);
    expect(resolveSeatLimitForPlan("complete_100")).toBe(100);
    expect(resolveSeatLimitForPlan("complete_unlimited")).toBe(Number.MAX_SAFE_INTEGER);
  });
});
