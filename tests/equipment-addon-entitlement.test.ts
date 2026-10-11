import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Equipment add-on billing and entitlement contract", () => {
  it("keeps Equipment as a priced add-on outside the base package catalog", () => {
    const billing = read("features/stripe/lib/stripe/product-packages.ts");

    expect(billing).toContain(
      'EQUIPMENT_ADDON_LOOKUP_KEY =\n  "profixiq_equipment_addon_monthly_usd_v1"',
    );
    expect(billing).toContain("EQUIPMENT_ADDON_MONTHLY_CENTS = 14_900");
    expect(billing).toContain(
      'LIVE_EQUIPMENT_ADDON_PRICE_ID =\n  "price_1UPOWZITYwJQigUIfhQ2LgGg"',
    );
    expect(billing).not.toContain('"equipment_addon",\n] as const');
  });

  it("requires Complete plus the Equipment subscription item", () => {
    const entitlement = read(
      "features/equipment/server/equipmentAddonEntitlement.ts",
    );

    expect(entitlement).toContain(
      'packageKey === "complete_operations"',
    );
    expect(entitlement).toContain("isProductSubscriptionEntitled");
    expect(entitlement).toContain("hasAddonItem");
    expect(entitlement).toContain("EQUIPMENT_ADDON_LOOKUP_KEY");
    expect(entitlement).toContain("EQUIPMENT_ADDON_PRODUCT_KEY");
  });

  it("derives access from the canonical live Stripe subscription and fails closed", () => {
    const route = read("app/api/equipment/entitlement/route.ts");

    expect(route).toContain("requireShopScopedApiAccess()");
    expect(route).toContain('createStripeClient(mustEnv("STRIPE_SECRET_KEY"))');
    expect(route).toContain("stripe.subscriptions.retrieve");
    expect(route).toContain("canonical Stripe linkage mismatch");
    expect(route).toContain("resolveEquipmentAddonEntitlement(subscription)");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).toContain("{ status: 503 }");
  });

  it("only exposes off-road equipment selection after entitlement succeeds", () => {
    const builder = read(
      "features/inspections/app/inspection/custom-inspection/page.tsx",
    );

    expect(builder).toContain('fetch("/api/equipment/entitlement"');
    expect(builder).toContain("setEquipmentAddonEnabled(payload.enabled === true)");
    expect(builder).toContain("equipmentAddonEnabled ? (");
    expect(builder).toContain('<option value="off_road">Off-road equipment</option>');
    expect(builder).toContain(
      'equipmentAddonEnabled && equipmentScope === "off_road"',
    );
    expect(builder).toContain(
      'equipmentAddonEnabled ? equipmentScope : "road"',
    );
  });
});
