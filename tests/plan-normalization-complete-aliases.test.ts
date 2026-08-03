import { describe, expect, it } from "vitest";
import {
  isKnownPlanInput,
  isUnsupportedCompletePlanForCheckout,
  normalizeCanonicalPlan,
} from "../features/stripe/lib/stripe/plan-normalization";
import {
  getPlanDisplayLabel,
  resolveSeatLimitForPlan,
} from "../features/stripe/lib/stripe/constants";
import {
  calculateMonthlySubscriptionPrice,
  getAdditionalSeatQuantity,
  shouldUseUnlimitedPrice,
} from "../features/stripe/lib/stripe/billing-model";

describe("base plus seats plan normalization", () => {
  it("normalizes legacy capped plans to the base subscription", () => {
    expect(normalizeCanonicalPlan("starter")).toBe("starter");
    expect(normalizeCanonicalPlan("pro")).toBe("starter");
    expect(normalizeCanonicalPlan("complete_50")).toBe("starter");
    expect(normalizeCanonicalPlan("complete_100")).toBe("starter");
    expect(normalizeCanonicalPlan("unlimited")).toBe("unlimited");
  });

  it("recognizes legacy inputs but excludes them from new checkout", () => {
    expect(isKnownPlanInput("complete_100")).toBe(true);
    expect(isUnsupportedCompletePlanForCheckout("complete_100")).toBe(true);
    expect(isUnsupportedCompletePlanForCheckout("pro")).toBe(true);
    expect(isUnsupportedCompletePlanForCheckout("starter")).toBe(false);
  });

  it("uses two customer-facing plan labels", () => {
    expect(getPlanDisplayLabel("starter")).toBe("ProFixIQ Complete");
    expect(getPlanDisplayLabel("pro")).toBe("ProFixIQ Complete");
    expect(getPlanDisplayLabel("complete_100")).toBe("ProFixIQ Complete");
    expect(getPlanDisplayLabel("unlimited")).toBe("ProFixIQ Unlimited");
  });

  it("does not hard-cap active subscriptions by plan", () => {
    expect(resolveSeatLimitForPlan("starter")).toBe(Number.MAX_SAFE_INTEGER);
    expect(resolveSeatLimitForPlan("pro")).toBe(Number.MAX_SAFE_INTEGER);
    expect(resolveSeatLimitForPlan("unlimited")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("calculates included seats, additional seats, and the automatic cap", () => {
    expect(getAdditionalSeatQuantity(10)).toBe(0);
    expect(getAdditionalSeatQuantity(11)).toBe(1);
    expect(calculateMonthlySubscriptionPrice(10)).toBe(299);
    expect(calculateMonthlySubscriptionPrice(11)).toBe(349);
    expect(calculateMonthlySubscriptionPrice(16)).toBe(599);
    expect(shouldUseUnlimitedPrice(16)).toBe(false);
    expect(shouldUseUnlimitedPrice(17)).toBe(true);
    expect(calculateMonthlySubscriptionPrice(17)).toBe(600);
  });
});
