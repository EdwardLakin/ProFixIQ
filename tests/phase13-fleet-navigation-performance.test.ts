import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseFleetServerTiming } from "@/features/fleet/lib/fleetPerformance";

const read = (path: string) => readFileSync(path, "utf8");

describe("Phase 13 Fleet navigation performance contract", () => {
  it("parses Fleet server duration without accepting another metric", () => {
    expect(parseFleetServerTiming("fleet-data;dur=42.7")).toBe(42.7);
    expect(
      parseFleetServerTiming("db;dur=10, fleet-data;dur=81, app;dur=4"),
    ).toBe(81);
    expect(parseFleetServerTiming("db;dur=10")).toBeNull();
    expect(parseFleetServerTiming(null)).toBeNull();
  });

  it("deduplicates stable actor and entitlement reads within one request", () => {
    const actorGuard = read("app/portal/fleet/_lib/requireFleetPortalActor.ts");
    const layout = read("app/portal/fleet/layout.tsx");
    const home = read("app/portal/fleet/page.tsx");
    const assets = read("app/portal/fleet/units/page.tsx");

    expect(actorGuard).toContain("getFleetPortalBaseActorContext = cache(");
    expect(actorGuard).toContain("await getFleetPortalBaseActorContext()");
    expect(actorGuard).toContain("isInternalFleetInActorShop = cache(");
    expect(actorGuard).toContain('.eq("shop_id", shopId)');
    expect(actorGuard).toContain("request-scoped");
    expect(actorGuard).toContain("canAccessPortalFleetWrappers");
    expect(layout).toContain("requireFleetPortalActor()");
    expect(home).toContain(
      "getFleetPortalActorContext(requestedFleetId ?? null)",
    );
    expect(assets).toContain("getFleetPortalActorContext(fleetId ?? null)");
  });

  it("resolves selected Fleet authority across shell navigation destinations", () => {
    const destinations = [
      "app/portal/fleet/units/page.tsx",
      "app/portal/fleet/drivers/page.tsx",
      "app/portal/fleet/pretrip-history/page.tsx",
      "app/portal/fleet/maintenance/page.tsx",
      "app/portal/fleet/calendar/page.tsx",
      "app/portal/fleet/inspection-templates/page.tsx",
      "app/portal/fleet/service-requests/page.tsx",
      "app/portal/fleet/billing/page.tsx",
      "app/portal/fleet/reports/page.tsx",
      "app/portal/fleet/settings/page.tsx",
      "app/portal/fleet/intake/page.tsx",
      "app/portal/fleet/pretrip/page.tsx",
      "app/portal/fleet/updates/page.tsx",
    ];

    for (const destination of destinations) {
      const source = read(destination);
      expect(source, destination).toContain("fleetId");
      expect(source, destination).toMatch(
        /(getFleetPortalActorContext|requireFleetPortalActor)\([^)]*[Ff]leetId/,
      );
    }

    const maintenancePage = read("app/portal/fleet/maintenance/page.tsx");
    const maintenanceRoute = read("app/api/fleet/maintenance/route.ts");
    const unitsPage = read("app/portal/fleet/units/page.tsx");
    const unitDetailPage = read("app/portal/fleet/units/[unitId]/page.tsx");
    const unitsRoute = read("app/api/fleet/units/route.ts");
    const homePage = read("app/portal/fleet/page.tsx");
    const driverDashboard = read(
      "features/fleet/components/FleetDriverDashboard.tsx",
    );
    const driverDashboardRoute = read(
      "app/api/fleet/driver/dashboard/route.ts",
    );
    const driversPage = read("app/portal/fleet/drivers/page.tsx");
    const drivers = read("features/fleet/components/FleetDriversWorkspace.tsx");
    const enrollmentRoute = read("app/api/fleet/enrollment/route.ts");
    const enrollmentPage = read("app/portal/fleet/units/new/page.tsx");
    const enrollment = read(
      "features/fleet/components/FleetUnitEnrollmentPage.tsx",
    );
    const actorGuard = read("app/portal/fleet/_lib/requireFleetPortalActor.ts");
    const pretripHistoryPage = read(
      "app/portal/fleet/pretrip-history/page.tsx",
    );
    const pretripHistory = read(
      "features/fleet/components/PretripReportsPage.tsx",
    );
    const pretripRoute = read("app/api/fleet/pretrip/route.ts");
    const settingsPage = read("app/portal/fleet/settings/page.tsx");
    const towerRoute = read("app/api/fleet/tower/route.ts");
    const calendarPage = read("app/portal/fleet/calendar/page.tsx");
    const calendar = read(
      "features/fleet/components/FleetMaintenanceCalendar.tsx",
    );
    const requestsPage = read("app/portal/fleet/service-requests/page.tsx");
    const requests = read(
      "features/fleet/components/FleetServiceRequestsPage.tsx",
    );
    const billingPage = read("app/portal/fleet/billing/page.tsx");
    const billing = read("features/fleet/components/FleetBillingWorkspace.tsx");
    const billingRoute = read("app/api/fleet/billing/route.ts");
    const billingCheckout = read("app/api/fleet/billing/checkout/route.ts");
    const unitDetail = read(
      "features/fleet/components/FleetUnitDetailWorkspace.tsx",
    );
    const requestLayout = read("app/portal/fleet/request/layout.tsx");
    const requestBuilder = read("app/portal/fleet/request/build/page.tsx");
    const units = read("features/fleet/components/FleetUnitsPage.tsx");
    const mobilePretrip = read("app/mobile/fleet/pretrip/page.tsx");
    const mobilePretripDetail = read(
      "app/mobile/fleet/pretrip/[unitId]/page.tsx",
    );
    const mobileFleetClient = read("features/mobile/fleet/client.ts");
    const reports = read("features/fleet/components/FleetReportsWorkspace.tsx");
    const issueTables = read("features/fleet/components/FleetIssueTables.tsx");
    const aiSummary = read("features/fleet/components/FleetAISummary.tsx");
    const economics = read(
      "features/fleet/components/FleetUnitEconomicsPanel.tsx",
    );
    const templatesPage = read(
      "app/portal/fleet/inspection-templates/page.tsx",
    );
    expect(maintenancePage).toContain("initialFleetId={selectedFleetId}");
    expect(maintenanceRoute).toContain(
      "requestedFleetId = clean(body.fleetId)",
    );
    expect(unitsPage).toContain("fleetId={selectedFleetId}");
    expect(unitDetailPage).toContain(
      "getFleetPortalActorContext(fleetId ?? null)",
    );
    expect(unitDetailPage).toContain("fleetId={selectedFleetId}");
    expect(unitsRoute).toContain("requestedFleetId,");
    expect(unitsRoute).toContain("explicitFleetId: requestedFleetId");
    expect(homePage).toContain(
      "<FleetDriverDashboard fleetId={selectedFleetId} />",
    );
    expect(homePage).toContain(
      "shopId={selectedScope?.shopId ?? actor.shopId}",
    );
    expect(driverDashboard).toContain(
      "`?fleetId=${encodeURIComponent(fleetId)}`",
    );
    expect(driverDashboardRoute).toContain(
      "resolveSelectedFleetRequestScope(actor, {",
    );
    expect(driversPage).toContain("initialFleetId={selectedFleetId}");
    expect(drivers).toContain('useState(initialFleetId ?? "all")');
    expect(drivers).toContain("fleetId: initialFleetId ?? null");
    expect(enrollmentRoute).toContain(
      "resolveSelectedFleetRequestScope(actor, {",
    );
    expect(enrollmentPage).toContain(
      "requireFleetPortalActor(fleetId ?? null)",
    );
    expect(enrollmentPage).toContain(
      "initialFleetId={fleetId ? actor.primaryFleetId : null}",
    );
    expect(enrollment).toContain(
      'body: JSON.stringify({ action: "context", fleetId: initialFleetId })',
    );
    expect(enrollment).toContain("fleetId: fleetId || initialFleetId");
    expect(enrollment).toContain("encodeURIComponent(initialFleetId)");
    expect(actorGuard).toContain("getInternalFleetIdsInActorShop");
    expect(actorGuard).toContain(
      "await getInternalFleetIdsInActorShop(actor.shopId)",
    );
    expect(pretripHistoryPage).toContain(
      "fleetId={fleetId ? actor.primaryFleetId : null}",
    );
    expect(pretripHistory).toContain(
      "body: JSON.stringify({ shopId: null, fleetId })",
    );
    expect(pretripHistory).toContain("href={withFleetId(");
    expect(settingsPage).toContain(
      "params.fleetId && !manageableFleetIds.includes(params.fleetId)",
    );
    expect(pretripRoute).toContain("resolveSelectedFleetRequestScope(actor, {");
    expect(settingsPage).toContain(
      "const selectedShopId = selectedScope.shopId",
    );
    expect(settingsPage).toContain('.eq("shop_id", selectedShopId)');
    expect(towerRoute).toContain("resolveSelectedFleetRequestScope(actor, {");
    expect(calendarPage).toContain("initialFleetId={selectedFleetId}");
    expect(calendar).toContain('useState(initialFleetId ?? "all")');
    expect(calendar).toContain("!initialFleetId ? (");
    expect(calendar).toContain('<option value="all">All fleets</option>');
    expect(units).toContain("href={withFleetId(");
    expect(mobilePretrip).toContain('searchParams.get("fleetId")');
    expect(mobileFleetClient).toContain("JSON.stringify({ fleetId })");
    expect(mobilePretrip).toContain(
      "`?fleetId=${encodeURIComponent(fleetId)}`",
    );
    expect(mobilePretripDetail).toContain("fleetId={fleetId}");
    expect(mobilePretripDetail).toContain(
      "`?fleetId=${encodeURIComponent(fleetId)}`",
    );
    expect(reports).toContain("withFleetId(href, fleetId)");
    expect(issueTables).toContain("const withFleetId = (href: string)");
    expect(aiSummary).toContain("href={withFleetId(");
    expect(economics).toContain("href={withFleetId(");
    expect(templatesPage).toContain(
      "canAdministerFleetForActor(actor, actor.primaryFleetId)",
    );
    expect(requestsPage).toContain("fleetId={selectedFleetId}");
    expect(requests).toContain(
      "body: JSON.stringify({ fleetId: fleetId ?? null })",
    );
    expect(billingPage).toContain("fleetId={selectedFleetId}");
    expect(billing).toContain(
      'body: JSON.stringify({ action: "list", fleetId: fleetId ?? null })',
    );
    expect(billing).toContain("fleetId: fleetId ?? null");
    expect(billingRoute).toContain("fleetId: requestedFleetId");
    expect(billingCheckout).toContain(
      "resolveSelectedFleetRequestScope(actor, {",
    );
    expect(billingCheckout).toContain(
      'returnQuery.set("fleetId", requestedFleetId)',
    );
    expect(unitDetail).toContain("withFleetId(");
    expect(unitDetail).toContain('"/portal/fleet/request/build"');
    expect(requestLayout).toContain("canManageFleetForActor(actor, fleetId)");
    expect(requestBuilder).toContain(
      "`${requestsPath}?fleetId=${encodeURIComponent(context.fleetId)}`",
    );
  });

  it("starts independent Control Tower reads together and never caches mutable data", () => {
    const route = read("app/api/fleet/tower/route.ts");
    const tower = read("features/fleet/components/FleetControlTower.tsx");
    const maintenance = read(
      "features/fleet/components/FleetMaintenanceWorkspace.tsx",
    );

    expect(route).toContain("] = await Promise.all([");
    expect(route).toContain('.from("fleet_service_requests")');
    expect(route).toContain('.from("fleet_unit_defects")');
    expect(route).toContain('.from("fleet_inspection_schedules")');
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(route).toContain('"Server-Timing": `fleet-data;dur=');
    expect(tower).toContain('cache: "no-store"');
    expect(maintenance).toContain('action: "list"');
    expect(maintenance).toContain('cache: "no-store"');

    const bodyConsumed = tower.indexOf(
      "const body = (await res.json()) as TowerPayload",
    );
    const requestCompleted = tower.indexOf(
      "const timing = recordFleetRequestTiming(",
    );
    const renderStarted = tower.indexOf("timing.responseConsumedAt");
    expect(bodyConsumed).toBeGreaterThan(-1);
    expect(requestCompleted).toBeGreaterThan(bodyConsumed);
    expect(renderStarted).toBeGreaterThan(requestCompleted);
  });

  it("provides an accessible responsive route-level pending surface", () => {
    const loading = read("app/portal/fleet/loading.tsx");
    const shell = read("features/fleet/components/FleetProductShell.tsx");

    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain("sm:grid-cols-2");
    expect(loading).toContain("xl:grid-cols-4");
    expect(shell).toContain("router.prefetch(href)");
    expect(shell).toContain("beginNavigation(href)");
    expect(shell).toContain("aria-busy={navigationTarget ? true : undefined}");
    expect(shell).toContain('operation: "route-navigation"');
  });
});
