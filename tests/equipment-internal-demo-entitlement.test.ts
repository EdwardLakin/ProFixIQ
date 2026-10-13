import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Equipment internal demo entitlement", () => {
  it("grants the trusted internal_demo shop override before Stripe lookup", () => {
    const source = readFileSync(
      "features/equipment/server/equipmentAddonEntitlement.ts",
      "utf8",
    );

    expect(source).toContain('const INTERNAL_DEMO_ENTITLEMENT = "internal_demo"');
    expect(source).toContain(
      '.select("id,stripe_customer_id,stripe_subscription_id,billing_entitlement_override")',
    );
    expect(source).toContain(
      "if (shop.billing_entitlement_override === INTERNAL_DEMO_ENTITLEMENT)",
    );
    expect(source).toContain("return internalDemoEntitlement()");

    const overrideCheck = source.indexOf(
      "if (shop.billing_entitlement_override === INTERNAL_DEMO_ENTITLEMENT)",
    );
    const stripeLookup = source.indexOf("stripe.subscriptions.retrieve(subscriptionId)");
    expect(overrideCheck).toBeGreaterThan(-1);
    expect(stripeLookup).toBeGreaterThan(overrideCheck);
  });
});
