import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveFieldServiceAccessContract } from "@/features/mobile/service/fieldServiceAccessContract";

const read = (filePath: string) => readFileSync(filePath, "utf8");

function routeFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) return routeFiles(filePath);
    return entry.name === "route.ts" ? [filePath] : [];
  });
}

const configured = {
  serviceModel: "mobile",
  onboardingCompletedAt: "2026-08-23T00:00:00.000Z",
};

describe("PFX-007 Field capability enforcement", () => {
  it("allows only an entitled, configured, explicitly enabled operator", () => {
    expect(
      resolveFieldServiceAccessContract({
        ...configured,
        canonicalRole: "mechanic",
        isFieldOperator: true,
        productEntitled: true,
      }),
    ).toMatchObject({
      decision: "ready",
      code: "FIELD_SERVICE_READY",
      canAccessFieldService: true,
    });

    expect(
      resolveFieldServiceAccessContract({
        ...configured,
        canonicalRole: "owner",
        isFieldOperator: false,
        productEntitled: true,
      }),
    ).toMatchObject({
      decision: "forbidden",
      code: "FIELD_SERVICE_OPERATOR_REQUIRED",
      canConfigure: true,
      canAccessFieldService: false,
    });

    expect(
      resolveFieldServiceAccessContract({
        ...configured,
        canonicalRole: "dispatcher",
        isFieldOperator: false,
        productEntitled: true,
      }),
    ).toMatchObject({
      decision: "forbidden",
      canConfigure: false,
      canAccessFieldService: false,
    });
  });

  it("separates setup from the plan gate for owner and admin users", () => {
    expect(
      resolveFieldServiceAccessContract({
        serviceModel: null,
        onboardingCompletedAt: null,
        canonicalRole: "owner",
        isFieldOperator: false,
        productEntitled: true,
      }),
    ).toMatchObject({
      decision: "setup_required",
      code: "FIELD_SERVICE_SETUP_REQUIRED",
      productEntitled: true,
      configurationComplete: false,
    });

    expect(
      resolveFieldServiceAccessContract({
        serviceModel: null,
        onboardingCompletedAt: null,
        canonicalRole: "dispatcher",
        isFieldOperator: false,
        productEntitled: true,
      }),
    ).toMatchObject({
      decision: "setup_required",
      code: "FIELD_SERVICE_SETUP_REQUIRED",
      canConfigure: false,
    });

    expect(
      resolveFieldServiceAccessContract({
        serviceModel: null,
        onboardingCompletedAt: null,
        canonicalRole: "owner",
        isFieldOperator: false,
        productEntitled: false,
      }),
    ).toMatchObject({
      decision: "plan_required",
      code: "FIELD_SERVICE_PLAN_REQUIRED",
      canConfigure: true,
      canAccessFieldService: false,
    });
  });

  it("keeps shop-only service models out of the operational Field workspace", () => {
    expect(
      resolveFieldServiceAccessContract({
        serviceModel: "shop",
        onboardingCompletedAt: "2026-08-23T00:00:00.000Z",
        canonicalRole: "admin",
        isFieldOperator: true,
        productEntitled: true,
      }),
    ).toMatchObject({
      decision: "setup_required",
      fieldServiceEnabled: false,
      configurationComplete: false,
    });
  });

  it("enforces the centralized decision before every Field API operation", () => {
    const apiRoutes = [
      ...routeFiles("app/api/mobile/service"),
      ...routeFiles("app/api/mobile/service-visits"),
    ];

    for (const filePath of apiRoutes) {
      const source = read(filePath);
      expect(
        source,
        `${filePath} must fail closed through the shared Field contract`,
      ).toMatch(
        /requireMobileServiceOperatorApiAccess|requireMobileServiceConfigurationApiAccess|requireMobileServiceSetupApiAccess/,
      );
    }

    expect(read("app/api/mobile/field-service/access/route.ts")).toContain(
      "getMobileFieldServiceWorkspaceAccess",
    );
  });

  it("renders explicit plan and permission states and rechecks revoked sessions", () => {
    const routeGate = read(
      "features/mobile/service/MobileFieldServiceRouteGate.tsx",
    );
    const panel = read("features/mobile/service/FieldServiceAccessPanel.tsx");
    const settingsRoute = read("app/api/mobile/service/settings/route.ts");

    expect(routeGate).toContain("FieldServiceAccessPanel");
    expect(routeGate).toContain("response?.status === 403");
    expect(routeGate).toContain("resolveFieldExistingSessionHref");
    expect(routeGate).not.toContain(
      "let active = true;\n    setAllowed(false);",
    );
    expect(routeGate).toContain("clearFieldServiceOfflineAccess");
    expect(routeGate).toContain('window.addEventListener("online"');
    expect(routeGate).toContain('document.addEventListener("visibilitychange"');
    expect(panel).toContain("Field Service is not included");
    expect(panel).toContain("Field operator access required");
    expect(settingsRoute).toContain(
      "requireMobileServiceConfigurationApiAccess",
    );
    expect(settingsRoute).toContain("requireMobileServiceSetupApiAccess");
  });
});
