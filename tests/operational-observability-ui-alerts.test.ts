import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navigation = readFileSync(
  "features/dashboard/components/OperationalViewSwitcher.tsx",
  "utf8",
);
const page = readFileSync(
  "app/dashboard/operations/observability/page.tsx",
  "utf8",
);
const workspace = readFileSync(
  "features/operations/components/OperationalObservabilityWorkspace.tsx",
  "utf8",
);
const alertService = readFileSync(
  "features/operations/server/syncOperationalObservabilityAlerts.ts",
  "utf8",
);
const cronConfig = readFileSync("vercel.json", "utf8");

describe("operational observability UI and alerting", () => {
  it("exposes the workspace only to authorized shop leaders", () => {
    expect(navigation).toContain("/dashboard/operations/observability");
    expect(navigation).toContain('roles: ["owner", "admin", "manager"]');
    expect(page).toContain('requiredCapability: "canManageWorkOrders"');
    expect(page).toContain('allowRoles: ["owner", "admin", "manager"]');
    expect(page).toContain("<OperationalObservabilityWorkspace />");
  });

  it("provides searchable workflow and failure timelines", () => {
    expect(workspace).toContain("Recent operational events");
    expect(workspace).toContain("Event-write failures");
    expect(workspace).toContain("Operational domains");
    expect(workspace).toContain("Review-layer health");
    expect(workspace).toContain("Search event, entity, role or source");
  });

  it("creates internal alerts for pipeline, volume, failure, and AI health", () => {
    expect(alertService).toContain("operational_event_pipeline_stalled");
    expect(alertService).toContain("operational_event_write_failure");
    expect(alertService).toContain("operational_event_volume_drop");
    expect(alertService).toContain("ai_expiration_cron_stalled");
    expect(alertService).toContain('source: "observability"');
    expect(alertService).toContain('role: "owner"');
  });

  it("schedules the internal health check without enabling branch deployments", () => {
    const parsed = JSON.parse(cronConfig) as {
      crons: Array<{ path: string; schedule: string }>;
      git: { deploymentEnabled: Record<string, boolean> };
    };

    expect(parsed.crons).toContainEqual({
      path: "/api/internal/observability/health",
      schedule: "7 * * * *",
    });
    expect(parsed.git.deploymentEnabled["*"]).toBe(false);
  });
});
