import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("fleet management UI cohesion", () => {
  it("keeps operational Fleet work out of the Shop sidebar", () => {
    const tiles = read("features/shared/config/tiles.ts");
    const manageFleets = read("app/fleet/programs/page.tsx");
    const addUnit = read("app/fleet/units/new/page.tsx");
    const units = read("features/fleet/components/FleetUnitsPage.tsx");

    expect(tiles).toContain('title: "Fleet Access Invites"');
    expect(tiles).toContain('href: "/dashboard/owner/fleet-access"');
    expect(tiles).not.toContain('title: "Fleet Control Tower"');
    expect(tiles).not.toContain('title: "Fleet Units"');
    expect(tiles).not.toContain('title: "Manage Fleets"');
    expect(tiles).not.toContain('title: "Fleet Service Requests"');

    // Legacy direct routes remain during the compatibility window, but they are
    // no longer part of Shop navigation.
    expect(manageFleets).toContain('title="Manage fleets"');
    expect(manageFleets).toContain('"Create fleet"');
    expect(manageFleets).toContain("Existing fleets");
    expect(manageFleets).not.toContain('title="Fleet programs"');
    expect(manageFleets).not.toContain('"Create program"');

    expect(addUnit).toContain("Create your first fleet");
    expect(addUnit).toContain('href="/fleet/programs?returnTo=%2Ffleet%2Funits%2Fnew"');
    expect(addUnit).not.toContain("Select a fleet program");
    expect(units).toContain("Every unit, one record");
    expect(units).not.toContain("enrolled in fleet programs.");
  });

  it("provides a complete no-fleet path from portal access to creation and back", () => {
    const portalAccess = read(
      "features/fleet/components/FleetPortalAccessManager.tsx",
    );
    const manageFleets = read("app/fleet/programs/page.tsx");
    const shopInvitePage = read(
      "app/dashboard/owner/fleet-access/page.tsx",
    );
    const legacyInvitePage = read("app/fleet/portal-access/page.tsx");

    expect(shopInvitePage).toContain("FleetPortalAccessManager");
    expect(shopInvitePage).toContain("canInviteFleetMembers");
    expect(legacyInvitePage).toContain(
      'redirect("/dashboard/owner/fleet-access")',
    );

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
    expect(manageFleets).toContain('if (returnTo === "/fleet/units/new")');
  });
});
