import { describe, expect, it } from "vitest";

import { isStripeSubscriptionAccessBearing } from "@/features/stripe/lib/stripe/subscriptionStatus";

describe("Stripe subscription access", () => {
  it.each(["trialing", "active"])("accepts %s subscriptions", (status) => {
    expect(isStripeSubscriptionAccessBearing(status)).toBe(true);
  });

  it.each([
    "incomplete",
    "incomplete_expired",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
    "unknown",
    null,
  ])("rejects %s subscriptions", (status) => {
    expect(isStripeSubscriptionAccessBearing(status)).toBe(false);
  });
});
