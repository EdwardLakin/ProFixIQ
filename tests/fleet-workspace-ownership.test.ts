import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Fleet workspace ownership", () => {
  it("moves asset enrollment into the Fleet product for Fleet managers", () => {
    const units = read("features/fleet/components/FleetUnitsPage.tsx");
    const enrollmentPage = read(
      "features/fleet/components/FleetUnitEnrollmentPage.tsx",
    );
    const portalPage = read("app/portal/fleet/units/new/page.tsx");
    const route = read("app/api/fleet/enrollment/route.ts");

    expect(units).toContain('"/assets/new"');
    expect(enrollmentPage).toContain("canEnrollExisting");
    expect(portalPage).toContain("canManageUnits");
    expect(route).toContain("manageableFleetIdsForActor");
    expect(route).toContain('.in("customer_id", allowedCustomerIds)');
    expect(route).toContain("Vehicle is not owned by this Fleet account");
    expect(route).not.toContain("Internal fleet management access required");
  });

  it("binds new and existing Fleet assets to the Fleet customer account", () => {
    const migration = read(
      "supabase/migrations/20260806021000_fleet_owned_unit_enrollment.sql",
    );

    expect(migration).toContain("f.shop_id, f.customer_id");
    expect(migration).toContain(
      "shop_id, customer_id, unit_number, vin, license_plate",
    );
    expect(migration).toContain(
      "v_vehicle_customer_id is distinct from v_customer_id",
    );
    expect(migration).toContain("Enroll the unit before assigning a driver");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
  });

  it("replaces placeholder Fleet settings with audited workspace and user management", () => {
    const page = read("app/portal/fleet/settings/page.tsx");
    const actions = read("app/portal/fleet/settings/actions.ts");
    const migration = read(
      "supabase/migrations/20260806022000_fleet_workspace_management.sql",
    );

    expect(page).toContain("Save Fleet workspace");
    expect(page).toContain("Users & roles");
    expect(page).toContain(
      "initial relationship invitation remains in ProFixIQ Shop",
    );
    expect(actions).toContain('p_action: "update_workspace"');
    expect(actions).toContain('p_action: "update_member_role"');
    expect(actions).toContain('p_action: "remove_member"');
    expect(migration).toContain("You cannot change your own Fleet access");
    expect(migration).toContain("explicit_membership.fleet_id = p_fleet_id");
    expect(migration).toContain(
      "Every Fleet workspace must keep at least one manager",
    );
    expect(migration).toContain(
      "Reassign active assets before removing this driver",
    );
    expect(migration).toContain("insert into public.activity_logs");
  });

  it("keeps the relationship invitation entry point in Shop", () => {
    const shopInvitePage = read("app/dashboard/owner/fleet-access/page.tsx");
    const driversPage = read("app/portal/fleet/drivers/page.tsx");
    const settings = read("app/portal/fleet/settings/page.tsx");
    const shopInvite = read(
      "features/fleet/components/FleetPortalAccessManager.tsx",
    );

    expect(shopInvitePage).toContain("FleetPortalAccessManager");
    expect(driversPage).not.toContain("FleetPortalAccessManager");
    expect(driversPage).not.toContain("driver-access");
    expect(settings).not.toContain("FleetPortalAccessManager");
    expect(shopInvite).not.toContain("embedded");
    expect(shopInvite).not.toContain('routePrefix = "/fleet"');
    expect(shopInvite).not.toContain('routePrefix === "/portal/fleet"');
  });

  it("keeps work-order creation in Shop after Fleet dispatch approves a request", () => {
    const fleetRequests = read(
      "features/fleet/components/FleetServiceRequestsPage.tsx",
    );
    const shopInbox = read(
      "features/fleet/components/ShopFleetRequestInbox.tsx",
    );
    const shopPage = read("app/work-orders/fleet-requests/page.tsx");
    const legacyPage = read("app/fleet/service-requests/page.tsx");
    const dispatch = read("features/fleet/components/FleetDispatchBoard.tsx");

    expect(fleetRequests).not.toContain("convertFleetServiceRequest");
    expect(fleetRequests).not.toContain("Create work order");
    expect(dispatch).not.toContain("New WO");
    expect(dispatch).not.toContain("href={`/work-orders/create");
    expect(shopInbox).toContain("convertFleetServiceRequest(item.id)");
    expect(shopInbox).toContain("Accept into Shop");
    expect(shopPage).toContain("requireShopPageAccess");
    expect(legacyPage).toContain("FLEET_PRODUCT_ORIGIN");
    expect(legacyPage).toContain('new URL("/requests"');
  });
});
