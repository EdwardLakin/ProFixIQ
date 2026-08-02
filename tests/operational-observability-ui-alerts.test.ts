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
const operationsPage = readFileSync(
  "app/dashboard/operations/page.tsx",
  "utf8",
);
const workspace = readFileSync(
  "features/operations/components/OperationalObservabilityWorkspace.tsx",
  "utf8",
);
const healthStrip = readFileSync(
  "features/operations/components/OperationalHealthAlertStrip.tsx",
  "utf8",
);
const workOrderPage = readFileSync("app/work-orders/[id]/page.tsx", "utf8");
const workOrderTimeline = readFileSync(
  "features/operations/components/WorkOrderOperationalTimelineDock.tsx",
  "utf8",
);
const alertService = readFileSync(
  "features/operations/server/syncOperationalObservabilityAlerts.ts",
  "utf8",
);
const healthRoute = readFileSync(
  "app/api/internal/observability/health/route.ts",
  "utf8",
);
const cronConfig = readFileSync("vercel.json", "utf8");

describe("operational observability UI and alerting", () => {
  it("exposes the workspace only to authorized shop leaders", () => {
    expect(navigation).toContain("/dashboard/operations/observability");
    expect(navigation).toContain('roles: ["owner", "admin", "manager"]');
    expect(page).toContain('requiredCapability: "canManageWorkOrders"');
    expect(page).toContain('allowRoles: ["owner", "admin", "manager"]');
    expect(page).toContain("<OperationalObservabilityWorkspace");
    expect(page).toContain("initialFilters={{");
  });

  it("provides searchable workflow, failure, and record-filtered timelines", () => {
    expect(workspace).toContain("Recent operational events");
    expect(workspace).toContain("Event-write failures");
    expect(workspace).toContain("Operational domains");
    expect(workspace).toContain("Review-layer health");
    expect(workspace).toContain("Search event, entity, role or source");
    expect(workspace).toContain("initialFilters");
    expect(workspace).toContain("Clear record filter");
  });

  it("adds the authorized work-order timeline without replacing the work-order client", () => {
    expect(workOrderPage).toContain("<WorkOrderIdClient />");
    expect(workOrderPage).toContain("<WorkOrderOperationalTimelineDock />");
    expect(workOrderTimeline).toContain(
      'const ALLOWED_ROLES = new Set(["owner", "admin", "manager"])',
    );
    expect(workOrderTimeline).toContain("correlationId=");
    expect(workOrderTimeline).toContain("Operational timeline");
    expect(workOrderTimeline).toContain("Full observability");
  });

  it("surfaces operational health directly above Shop Operations", () => {
    expect(operationsPage).toContain("<OperationalHealthAlertStrip />");
    expect(operationsPage).toContain("<OperationsDashboardView />");
    expect(healthStrip).toContain("Event pipeline stalled");
    expect(healthStrip).toContain("Event capture failures");
    expect(healthStrip).toContain("Event volume dropped");
    expect(healthStrip).toContain("AI expiration processing");
    expect(healthStrip).toContain("response.status === 401 || response.status === 403");
  });

  it("creates idempotent internal alerts for pipeline, volume, failure, and AI health", () => {
    expect(alertService).toContain("operational_event_pipeline_stalled");
    expect(alertService).toContain("operational_event_write_failure");
    expect(alertService).toContain("operational_event_volume_drop");
    expect(alertService).toContain("ai_expiration_cron_stalled");
    expect(alertService).toContain('source: "observability"');
    expect(alertService).toContain('role: "owner"');
    expect(alertService).toContain(
      'input.existing?.status === "acknowledged"',
    );
    expect(alertService).toContain("events_previous_24h");
    expect(alertService).toContain(
      'status: preserveAcknowledgement ? "acknowledged" : "active"',
    );
  });

  it("uses the service-role health projection with a pre-migration fallback", () => {
    expect(healthRoute).toContain("get_operational_observability_health");
    expect(healthRoute).toContain("projectionUsed");
    expect(healthRoute).toContain("projectionUnavailable");
    expect(healthRoute).toContain("operationalHealth:");
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
