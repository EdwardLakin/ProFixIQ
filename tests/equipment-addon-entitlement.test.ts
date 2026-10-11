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

  it("requires an actual Complete base item plus the Equipment subscription item", () => {
    const entitlement = read(
      "features/equipment/server/equipmentAddonEntitlement.ts",
    );

    expect(entitlement).toContain("subscriptionHasCompleteBaseItem");
    expect(entitlement).toContain(
      "PRODUCT_PACKAGE_LOOKUP_KEYS.complete_operations",
    );
    expect(entitlement).toContain(
      "LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS.complete_operations",
    );
    expect(entitlement).toContain("hasCompleteBaseItem &&");
    expect(entitlement).toContain("isProductSubscriptionEntitled");
    expect(entitlement).toContain("hasAddonItem");
    expect(entitlement).toContain("EQUIPMENT_ADDON_LOOKUP_KEY");
    expect(entitlement).toContain("EQUIPMENT_ADDON_PRODUCT_KEY");
  });

  it("resolves billing linkage through an exact-shop privileged read after authentication", () => {
    const entitlement = read(
      "features/equipment/server/equipmentAddonEntitlement.ts",
    );
    const route = read("app/api/equipment/entitlement/route.ts");

    expect(route).toContain("requireShopScopedApiAccess()");
    expect(route).toContain(
      "resolveEquipmentAddonEntitlementForShop(\n      access.profile.shop_id",
    );
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).toContain("status: 503");

    expect(entitlement).toContain("createAdminSupabase()");
    expect(entitlement).toContain('.from("shops")');
    expect(entitlement).toContain('.eq("id", shopId)');
    expect(entitlement).toContain('createStripeClient(mustEnv("STRIPE_SECRET_KEY"))');
    expect(entitlement).toContain("stripe.subscriptions.retrieve(subscriptionId)");
    expect(entitlement).toContain("Canonical Stripe linkage mismatch");
  });

  it("enforces Equipment content on both Shop and Field template mutations", () => {
    const guard = read(
      "features/equipment/server/equipmentInspectionEntitlement.ts",
    );
    const shopRoute = read("app/api/inspections/templates/route.ts");
    const fieldRoute = read(
      "app/api/mobile/service/inspection-templates/route.ts",
    );

    expect(guard).toContain("inspectionSectionsRequireEquipment");
    expect(guard).toContain('title.startsWith("off-road —")');
    expect(guard).toContain('item.catalogScope ?? ""');
    expect(guard).toContain("resolveEquipmentAddonEntitlementForShop(shopId)");

    expect(shopRoute).toContain("shopCanMutateInspectionSections");
    expect(shopRoute).toContain("access.profile.shop_id");
    expect(shopRoute).toContain("status: 403");
    expect(shopRoute).toContain("status: 503");

    expect(fieldRoute).toContain("shopCanMutateInspectionSections");
    expect(fieldRoute).toContain("access.profile.shop_id");
    expect(fieldRoute).toContain("status: 403");
    expect(fieldRoute).toContain("status: 503");
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
