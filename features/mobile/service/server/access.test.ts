import { describe, expect, it } from "vitest";

import {
  resolveFieldWorkspaceCapabilities,
  resolveMobileFieldServiceAccess,
} from "./access";

describe("resolveMobileFieldServiceAccess", () => {
  it("does not grant Field Service to a standard shop mechanic", () => {
    expect(
      resolveMobileFieldServiceAccess({
        serviceModel: "mobile",
        onboardingCompletedAt: new Date().toISOString(),
        isFieldOperator: false,
        canonicalRole: "mechanic",
        productEntitled: true,
      }),
    ).toMatchObject({
      fieldServiceEnabled: true,
      canAccessFieldService: false,
    });
  });

  it("requires a completed mobile or both configuration", () => {
    expect(
      resolveMobileFieldServiceAccess({
        serviceModel: "shop",
        onboardingCompletedAt: new Date().toISOString(),
        isFieldOperator: true,
        canonicalRole: "mechanic",
        productEntitled: true,
      }).canAccessFieldService,
    ).toBe(false);
    expect(
      resolveMobileFieldServiceAccess({
        serviceModel: "both",
        onboardingCompletedAt: new Date().toISOString(),
        isFieldOperator: true,
        canonicalRole: "mechanic",
        productEntitled: true,
      }).canAccessFieldService,
    ).toBe(true);
  });

  it("requires the paid Field Service product entitlement", () => {
    expect(
      resolveMobileFieldServiceAccess({
        serviceModel: "mobile",
        onboardingCompletedAt: new Date().toISOString(),
        isFieldOperator: true,
        canonicalRole: "mechanic",
        productEntitled: false,
      }).canAccessFieldService,
    ).toBe(false);
  });
});

describe("resolveFieldWorkspaceCapabilities", () => {
  it("does not advertise management tools or a workspace switch to a Field-only mechanic", () => {
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "mechanic",
        canConfigureFieldService: false,
        canSwitchWorkspace: false,
      }),
    ).toEqual({
      canManageScheduling: false,
      canManageParts: false,
      canManageOperations: false,
      canManageInspectionTemplates: false,
      canConfigureFieldService: false,
      canInviteFleetMembers: false,
      canSwitchWorkspace: false,
      canReturnToShop: false,
    });
  });

  it("advertises a direct return to Shop only when Shop access is verified, distinct from the general workspace switch", () => {
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "mechanic",
        canConfigureFieldService: false,
        canSwitchWorkspace: true,
        canReturnToShop: true,
      }).canReturnToShop,
    ).toBe(true);
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "mechanic",
        canConfigureFieldService: false,
        // Fleet-only access still lets a technician switch workspaces
        // through the chooser, but there is no Shop Mobile to jump to
        // directly.
        canSwitchWorkspace: true,
        canReturnToShop: false,
      }).canReturnToShop,
    ).toBe(false);
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "owner",
        standaloneFieldWorkspace: true,
        canConfigureFieldService: true,
        canSwitchWorkspace: false,
        canReturnToShop: true,
      }).canReturnToShop,
    ).toBe(false);
  });

  it("advertises workspace switching only after another product scope is verified", () => {
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "manager",
        canConfigureFieldService: false,
        canSwitchWorkspace: true,
      }),
    ).toMatchObject({
      canManageScheduling: true,
      canManageParts: true,
      canManageOperations: true,
      canManageInspectionTemplates: true,
      canSwitchWorkspace: true,
    });
  });

  it("uses canonical billing roles for inspection template management", () => {
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "service_advisor",
        canConfigureFieldService: false,
        canSwitchWorkspace: false,
      }).canManageInspectionTemplates,
    ).toBe(true);
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "foreman",
        canConfigureFieldService: false,
        canSwitchWorkspace: false,
      }).canManageInspectionTemplates,
    ).toBe(false);
  });
});
