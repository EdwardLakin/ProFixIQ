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

  it("treats Agent deployment generation as required health evidence", () => {
    const server = source("features/ops/server/get-system-health.ts");
    expect(server).toContain('`${baseUrl}/health`');
    expect(server).toContain("readAgentTeamReadiness");
    expect(server).toContain('Pipeline readiness", value: pipelineReady ? "Passed" : "Failed"');
    expect(server).toContain("Authenticated Agent API access was denied.");
    expect(server).toContain("generationVerifiable");
    expect(server).toContain('state: "down"');
    expect(server).toContain('state: "degraded"');
    expect(server).toContain("Agent is reachable, but its deployment generation is not yet verifiable.");
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

  it("explains the approval and database health semantics to the operator", () => {
    const component = source("features/ops/components/OpsSystemHealth.tsx");
    expect(component).toContain("Mission approval safety");
    expect(component).toContain("Database check semantics");
    expect(component).toContain("A configured integration is not treated as healthy");
    expect(component).toContain("Refresh health");
  });
});
