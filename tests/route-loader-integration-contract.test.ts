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
    const loader = read("features/portal/server/listPortalQuotes.ts");
    expect(page).toContain("runBoundedRouteLoad");
    expect(page).toContain("listPortalQuotesForCustomer");
    expect(loader).toContain(".abortSignal(signal)");
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

  it("keeps quote approval available when optional evidence is degraded", () => {
    const source = read("features/portal/app/quotes/[id]/QuotePageClient.tsx");
    expect(source).toContain("loadOptionalQuoteEvidence");
    expect(source).toContain("setEvidenceWarning(evidenceWarningCandidate)");
    expect(source).toContain(
      "The quote details and approval actions are still available.",
    );
    expect(source).not.toContain("evidenceResponse");
  });

  it("keeps rapid intake usable with its defaults when settings are unavailable", () => {
    const source = read("features/mobile/service/RapidServiceIntake.tsx");
    expect(source).toContain(
      "const [durationMinutes, setDurationMinutes] = useState(60)",
    );
    expect(source).toContain('title="Using default service settings"');
    expect(source).not.toMatch(/if \(settingsFailure\)\s*\{\s*return/);
  });

  it("clears the protected Field snapshot and redirects signed-out users", () => {
    const scopeGate = read(
      "features/mobile/service/MobileServiceScopeGate.tsx",
    );
    const signedOutScope = scopeGate.match(
      /if \(!authUserId\)\s*\{([\s\S]*?)\n\s*\}/,
    )?.[1];
    expect(signedOutScope).toContain("protectSnapshot(null)");
    expect(signedOutScope).toContain('router.replace("/mobile")');
    expect(signedOutScope).not.toContain("throw routeLoadFailureFromStatus");

    const routeGate = read(
      "features/mobile/service/MobileFieldServiceRouteGate.tsx",
    );
    const signedOutRoute = routeGate.match(
      /if \(!authUserId\)\s*\{([\s\S]*?)\n\s*\}/,
    )?.[1];
    expect(signedOutRoute).toContain('router.replace("/mobile")');
    expect(signedOutRoute).not.toContain("throw routeLoadFailureFromStatus");
  });

  it("does not show zero owner-governance metrics while shops are loading", () => {
    const source = read(
      "features/dashboard/app/dashboard/admin/ShopsClient.tsx",
    );
    expect(source).toContain('value={rows ? summary.total : "—"}');
    expect(source).toContain("Shop directory unavailable");
  });
});
