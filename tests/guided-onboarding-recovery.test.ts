import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canRoleUseGuidedOnboardingStep,
  GUIDED_ONBOARDING_STEPS,
} from "@/features/onboarding-v2/guided/steps";

const read = (path: string) => readFileSync(path, "utf8");

const legacyAuthHelpers = /@supabase\/auth-helpers-nextjs|createRouteHandlerClient|createServerComponentClient|createClientComponentClient/;
function updatesProfileShopId(source: string): boolean {
  const lines = source.split(/\r?\n/);
  return lines.some((line, index) => {
    if (!line.includes('.from("profiles")') && !line.includes(".from('profiles')")) return false;
    const window = lines.slice(index, index + 10).join("\n");
    const updateStart = window.indexOf(".update(");
    if (updateStart === -1) return false;
    const updateWindow = window.slice(updateStart, updateStart + 220);
    return updateWindow.includes("shop_id");
  });
}

const stableProductionPages = [
  ["dashboard owner operations", "app/dashboard/operations/page.tsx"],
  ["work orders list", "app/work-orders/page.tsx"],
  ["work orders view list", "app/work-orders/view/page.tsx"],
  ["customers directory", "app/customers/page.tsx"],
  ["customer vehicle detail", "app/customers/[id]/page.tsx"],
  ["parts inventory", "app/parts/inventory/page.tsx"],
] as const;

const unchangedRoutingFiles = ["middleware.ts", "features/auth/lib/postAuthRouting.ts"] as const;

const guardedRecoveryFiles = [
  "app/billing/page.tsx",
  "app/menu/page.tsx",
  "app/parts/inventory/page.tsx",
  "features/customers/app/customers/[id]/page.tsx",
  "features/dashboard/app/dashboard/owner/create-user/page.tsx",
  "features/dashboard/app/dashboard/owner/settings/page.tsx",
  "features/inspections/app/inspection/templates/page.tsx",
  "features/onboarding-v2/components/GuidedOnboardingLaunchCard.tsx",
  "features/onboarding-v2/components/GuidedOnboardingStepCard.tsx",
  "features/onboarding-v2/components/GuidedOnboardingWorkspace.tsx",
  "features/onboarding-v2/guided/steps.ts",
];

