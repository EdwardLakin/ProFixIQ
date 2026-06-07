import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GUIDED_ONBOARDING_STEPS } from "@/features/onboarding-v2/guided/steps";

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
  ["parts requests", "app/parts/requests/page.tsx"],
] as const;

const changedRecoveryFiles = [
  "app/dashboard/_components/OperationsDashboardView.tsx",
  "app/dashboard/onboarding-v2/page.tsx",
  "features/dashboard/app/dashboard/owner/settings/page.tsx",
  "features/shared/config/tiles.ts",
  "features/shared/lib/ownerSidebarNav.ts",
  "features/onboarding-v2/components/GuidedOnboardingLaunchCard.tsx",
  "features/onboarding-v2/components/GuidedOnboardingWorkspace.tsx",
  "features/onboarding-v2/guided/steps.ts",
];

describe("guided onboarding recovery guardrails", () => {
  it("keeps stable owner, work-order, customer, vehicle, and parts request pages present", () => {
    for (const [label, path] of stableProductionPages) {
      expect(existsSync(path), `${label} route should exist at ${path}`).toBe(true);
      expect(read(path), `${label} route should still export a Next page`).toMatch(/export\s+(?:default|\{\s*default\s*\})/);
    }
  });

  it("keeps guided onboarding optional from dashboard/settings instead of forcing redirects", () => {
    const dashboardSource = read("app/dashboard/_components/OperationsDashboardView.tsx");
    const settingsSource = read("features/dashboard/app/dashboard/owner/settings/page.tsx");
    const launchSource = read("features/onboarding-v2/components/GuidedOnboardingLaunchCard.tsx");
    const entrySource = read("app/dashboard/page.tsx");

    expect(dashboardSource).toContain("<GuidedOnboardingLaunchCard source=\"dashboard\" />");
    expect(settingsSource).toContain("<GuidedOnboardingLaunchCard source=\"settings\" />");
    expect(launchSource).toContain("/dashboard/onboarding-v2?mode=guided");
    expect(entrySource).not.toContain("/dashboard/onboarding-v2");
    expect(entrySource).not.toContain("/dashboard/onboarding");
  });

  it("uses existing production destinations for guided steps", () => {
    const destinations = GUIDED_ONBOARDING_STEPS.map((step) => step.destinationPath);

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
  });

  it("does not reintroduce legacy Supabase auth helpers in guarded app source", () => {
    for (const path of changedRecoveryFiles) {
      expect(read(path), `${path} should not import legacy auth helpers`).not.toMatch(legacyAuthHelpers);
    }
  });

  it("does not update profiles.shop_id in guarded app source", () => {
    for (const path of changedRecoveryFiles) {
      expect(updatesProfileShopId(read(path)), `${path} should not update profiles.shop_id`).toBe(false);
    }
  });
});
