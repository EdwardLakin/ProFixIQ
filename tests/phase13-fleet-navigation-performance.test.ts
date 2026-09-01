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

    expect(actorGuard).toContain("getFleetPortalActorContext = cache(");
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
    const unitsRoute = read("app/api/fleet/units/route.ts");
    expect(maintenancePage).toContain("initialFleetId={selectedFleetId}");
    expect(maintenanceRoute).toContain(
      "requestedFleetId: clean(body.fleetId)",
    );
    expect(unitsPage).toContain("fleetId={selectedFleetId}");
    expect(unitsRoute).toContain("requestedFleetId,");
    expect(unitsRoute).toContain("explicitFleetId: requestedFleetId");
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