const stableLoaderExpectations = [
  ["work orders", "app/work-orders/page.tsx", /from\("work_orders"\)|from\('work_orders'\)|WorkOrders/],
  ["customers", "features/customers/app/customers/[id]/page.tsx", /from\("customers"\)|from\('customers'/],
  ["vehicles", "features/customers/app/customers/[id]/page.tsx", /from\("vehicles"\)|from\('vehicles'/],
  ["parts", "app/parts/inventory/page.tsx", /from\("parts"\)|from\('parts'/],
] as const;

describe("guided onboarding recovery guardrails", () => {
  it("keeps stable owner, work-order, customer, vehicle, and parts pages present", () => {
    for (const [label, path] of stableProductionPages) {
      expect(existsSync(path), `${label} route should exist at ${path}`).toBe(true);
      expect(read(path), `${label} route should still export a Next page`).toMatch(/export\s+(?:default|\{\s*default\s*\})/);
    }
  });

  it("keeps middleware and post-auth routing out of the onboarding recovery", () => {
    for (const path of unchangedRoutingFiles) {
      expect(existsSync(path), `${path} should exist for routing guardrails`).toBe(true);
      expect(read(path), `${path} must not import guided onboarding`).not.toMatch(/onboarding-v2|GuidedOnboarding|mode=guided/);
    }
  });

  it("keeps guided onboarding optional from existing pages instead of forcing redirects", () => {
    const dashboardSource = read("app/dashboard/_components/OperationsDashboardView.tsx");
    const settingsSource = read("features/dashboard/app/dashboard/owner/settings/page.tsx");
    const launchSource = read("features/onboarding-v2/components/GuidedOnboardingLaunchCard.tsx");
    const entrySource = read("app/dashboard/page.tsx");
    const cardSource = read("features/onboarding-v2/components/GuidedOnboardingStepCard.tsx");

    expect(dashboardSource).toContain("<GuidedOnboardingLaunchCard source=\"dashboard\" />");
    expect(settingsSource).toContain("<GuidedOnboardingLaunchCard source=\"settings\" />");
    expect(launchSource).toContain("/dashboard/onboarding-v2?mode=guided");
    expect(cardSource).toContain('data-onboarding-optional="true"');
    expect(cardSource).toContain("setDismissed(true)");
    expect(entrySource).not.toContain("/dashboard/onboarding-v2");
    expect(entrySource).not.toContain("/dashboard/onboarding");
  });

  it("uses existing production destinations and data-backed state for guided steps", () => {
    const destinations = GUIDED_ONBOARDING_STEPS.map((step) => step.destinationPath);
    const stepKeys = GUIDED_ONBOARDING_STEPS.map((step) => step.stepKey);

    expect(stepKeys).toEqual(
      expect.arrayContaining([
        "customers",
        "vehicles",
        "staff",
        "settings",
        "inspection_templates",
        "service_menu",
        "parts_inventory",
        "invoices_history",
        "fleet_history_import",
      ]),
    );
    expect(destinations).toEqual(
      expect.arrayContaining([
        "/customers/search",
        "/dashboard/owner/settings",
        "/dashboard/owner/create-user",
        "/inspections/templates",
        "/menu",
        "/billing",
        "/parts/inventory",
      ]),
    );
    expect(destinations).not.toContain("/work-orders/assignment");
    expect(GUIDED_ONBOARDING_STEPS.every((step) => step.optional)).toBe(true);
    expect(GUIDED_ONBOARDING_STEPS.every((step) => step.dataSource.label.length > 0)).toBe(true);
  });

  it("adds onboarding cards as optional UI on requested existing pages", () => {
    expect(read("features/customers/app/customers/[id]/page.tsx")).toContain('stepKey="customers"');
    expect(read("features/customers/app/customers/[id]/page.tsx")).toContain('stepKey="vehicles"');
    expect(read("features/dashboard/app/dashboard/owner/create-user/page.tsx")).toContain('stepKey="staff"');
    expect(read("features/dashboard/app/dashboard/owner/settings/page.tsx")).toContain('stepKey="settings"');
    expect(read("features/inspections/app/inspection/templates/page.tsx")).toContain('stepKey="inspection_templates"');
    expect(read("app/menu/page.tsx")).toContain('stepKey="service_menu"');
    expect(read("app/parts/inventory/page.tsx")).toContain('stepKey="parts_inventory"');
    expect(read("app/billing/page.tsx")).toContain('stepKey="invoices_history"');
  });

  it("keeps stable page data loading paths in place", () => {
    for (const [label, path, pattern] of stableLoaderExpectations) {
      expect(read(path), `${label} loader should still use its production table path`).toMatch(pattern);
    }
  });

  it("allows owner/admin onboarding cards while hiding them from tech/mechanic by default", () => {
    const ownerStep = GUIDED_ONBOARDING_STEPS.find((step) => step.stepKey === "settings");
    expect(ownerStep).toBeTruthy();
    expect(canRoleUseGuidedOnboardingStep("owner", ownerStep!)).toBe(true);
    expect(canRoleUseGuidedOnboardingStep("admin", ownerStep!)).toBe(true);
    expect(canRoleUseGuidedOnboardingStep("tech", ownerStep!)).toBe(false);
    expect(canRoleUseGuidedOnboardingStep("mechanic", ownerStep!)).toBe(false);
  });

  it("does not reintroduce legacy Supabase auth helpers in guarded app source", () => {
    for (const path of guardedRecoveryFiles) {
      expect(read(path), `${path} should not import legacy auth helpers`).not.toMatch(legacyAuthHelpers);
    }
  });

  it("does not update profiles.shop_id in onboarding recovery source", () => {
    for (const path of guardedRecoveryFiles) {
      expect(updatesProfileShopId(read(path)), `${path} should not update profiles.shop_id`).toBe(false);
    }
  });
});
