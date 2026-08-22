import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const boundedClientLoaders = [
  "features/work-orders/quote-review/QuoteReviewView.tsx",
  "features/portal/app/quotes/[id]/QuotePageClient.tsx",
  "app/portal/approvals/page.tsx",
  "features/work-orders/mobile/MobileWorkOrderClient.tsx",
  "app/parts/requests/page.tsx",
  "features/mobile/service/MobileFieldServiceRouteGate.tsx",
  "features/mobile/service/MobileServiceScopeGate.tsx",
  "features/mobile/service/RapidServiceIntake.tsx",
  "features/mobile/service/useTruckInventorySnapshot.ts",
  "features/dashboard/app/dashboard/admin/ShopsClient.tsx",
];

describe("failing route loader integration", () => {
  it.each(boundedClientLoaders)("%s uses the shared bounded loader", (path) => {
    const source = read(path);
    expect(source).toContain("runBoundedRouteLoad");
    expect(source).toContain("asRouteLoadFailure");
  });

  it.each([
    "features/work-orders/quote-review/QuoteReviewView.tsx",
    "features/portal/app/quotes/[id]/QuotePageClient.tsx",
    "app/portal/approvals/page.tsx",
    "features/work-orders/mobile/MobileWorkOrderClient.tsx",
    "app/parts/requests/page.tsx",
    "features/mobile/service/MobileFieldServiceRouteGate.tsx",
    "features/mobile/service/MobileServiceScopeGate.tsx",
    "features/mobile/service/RapidServiceIntake.tsx",
    "features/mobile/service/MobileTruckInventory.tsx",
    "features/dashboard/app/dashboard/admin/ShopsClient.tsx",
  ])("%s renders an actionable route failure", (path) => {
    expect(read(path)).toContain("RouteLoadPanel");
  });

  it("bounds the server-rendered customer quote list", () => {
    const page = read("app/portal/quotes/page.tsx");
    expect(page).toContain("runBoundedRouteLoad");
    expect(page).toContain(".abortSignal(signal)");
    expect(read("app/portal/quotes/loading.tsx")).toContain(
      "PortalQuotesLoading",
    );
    expect(read("app/portal/quotes/error.tsx")).toContain("RouteLoadPanel");
  });

  it("does not silently redirect Field network failures", () => {
    for (const path of [
      "features/mobile/service/MobileFieldServiceRouteGate.tsx",
      "features/mobile/service/MobileServiceScopeGate.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("Field Service access could not be verified.");
      expect(source).not.toContain(
        '.catch(() => {\n      if (active) router.replace("/mobile");',
      );
    }
  });

  it("does not show zero owner-governance metrics while shops are loading", () => {
    const source = read(
      "features/dashboard/app/dashboard/admin/ShopsClient.tsx",
    );
    expect(source).toContain('value={rows ? summary.total : "—"}');
    expect(source).toContain("Shop directory unavailable");
  });
});
