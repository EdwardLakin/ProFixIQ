import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Ops deployments and release health", () => {
  it("adds a force-dynamic owner Ops deployments route", () => {
    const page = source("app/ops/deployments/page.tsx");
    const server = source("features/ops/server/get-release-health.ts");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("getOpsReleaseHealth");
    expect(page).toContain("<OpsReleaseHealth snapshot={snapshot} />");
    expect(server).toContain("await requireOpsOperatorPageAccess()");
  });

  it("correlates Vercel runtime identity with GitHub main, PRs, CI, and migration inventory", () => {
    const server = source("features/ops/server/get-release-health.ts");
    expect(server).toContain("VERCEL_GIT_COMMIT_SHA");
    expect(server).toContain("VERCEL_DEPLOYMENT_ID");
    expect(server).toContain('githubJson<GithubCommit>("/commits/main")');
    expect(server).toContain('"/pulls?state=open&base=main&per_page=100&sort=updated&direction=desc"');
    expect(server).toContain("/check-runs?per_page=100");
    expect(server).toContain('"/contents/supabase/migrations?ref=main"');
    expect(server).toContain("behindMain");
    expect(server).toContain("deploymentSucceeded");
    expect(server).toContain("vercelCheck");
  });

  it("reuses the canonical Agent bridge client for privileged release evidence", () => {
    const server = source("features/ops/server/get-release-health.ts");
    expect(server).toContain('import { agentTeamRequest } from "@/features/agent/server/teamClient"');
    expect(server).toContain("agentTeamRequest<AgentReleaseEvidencePayload>");
    expect(server).toContain("/ops/release-evidence?since=");
    expect(server).toContain("publicAgentRuntime");
    expect(server).not.toContain("resolveAgentApiSecrets");
    expect(server).not.toContain('"x-agent-api-secret": secret');
    expect(server).not.toContain("ops_release_database_snapshot");
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(server).not.toContain("PROFIXIQ_SUPABASE_MANAGEMENT_TOKEN");
    expect(server).not.toContain("api.supabase.com");
    expect(server).not.toContain("createClient(");
  });

  it("never turns unavailable database evidence into false migration drift", () => {
    const server = source("features/ops/server/get-release-health.ts");
    const component = source("features/ops/components/OpsReleaseHealth.tsx");
    expect(server).toContain('const databaseEvidenceAvailable = infrastructure.database.state === "healthy"');
    expect(server).toContain("const pending = databaseEvidenceAvailable");
    expect(server).toContain("const drift = databaseEvidenceAvailable");
    expect(server).toContain("appliedCount: databaseEvidenceAvailable ? appliedVersions.length : null");
    expect(server).toContain('migrationStatus = "pending"');
    expect(server).toContain('migrationStatus = "drift"');
    expect(component).toContain('snapshot.migrations.appliedCount ?? "Unavailable"');
  });

  it("reports release failures from sanitized Agent evidence", () => {
    const server = source("features/ops/server/get-release-health.ts");
    expect(server).toContain("failuresSince");
    expect(server).toContain("unresolvedFailures");
    expect(server).toContain("latestFailureAt");
  });

  it("surfaces Deployments in desktop/mobile Ops navigation and the Overview control surfaces", () => {
    const shell = source("features/ops/components/OpsShell.tsx");
    const dashboard = source("features/ops/components/OpsDashboard.tsx");
    expect(shell).toContain('{ href: "/ops/deployments", label: "Deployments", icon: GitBranch }');
    expect(shell.match(/aria-label="Operations navigation"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dashboard).toContain('href: "/ops/system-health"');
    expect(dashboard).toContain('href: "/ops/deployments"');
    expect(dashboard).toContain('href: "/ops/agent-control"');
    expect(dashboard).toContain("Operations control surfaces");
  });

  it("keeps the release page read-only and explicit about evidence sources", () => {
    const component = source("features/ops/components/OpsReleaseHealth.tsx");
    expect(component).toContain("Deployments &amp; release health");
    expect(component).toContain("This page is read-only");
    expect(component).toContain("Open PRs waiting on main");
    expect(component).toContain("Migration release state");
    expect(component).toContain("Failures since release");
    expect(component).toContain("Release evidence sources");
  });

  it("explains release blockers and provides evidence-first inspection actions", () => {
    const component = source("features/ops/components/OpsReleaseHealth.tsx");
    expect(component).toContain("releaseIssues");
    expect(component).toContain("Explain blockers");
    expect(component).toContain("Inspect CI evidence");
    expect(component).toContain("Blocking — no CI evidence");
    expect(component).toContain("Migration parity failed");
    expect(component).toContain("Compare migration ledgers");
    expect(component).toContain("In main, not production");
    expect(component).toContain("In production, not main");
    expect(component).toContain("Open Agent Control for a fix plan");
    expect(component).toContain("Ledger read succeeded; migration parity failed.");
  });
});
