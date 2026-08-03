import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("fleet management UI cohesion", () => {
  it("names fleet records consistently across navigation and unit surfaces", () => {
    const tiles = read("features/shared/config/tiles.ts");
    const manageFleets = read("app/fleet/programs/page.tsx");
    const addUnit = read("app/fleet/units/new/page.tsx");
    const units = read("features/fleet/components/FleetUnitsPage.tsx");

    expect(tiles).toContain('title: "Manage Fleets"');
    expect(tiles).toContain('subtitle: "Create fleets and contacts"');
    expect(tiles).toContain('subtitle: "Assign vehicles to fleets"');
    expect(tiles).not.toContain('title: "Fleet Programs"');

    expect(manageFleets).toContain('title="Manage fleets"');
    expect(manageFleets).toContain('"Create fleet"');
    expect(manageFleets).toContain("Existing fleets");
    expect(manageFleets).not.toContain('title="Fleet programs"');
    expect(manageFleets).not.toContain('"Create program"');

    expect(addUnit).toContain("Select a fleet before adding a unit.");
    expect(addUnit).toContain("Create a fleet before adding units.");
    expect(addUnit).not.toContain("Select a fleet program");
    expect(units).toContain("assigned to fleets.");
    expect(units).not.toContain("enrolled in fleet programs.");
  });

  it("provides a complete no-fleet path from portal access to creation and back", () => {
    const portalAccess = read(
      "features/fleet/components/FleetPortalAccessManager.tsx",
    );
    const manageFleets = read("app/fleet/programs/page.tsx");

    expect(portalAccess).toContain(
      '"/fleet/programs?returnTo=%2Ffleet%2Fportal-access"',
    );
    expect(portalAccess).toContain(
      "Create a fleet before inviting members.",
    );
    expect(portalAccess).toContain("Manage fleets");
    expect(portalAccess).toContain("Retry loading fleet access");
    expect(portalAccess).toContain('htmlFor="fleet-portal-fleet"');

    expect(manageFleets).toContain(
      'if (returnTo === "/fleet/portal-access")',
    );
    expect(manageFleets).toContain(
      "fleetId=${encodeURIComponent(inserted.id)}",
    );
  });
});
