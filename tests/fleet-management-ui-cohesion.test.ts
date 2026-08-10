import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("fleet management UI cohesion", () => {
  it("keeps operational Fleet work out of Shop", () => {
    const tiles = read("features/shared/config/tiles.ts");
    const legacyPrograms = read("app/fleet/programs/page.tsx");
    const legacyUnits = read("app/fleet/units/page.tsx");
    const legacyAddUnit = read("app/fleet/units/new/page.tsx");
    const fleetProductAddUnit = read("app/portal/fleet/units/new/page.tsx");

    expect(tiles).toContain('title: "Fleet Access Invites"');
    expect(tiles).toContain('href: "/dashboard/owner/fleet-access"');
    expect(tiles).not.toContain('title: "Fleet Control Tower"');
    expect(tiles).not.toContain('title: "Fleet Units"');
    expect(tiles).not.toContain('title: "Manage Fleets"');
    expect(tiles).not.toContain('title: "Fleet Service Requests"');

    expect(legacyPrograms).toContain(
      'redirect("/dashboard/owner/fleet-access")',
    );
    expect(legacyUnits).toContain('new URL("/assets", FLEET_PRODUCT_ORIGIN)');
    expect(legacyAddUnit).toContain(
      'new URL("/assets/new", FLEET_PRODUCT_ORIGIN)',
    );
    expect(fleetProductAddUnit).toContain("FleetUnitEnrollmentPage");
  });

  it("creates the initial relationship inside the Shop invitation screen", () => {
    const portalAccess = read(
      "features/fleet/components/FleetPortalAccessManager.tsx",
    );
    const inviteRoute = read("app/api/portal/fleet/invites/route.ts");
    const shopInvitePage = read("app/dashboard/owner/fleet-access/page.tsx");
    const legacyInvitePage = read("app/fleet/portal-access/page.tsx");

    expect(shopInvitePage).toContain("FleetPortalAccessManager");
    expect(shopInvitePage).toContain("canInviteFleetMembers");
    expect(legacyInvitePage).toContain(
      'redirect("/dashboard/owner/fleet-access")',
    );
    expect(portalAccess).toContain('action: "create_fleet"');
    expect(portalAccess).toContain("Create the Fleet relationship");
    expect(portalAccess).toContain("New relationship");
    expect(portalAccess).not.toContain("/fleet/programs");
    expect(inviteRoute).toContain('body?.action === "create_fleet"');
    expect(inviteRoute).toContain("shop_id: access.profile.shop_id");
    expect(inviteRoute).toContain(
      'requiredCapability: "canInviteFleetMembers"',
    );
  });
});
