import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Ops System Health", () => {
  it("adds a force-dynamic owner Ops route", () => {
    const page = source("app/ops/system-health/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("getOpsSystemHealth");
    expect(page).toContain("<OpsSystemHealth snapshot={snapshot} />");
  });

  it("uses the authenticated Ops Supabase path instead of a service-role health bypass", () => {
    const server = source("features/ops/server/get-system-health.ts");
    expect(server).toContain("requireOpsOperatorPageAccess");
    expect(server).toContain('.from("agent_requests")');
    expect(server).toContain('{ count: "exact", head: true }');
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(server).not.toContain("createClient(");
  });

  it("reports native application, database and feedback health without the retired Agent service", () => {
    const server = source("features/ops/server/get-system-health.ts");
    expect(server).toContain('key: "application"');
    expect(server).toContain('key: "database"');
    expect(server).toContain('key: "feedback"');
    expect(server).toContain('state: "down"');
    expect(server).toContain('"degraded"');
    expect(server).not.toContain("readAgentTeamReadiness");
    expect(server).not.toContain("PROFIXIQ_AGENT_URL");
    expect(server).not.toContain("AGENT_API_SECRET");
  });

  it("surfaces System Health in both desktop and mobile Ops navigation and makes it the canonical live-health destination", () => {
    const shell = source("features/ops/components/OpsShell.tsx");
    const dashboard = source("features/ops/components/OpsDashboard.tsx");
    expect(shell).toContain('{ href: "/ops/system-health", label: "System Health", icon: Activity }');
    expect(shell.match(/aria-label="Operations navigation"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dashboard).toContain("Operations signals");
    expect(dashboard).toContain('href="/ops/system-health"');
    expect(dashboard).toContain("Live health");
    expect(dashboard).not.toContain("Control plane health");
  });

  it("explains the feedback safety boundary and database health semantics to the operator", () => {
    const component = source("features/ops/components/OpsSystemHealth.tsx");
    expect(component).toContain("Feedback safety boundary");
    expect(component).toContain("Database check semantics");
    expect(component).toContain("no autonomous GitHub branch, code, release, or approval path");
    expect(component).toContain("Refresh health");
  });
});
