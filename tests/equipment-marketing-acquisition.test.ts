import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Equipment marketing and acquisition contract", () => {
  it("publishes a broad canonical Equipment acquisition page", () => {
    const page = source("app/equipment-maintenance-software/page.tsx");
    const definition = source("features/marketing/equipmentMaintenancePage.ts");
    const sitemap = source("app/sitemap.xml/route.ts");
    const routes = source("features/shared/lib/routes/shellBoundaries.ts");
    const analytics = source("features/analytics/marketingEvents.ts");
    const robots = source("app/robots.ts");

    expect(page).toContain("equipmentMaintenancePage");
    expect(page).toContain("buildSearchLandingMetadata");
    expect(definition).toContain('path: "/equipment-maintenance-software"');
    expect(definition).toContain("equipment maintenance software");
    expect(definition).toContain("excavators");
    expect(definition).toContain("forklifts");
    expect(definition).toContain("mining");
    expect(definition).toContain("stationary");
    expect(definition).toContain("attachments");
    expect(definition).toContain("Asset Health");
    expect(definition).toContain("undercarriage");
    expect(definition).toContain("wear limits");
    expect(definition).not.toContain("PM engine later");
    expect(definition).not.toContain("OEM telematics integration");

    for (const contract of [sitemap, routes, analytics, robots]) {
      expect(contract).toContain("/equipment-maintenance-software");
    }
  });

  it("prices Equipment as a Complete-only premium add-on", () => {
    const pricing = source("features/shared/components/ui/PricingSection.tsx");
    const catalog = source("features/stripe/lib/stripe/product-packages.ts");

    expect(catalog).toContain("EQUIPMENT_ADDON_MONTHLY_CENTS = 14_900");
    expect(pricing).toContain("EQUIPMENT_ADDON_MONTHLY_CENTS");
    expect(pricing).toContain("Equipment add-on");
    expect(pricing).toContain("Requires Complete Operations");
    expect(pricing).toContain('startCheckout("complete_operations", "trial", true)');
    expect(pricing).toContain("Complete + Equipment");
    expect(pricing).toContain('id="equipment"');
  });

  it("creates Complete and Equipment as items on the same acquisition subscription", () => {
    const checkout = source("app/api/stripe/checkout/route.ts");
    const priceContract = source(
      "features/stripe/lib/server/equipment-addon-price-contract.ts",
    );
    const acquisition = source(
      "features/stripe/lib/server/stripe-acquisition-intent.ts",
    );

    expect(checkout).toContain("equipmentAddon: z.boolean().optional()");
    expect(checkout).toContain('value.packageKey !== "complete_operations"');
    expect(checkout).toContain("resolveEquipmentAddonPriceId(stripe)");
    expect(checkout).toContain("additionalPriceIds: [equipmentAddonPriceId]");
    expect(checkout).toContain(
      "line_items: [input.priceId, ...(input.additionalPriceIds ?? [])].map",
    );
    expect(checkout).toContain('equipment_addon: "true"');

    expect(priceContract).toContain("EQUIPMENT_ADDON_LOOKUP_KEY");
    expect(priceContract).toContain("EQUIPMENT_ADDON_MONTHLY_CENTS");
    expect(priceContract).toContain('price.recurring?.interval !== "month"');

    expect(acquisition).toContain("items.data.length === 1");
    expect(acquisition).toContain('price.metadata?.price_role === "base"');
    expect(acquisition).toContain("baseItems.length === 1");
  });

  it("keeps existing heavy and off-highway pages aligned with the Equipment product", () => {
    const definitions = source("features/marketing/fieldEquipmentSearchPages.ts");

    expect(definitions).toContain("Equipment Asset Health");
    expect(definitions).toContain("20 equipment-family groups");
    expect(definitions).toContain("$149 USD per month");
    expect(definitions).toContain("/equipment-maintenance-software");
    expect(definitions).not.toContain("master inspection foundation is being expanded");
  });
});
