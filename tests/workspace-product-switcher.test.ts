import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  WORKSPACE_PRODUCTS,
  workspaceProductHref,
} from "@/features/shared/lib/workspaceProducts";

const source = (path: string) => readFileSync(path, "utf8");

describe("workspace product switcher", () => {
  it("keeps Complete as a package rather than a fifth workspace", () => {
    expect(WORKSPACE_PRODUCTS.map((product) => product.surface)).toEqual([
      "shop",
      "field",
      "fleet",
      "equipment",
    ]);
    expect(WORKSPACE_PRODUCTS.some((product) => product.label === "Complete")).toBe(false);
  });

  it("routes entitled products to workspaces and unavailable products to acquisition pages", () => {
    for (const product of WORKSPACE_PRODUCTS) {
      expect(workspaceProductHref(product, true)).toBe(product.workspaceHref);
      expect(workspaceProductHref(product, false)).toBe(product.marketingHref);
    }
  });

  it("uses one canonical entitlement endpoint and preserves the internal demo exception", () => {
    const route = source("app/api/workspaces/entitlements/route.ts");
    expect(route).toContain('p_capability: "shop"');
    expect(route).toContain('p_capability: "field_service"');
    expect(route).toContain('p_capability: "fleet_maintenance"');
    expect(route).toContain("resolveEquipmentAddonEntitlementForShop");
    expect(route).toContain('INTERNAL_DEMO_ENTITLEMENT = "internal_demo"');
    expect(route).toContain("internalDemo || shopAccess.data === true");
    expect(route).toContain("internalDemo || fieldAccess.data === true");
    expect(route).toContain("internalDemo || fleetAccess.data === true");
  });

  it("renders the shared switcher from Shop/Equipment, Field and Fleet shells", () => {
    const appShell = source("features/shared/components/AppShell.tsx");
    const fieldShell = source("features/mobile/service/FieldWorkspaceShell.tsx");
    const fleetShell = source("features/fleet/components/FleetProductShell.tsx");

    expect(appShell).toContain("WorkspaceProductSwitcher");
    expect(appShell).toContain('surface={pathname.startsWith("/equipment") ? "equipment" : "shop"}');
    expect(fieldShell).toContain('<WorkspaceProductSwitcher surface="field"');
    expect(fleetShell).toContain('<WorkspaceProductSwitcher surface="fleet"');
  });
});


describe("workspace switcher review regressions", () => {
  it("keeps acquisition destinations public", () => {
    const middleware = source("middleware.ts");
    for (const route of ["/repair-shop-management-software", "/field-service", "/fleet-maintenance", "/equipment-maintenance-software"]) {
      expect(middleware).toContain(`pathname === "${route}"`);
    }
  });

  it("uses the primary site when leaving the Fleet host", () => {
    const products = source("features/shared/lib/workspaceProducts.ts");
    expect(products).toContain("NEXT_PUBLIC_SITE_URL");
    expect(products).toContain('currentSurface === "fleet"');
  });

  it("shares entitlement loading across responsive switchers", () => {
    const switcher = source("features/shared/components/WorkspaceProductSwitcher.tsx");
    expect(switcher).toContain("let entitlementRequest");
    expect(switcher).toContain("loadWorkspaceEntitlements");
  });

  it("keeps Field switching in the persistent desktop sidebar", () => {
    const field = source("features/mobile/service/FieldWorkspaceShell.tsx");
    expect(field).toContain('className="px-3 pb-2"');
  });

  it("renders Shop and Equipment switching on mobile", () => {
    const shell = source("features/shared/components/AppShell.tsx");
    expect(shell).toContain('className="mb-2 md:hidden"');
  });
});
