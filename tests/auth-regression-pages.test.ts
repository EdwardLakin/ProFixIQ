import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const browserAuthPatterns = [
  "@supabase/auth-helpers-nextjs",
  "createClientComponentClient",
  "supabase.auth.getUser(",
  "auth.getUser(",
  "getSession(",
  "createBrowserSupabase",
  "createBrowserClient",
];

describe("post-deploy auth regression coverage", () => {
  it("removes the legacy Shop Boost materialization panel from the operations dashboard", () => {
    const dashboard = read("app/dashboard/_components/OperationsDashboardView.tsx");

    expect(dashboard).not.toContain("ShopBoostActivationPanel");
    expect(dashboard).not.toContain("SHOP BOOST OPERATIONAL STATUS");
    expect(dashboard).not.toContain("Materialization running");
    expect(dashboard).not.toContain("Importer is currently processing this intake.");
  });

  it("loads quote review through server-scoped auth/data loading", () => {
    const page = read("features/work-orders/app/work-orders/quote-review/page.tsx");
    const route = read("app/api/work-orders/quote-review/route.ts");

    expect(page).toContain("/api/work-orders/quote-review");
    for (const pattern of browserAuthPatterns) expect(page).not.toContain(pattern);
    expect(route).toContain("resolveCurrentActor");
    expect(route).toContain('.eq("shop_id", actor.shopId)');
  });

  it("keeps billing from browser-querying customers directly", () => {
    const page = read("app/billing/page.tsx");
    const route = read("app/api/billing/work-orders/route.ts");

    expect(page).toContain("/api/billing/work-orders");
    expect(page).not.toContain('.from("customers")');
    for (const pattern of browserAuthPatterns) expect(page).not.toContain(pattern);
    expect(route).toContain("resolveCurrentActor");
    expect(route).toContain('.eq("shop_id", actor.shopId)');
  });

  it("loads service history through server-scoped auth/data loading", () => {
    const page = read("app/work-orders/history/WorkOrdersHistoryClient.tsx");
    const route = read("app/api/work-orders/history/route.ts");

    expect(page).toContain("/api/work-orders/history");
    for (const pattern of browserAuthPatterns) expect(page).not.toContain(pattern);
    expect(route).toContain("resolveCurrentActor");
    expect(route).toContain('rpc("set_current_shop_id"');
    expect(route).not.toContain('.eq("shop_id", actor.shopId)');
  });

  it("loads parts dashboard through server-scoped shop context", () => {
    const page = read("app/parts/page.tsx");
    const route = read("app/api/parts/dashboard/route.ts");

    expect(page).toContain("/api/parts/dashboard");
    for (const pattern of browserAuthPatterns) expect(page).not.toContain(pattern);
    expect(route).toContain("resolveCurrentActor");
    expect(route).toContain('rpc("set_current_shop_id"');
    expect(route).toContain('.eq("shop_id", actor.shopId)');
  });

  it("loads active parts requests through server-scoped shop context", () => {
    const page = read("app/parts/requests/page.tsx");
    const route = read("app/api/parts/requests/active/route.ts");

    expect(page).toContain("/api/parts/requests/active");
    for (const pattern of browserAuthPatterns) expect(page).not.toContain(pattern);
    expect(route).toContain("resolveCurrentActor");
    expect(route).toContain('rpc("set_current_shop_id"');
    expect(route).toContain('.eq("shop_id", actor.shopId)');
    expect(route).toContain('"requested"');
    expect(route).toContain('"quoted"');
    expect(route).toContain('"approved"');
    expect(route).toContain('"fulfilled"');
  });

  it("routes dispatch links to the fleet dispatch board", () => {
    const tiles = read("features/shared/config/tiles.ts");
    const operationsDashboard = read("app/dashboard/_components/OperationsDashboardView.tsx");
    const operationsPayload = read("features/dashboard/server/getOperationsDashboardPayload.ts");
    const quickActions = read("features/shared/components/DashboardQuickActions.tsx");

    expect(tiles).toContain('href: "/fleet/dispatch"');
    expect(operationsDashboard).toContain('href: "/fleet/dispatch"');
    expect(operationsPayload).toContain('href: "/fleet/dispatch"');
    expect(quickActions).toContain('href: "/fleet/dispatch"');
    expect(operationsDashboard).not.toContain("/dashboard/manager/dispatch");
    expect(operationsPayload).not.toContain("/dashboard/manager/dispatch");
    expect(quickActions).not.toContain("/dashboard/manager/dispatch");
  });

  it("loads inspection history through server-scoped auth/data loading", () => {
    const page = read("features/inspections/app/inspection/saved/page.tsx");
    const route = read("app/api/inspections/history/route.ts");

    expect(page).toContain("/api/inspections/history");
    for (const pattern of browserAuthPatterns) expect(page).not.toContain(pattern);
    expect(route).toContain("resolveCurrentActor");
    expect(route).toContain('.eq("shop_id", actor.shopId)');
  });

  it("loads and creates purchase orders without browser auth.getUser or auth-helper clients", () => {
    const page = read("app/parts/po/page.tsx");
    const route = read("app/api/parts/purchase-orders/route.ts");

    expect(page).toContain("/api/parts/purchase-orders");
    for (const pattern of browserAuthPatterns) expect(page).not.toContain(pattern);
    expect(route).toContain("resolveCurrentActor");
    expect(route).toContain('.eq("shop_id", actor.shopId)');
    expect(route).toContain("profileRole");
  });

  it("dashboard entry uses server actor resolution for owner/admin and mechanic-compatible routing", () => {
    const page = read("app/dashboard/page.tsx");

    for (const pattern of browserAuthPatterns) expect(page).not.toContain(pattern);
    expect(page).toContain("resolveCurrentActor");
    expect(page).toContain('role === "admin"');
    expect(page).toContain('redirect("/dashboard/operations")');
  });
});
