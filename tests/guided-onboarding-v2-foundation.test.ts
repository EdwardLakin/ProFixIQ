import * as React from "react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GUIDED_ONBOARDING_STEP_KEYS } from "@/features/onboarding-v2/guided/steps";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const newFiles = [
  "app/dashboard/onboarding-v2/page.tsx",
  "app/dashboard/onboarding-v2/[sessionId]/page.tsx",
  "features/onboarding-v2/guided/types.ts",
  "features/onboarding-v2/guided/steps.ts",
  "features/onboarding-v2/guided/query.ts",
  "features/onboarding-v2/guided/server.ts",
  "features/onboarding-v2/components/GuidedOnboardingWorkspace.tsx",
  "features/onboarding-v2/components/OnboardingHighlightFrame.tsx",
  "app/api/onboarding-v2/guided/sessions/route.ts",
  "app/api/onboarding-v2/guided/sessions/[sessionId]/route.ts",
  "app/api/onboarding-v2/guided/sessions/[sessionId]/existing-system/route.ts",
  "app/api/onboarding-v2/guided/sessions/[sessionId]/steps/[stepKey]/answer/route.ts",
  "app/api/onboarding-v2/guided/sessions/[sessionId]/steps/[stepKey]/complete/route.ts",
  "app/api/onboarding-v2/guided/sessions/[sessionId]/steps/[stepKey]/skip/route.ts",
  "app/api/onboarding-v2/guided/sessions/[sessionId]/steps/[stepKey]/status/route.ts",
];

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("guided onboarding v2 foundation", () => {
  it("adds the dedicated dashboard page without old removed control copy", () => {
    const dashboardSource = read("app/dashboard/onboarding-v2/page.tsx") + read("features/onboarding-v2/components/GuidedOnboardingWorkspace.tsx");

    expect(dashboardSource).toContain("Guided Setup");
    expect(dashboardSource).not.toContain("Onboarding Agent");
    expect(dashboardSource).not.toContain("StartOnboardingSessionCard");
    expect(dashboardSource).not.toContain("SafeModeVerifyOnlyBanner");
    expect(dashboardSource).not.toContain("AgentReadinessBanner");
    expect(dashboardSource).not.toContain("Materialization");
  });

  it("uses the new guided onboarding tables in server code", () => {
    const serverSource = read("features/onboarding-v2/guided/server.ts");

    expect(serverSource).toContain("GUIDED_TABLE_PREFIX");
    expect(serverSource).toContain("`${GUIDED_TABLE_PREFIX}sessions`");
    expect(serverSource).toContain("`${GUIDED_TABLE_PREFIX}steps`");
    expect(serverSource).toContain("`${GUIDED_TABLE_PREFIX}events`");
    expect(serverSource).not.toContain("onboarding_" + "sessions");
  });

  it("does not use legacy Supabase auth helpers in new guided setup files", () => {
    const combined = newFiles.map(read).join("\n");

    expect(combined).not.toContain("@supabase/" + "auth-helpers-nextjs");
    expect(combined).not.toContain("createRoute" + "HandlerClient");
    expect(combined).not.toContain("createServer" + "ComponentClient");
    expect(combined).not.toContain("createClient" + "ComponentClient");
    expect(combined).not.toContain("createServer" + "ActionClient");
  });

  it("does not change middleware or post-auth routing", () => {
    const changedFiles = execSync("git diff --name-only", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);

    expect(changedFiles).not.toContain("middleware.ts");
    expect(changedFiles).not.toContain("features/auth/lib/postAuthRouting.ts");
  });

  it("does not mutate profiles.shop_id in onboarding-v2 files", () => {
    const combined = newFiles.map(read).join("\n");

    expect(combined).not.toMatch(/profiles[^\n]*shop_id/);
    expect(combined).not.toMatch(/update\(\{[^}]*shop_id/);
  });

  it("registers all required guided setup step keys", () => {
    expect(GUIDED_ONBOARDING_STEP_KEYS).toEqual([
      "customers",
      "vehicles",
      "staff",
      "labor_tax_shop_settings",
      "inspection_templates",
      "service_menu",
      "inventory_parts",
      "invoices",
      "service_history",
    ]);
  });

  it("keeps API access shop-scoped through the stable helper", () => {
    const serverSource = read("features/onboarding-v2/guided/server.ts");
    const routeSources = newFiles.filter((path) => path.startsWith("app/api/onboarding-v2/")).map(read).join("\n");

    expect(serverSource).toContain("requireShopScopedApiAccess");
    expect(serverSource).toContain("allowRoles: [\"owner\", \"admin\"]");
    expect(routeSources).toContain("@/features/onboarding-v2/guided/server");
  });

  it("renders progress, current step, and existing-system intake in the workspace", async () => {
    const { default: GuidedOnboardingWorkspace } = await import("@/features/onboarding-v2/components/GuidedOnboardingWorkspace");
    const markup = renderToStaticMarkup(React.createElement(GuidedOnboardingWorkspace));

    expect(markup).toContain("Guided Setup");
    expect(markup).toContain("Progress");
    expect(markup).toContain("Current step");
    expect(markup).toContain("Starting point");
    expect(markup).toContain("Starting from scratch");
    expect(markup).toContain("Importing existing system");
  });
});
