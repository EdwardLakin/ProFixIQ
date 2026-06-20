import * as React from "react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GUIDED_ONBOARDING_STEP_KEYS } from "@/features/onboarding-v2/guided/steps";
import { TILES } from "@/features/shared/config/tiles";
import { getOwnerSidebarTiles } from "@/features/shared/lib/ownerSidebarNav";

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
    const dashboardSource =
      read("app/dashboard/onboarding-v2/page.tsx") +
      read("features/onboarding-v2/components/GuidedOnboardingWorkspace.tsx");

    expect(dashboardSource).toContain("Guided Setup");
    expect(dashboardSource).not.toContain("Onboarding Agent");
    expect(dashboardSource).not.toContain("StartOnboardingSessionCard");
    expect(dashboardSource).not.toContain("SafeModeVerifyOnlyBanner");
    expect(dashboardSource).not.toContain("AgentReadinessBanner");
    expect(dashboardSource).not.toContain("Materialization");
  });

  it("exposes guided setup in owner/admin dashboard navigation without legacy onboarding labels", () => {
    const guidedTile = TILES.find(
      (tile) => tile.href === "/dashboard/onboarding-v2",
    );

    expect(guidedTile).toMatchObject({
      title: "Guided Setup",
      href: "/dashboard/onboarding-v2",
      roles: ["owner", "admin"],
      scopes: ["management", "all"],
    });

    const ownerGuidedTile = getOwnerSidebarTiles(TILES).find(
      (tile) => tile.href === "/dashboard/onboarding-v2",
    );

    expect(ownerGuidedTile).toMatchObject({
      title: "Guided Setup",
      href: "/dashboard/onboarding-v2",
      roles: ["owner", "admin"],
      section: "Admin & Oversight",
    });
    expect(guidedTile?.title).not.toBe("Onboarding Agent");
  });

  it("adds Vehicles to app navigation", () => {
    const vehicleTile = TILES.find((tile) => tile.href === "/vehicles");

    expect(vehicleTile).toMatchObject({
      title: "Vehicles",
      href: "/vehicles",
      roles: ["advisor", "manager", "owner", "admin"],
      section: "Operations",
    });
  });

  it("keeps Planner out of the dashboard header while retaining other header actions", () => {
    const appShellSource = read("features/shared/components/AppShell.tsx");
    const assistantEntrySource = read(
      "features/assistant/components/AskAssistantEntry.tsx",
    );

    expect(appShellSource).toContain("Shift");
    expect(appShellSource).toContain("Inbox");
    expect(appShellSource).toContain("Agent Request");
    expect(appShellSource).toContain("Agent Console");
    expect(appShellSource).toContain("Sign out");
    expect(assistantEntrySource).toContain("<span>Assistant</span>");
    expect(assistantEntrySource).not.toContain("<span>Planner</span>");
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
    const routeSources = newFiles
      .filter((path) => path.startsWith("app/api/onboarding-v2/"))
      .map(read)
      .join("\n");

    expect(serverSource).toContain("requireShopScopedApiAccess");
    expect(serverSource).toContain('allowRoles: ["owner", "admin"]');
    expect(routeSources).toContain("@/features/onboarding-v2/guided/server");
  });



  it("keeps starting-from-scratch setup active while skipping import-only steps", () => {
    const serverSource = read("features/onboarding-v2/guided/server.ts");

    expect(serverSource).toContain('const STARTING_FROM_SCRATCH_SKIP_STEPS = ["customers", "vehicles", "service_history"] as const');
    expect(serverSource).toContain('const STARTING_FROM_SCRATCH_FIRST_STEP = "staff"');
    expect(serverSource).toContain("skip_import_steps");
    expect(serverSource).toContain('.in("step_key", STARTING_FROM_SCRATCH_SKIP_STEPS)');
  });

  it("creates guided step rows with destination metadata required by the database", () => {
    const serverSource = read("features/onboarding-v2/guided/server.ts");
    const migrationSource = read("db/sql/2026-06-07_guided_onboarding_v2_foundation.sql");

    expect(migrationSource).toContain("destination_path text not null");
    expect(serverSource).toContain("destination_path: step.destinationPath");
    expect(serverSource).toContain("title: step.title");
    expect(serverSource).toContain("question: step.question");
    expect(serverSource).toContain("description: step.shortDescription");
  });

  it("implements the guided setup button flow", () => {
    const workspaceSource = read("features/onboarding-v2/components/GuidedOnboardingWorkspace.tsx");
    const stepSource = read("features/onboarding-v2/guided/steps.ts");

    expect(workspaceSource).toContain("Do you have an existing shop/system to import?");
    expect(workspaceSource).toContain('existing_system: "starting_from_scratch"');
    expect(workspaceSource).toContain('current_step_key: "staff"');
    expect(workspaceSource).toContain("skip_import_steps: true");
    expect(workspaceSource).not.toContain("skip_guided_setup: true");
    expect(workspaceSource).not.toContain('redirectTo: "/dashboard"');
    expect(workspaceSource).toContain('existing_system: "importing_existing_system"');
    expect(workspaceSource).toContain("activeStep.ctaLabel");
    expect(workspaceSource).toContain("buildGuidedDestination(activeStep, detail.session.id)");
    expect(workspaceSource).toContain("/steps/${activeStep.key}/answer");
    expect(workspaceSource).toContain("/steps/${activeStep.key}/skip");
    expect(stepSource).toContain('destinationPath: "/customers/search"');
    expect(stepSource).toContain('highlight: "customer-import"');
  });

  it("renders progress, current step, and existing-system intake in the workspace", async () => {
    const { default: GuidedOnboardingWorkspace } =
      await import("@/features/onboarding-v2/components/GuidedOnboardingWorkspace");
    const markup = renderToStaticMarkup(
      React.createElement(GuidedOnboardingWorkspace),
    );

    expect(markup).toContain("Guided Setup");
    expect(markup).toContain("Starting point");
    expect(markup).toContain("Do you have an existing shop/system to import?");
    expect(markup).toContain("Yes");
    expect(markup).toContain("No");
  });
});
