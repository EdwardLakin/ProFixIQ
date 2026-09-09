import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "app/api/work-orders/deferred-history/route.ts",
  "utf8",
);
const panel = readFileSync(
  "features/work-orders/app/work-orders/create/PreviousDeferredWorkPanel.tsx",
  "utf8",
);
const wrapper = readFileSync(
  "features/work-orders/app/work-orders/create/ShopCreateWorkOrderPage.tsx",
  "utf8",
);

describe("create-work-order deferred history", () => {
  it("keeps the history read shop-scoped and preserves sell-pricing capability enforcement", () => {
    expect(route).toContain("requireShopScopedApiAccess");
    expect(route).toContain("resolveWorkOrderFinancialAccess");
    expect(route).toContain("financial.access.canViewSellPricing");
    expect(route).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(route).toContain(
      "laborTotal: canViewPricing ? Number(original.labor_total ?? 0) : null",
    );
    expect(route).toContain(
      "partsTotal: canViewPricing ? Number(original.parts_total ?? 0) : null",
    );
    expect(route).toContain(
      "grandTotal: canViewPricing ? Number(original.grand_total ?? 0) : null",
    );
  });

  it("loads complete vehicle history before reducing to the newest state per recommendation", () => {
    expect(route).toContain("QUOTE_PAGE_SIZE = 500");
    expect(route).toContain(
      ".range(from, from + QUOTE_PAGE_SIZE - 1)",
    );
    expect(route).not.toContain(".limit(300)");
    expect(route).toContain("const latestByRoot = new Map<string, QuoteLine>()");
    expect(route).toContain(
      ".filter(([, latest]) => quoteDecision(latest) !== null)",
    );
  });

  it("keeps displayed history aligned with carry-forward resolution/source guards", () => {
    expect(route).toContain("RESOLVED_LINE_STATES");
    expect(route).toContain("isArchivedSource");
    expect(route).toContain('normalized(row.type) === "historical_import"');
    expect(route).toContain('startsWith("portal_quote:")');
    expect(route).toContain("originalQuoteForDisplay");
  });

  it("renders previous work from the canonical selected vehicle and only shows totals when authorized", () => {
    expect(wrapper).toContain("PreviousDeferredWorkPanel");
    expect(panel).toContain("Previous deferred work");
    expect(panel).toContain('useTabState<string | null>("vehicleId", null)');
    expect(panel).toContain("selectedVehicleId ||");
    expect(panel).toContain("Last quoted");
    expect(panel).toContain("canViewPricing && item.grandTotal != null");
    expect(panel).toContain("license_plate");
    expect(panel).toContain("unit_number");
  });
});
