import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveFieldServiceAccessContract } from "@/features/mobile/service/fieldServiceAccessContract";
import { resolveFieldWorkspaceCapabilities } from "@/features/mobile/service/server/access";

const read = (path: string) => readFileSync(path, "utf8");

describe("standalone Field owner boundary", () => {
  it("grants the standalone Field owner every Field workspace capability", () => {
    const access = resolveFieldServiceAccessContract({
      serviceModel: "mobile",
      onboardingCompletedAt: "2026-08-24T12:00:00.000Z",
      isFieldOperator: true,
      canonicalRole: "owner",
      productEntitled: true,
      subscriptionPackage: "field_service",
    });

    expect(access).toMatchObject({
      decision: "ready",
      canAccessFieldService: true,
      canConfigure: true,
      standaloneFieldWorkspace: true,
    });
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "owner",
        standaloneFieldWorkspace: access.standaloneFieldWorkspace,
        canConfigureFieldService: access.canConfigure,
        canSwitchWorkspace: false,
      }),
    ).toEqual({
      canManageScheduling: true,
      canManageParts: true,
      canManageOperations: true,
      canManageInspectionTemplates: true,
      canConfigureFieldService: true,
      canSwitchWorkspace: false,
    });
  });

  it("preserves role-aware capabilities for Shop-linked Field", () => {
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "mechanic",
        standaloneFieldWorkspace: false,
        canConfigureFieldService: false,
        canSwitchWorkspace: true,
      }),
    ).toEqual({
      canManageScheduling: false,
      canManageParts: false,
      canManageOperations: false,
      canManageInspectionTemplates: false,
      canConfigureFieldService: false,
      canSwitchWorkspace: true,
    });
  });

  it("rejects a second role inside a standalone Field workspace", () => {
    const access = resolveFieldServiceAccessContract({
      serviceModel: "mobile",
      onboardingCompletedAt: "2026-08-24T12:00:00.000Z",
      isFieldOperator: true,
      canonicalRole: "admin",
      productEntitled: true,
      subscriptionPackage: "field_service",
    });

    expect(access).toMatchObject({
      standaloneFieldWorkspace: true,
      canConfigure: false,
      canAccessFieldService: false,
    });
    expect(
      resolveFieldWorkspaceCapabilities({
        role: "admin",
        standaloneFieldWorkspace: true,
        canConfigureFieldService: false,
        canSwitchWorkspace: false,
      }),
    ).toMatchObject({
      canManageOperations: false,
      canManageInspectionTemplates: false,
      canConfigureFieldService: false,
    });
  });

  it("opens the actual Field inspection builder instead of stopping at templates", () => {
    const inspections = read("app/mobile/inspections/page.tsx");
    const builder = read("app/mobile/service/inspection-builder/new/page.tsx");

    expect(inspections).toContain(
      'href="/mobile/service/inspection-builder/new"',
    );
    expect(builder).toContain('<CustomInspectionPage surface="field" />');
  });

  it("configures and repairs My Truck without weakening protected helpers", () => {
    const migration = read(
      "supabase/migrations/20260824153307_establish_standalone_field_owner_boundary.sql",
    );
    const settingsRoute = read("app/api/mobile/service/settings/route.ts");
    const settingsScreen = read(
      "features/mobile/service/MobileServiceSetup.tsx",
    );
    const myTruckScreen = read("features/mobile/service/FieldMyTruck.tsx");

    expect(migration).toContain("field_configure_standalone_owner_atomic");
    expect(migration).toContain(
      "workspace.subscription_package = 'field_service'",
    );
    expect(migration).toContain("'mobile',\n    true,\n    false,\n    true,");
    expect(migration).toContain("field_service_vehicle_assignments");
    expect(migration).toContain(
      "public.field_actor_can_access_service_vehicle(",
    );
    expect(migration).not.toContain(
      "grant execute on function public.mobile_profile_has_field_service_access",
    );
    expect(settingsRoute).toContain(
      '"field_configure_standalone_owner_atomic"',
    );
    expect(settingsRoute).toContain(
      "Standalone Field assigns My Truck to its owner during Field setup.",
    );
    expect(settingsScreen).toContain("Standalone Field workspace");
    expect(settingsScreen).toContain("My Truck (required)");
    expect(settingsScreen).toContain(
      "There is no separate\n            Shop administrator required",
    );
    expect(myTruckScreen).toContain("Set up My Truck");
    expect(myTruckScreen).not.toContain("An owner or admin must assign");
  });
});
