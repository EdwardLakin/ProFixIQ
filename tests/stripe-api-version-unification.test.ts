import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { STRIPE_API_VERSION } from "../features/stripe/lib/stripe/client";

const BILLING_STRIPE_SURFACES = [
  "app/api/stripe/checkout/route.ts",
  "app/api/stripe/portal/route.ts",
  "app/api/stripe/session/route.ts",
  "app/api/stripe/payments/checkout/route.ts",
  "app/api/portal/payments/checkout/route.ts",
  "app/api/stripe/connect/onboard/route.ts",
  "features/stripe/api/stripe/webhook/route.ts",
  "features/stripe/api/stripe/checkout/link-user/route.ts",
  "app/landing/actions.ts",
  "app/pay/success/page.tsx",
  "features/stripe/lib/getStripePlans.ts",
  "features/stripe/lib/stripe/getPlans.ts",
] as const;

describe("stripe api version unification", () => {
  it("uses one canonical Stripe API version string", () => {
    expect(STRIPE_API_VERSION).toBe("2024-04-10");
  });

  it("keeps billing checkout/portal/session/webhook paths on the shared Stripe client", async () => {
    for (const file of BILLING_STRIPE_SURFACES) {
      const source = await readFile(file, "utf8");
      expect(source).toContain("createStripeClient(");
      expect(source).not.toContain("apiVersion:");
      expect(source).not.toContain("new Stripe(");
    }
  });
});
