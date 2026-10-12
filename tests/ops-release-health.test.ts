import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Ops deployments and release health", () => {
  it("uses the native ProFixIQ deployment health route", () => {
    const page = source("app/ops/deployments/page.tsx");
    const server = source("features/ops/server/get-deployment-health.ts");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("getOpsDeploymentHealth");
    expect(page).toContain("<OpsDeploymentHealth snapshot={snapshot} />");
    expect(server).toContain("await requireOpsOperatorPageAccess()");
  });

  it("correlates Vercel runtime identity with GitHub main, CI and open PRs without the retired engineering agent", () => {
    const server = source("features/ops/server/get-deployment-health.ts");
    expect(server).toContain("VERCEL_GIT_COMMIT_SHA");
    expect(server).toContain("VERCEL_DEPLOYMENT_ID");
    expect(server).toContain('githubJson<GithubCommit>("/commits/main")');
    expect(server).toContain('"/pulls?state=open&base=main&per_page=30&sort=updated&direction=desc"');
    expect(server).toContain("/check-runs?per_page=100");
    expect(server).toContain("matchesMain");
    expect(server).not.toContain("teamClient");
    expect(server).not.toContain("PROFIXIQ_AGENT_URL");
    expect(server).not.toContain("AGENT_API_SECRET");
  });

  it("checks production data directly through the authenticated Ops Supabase path", () => {
    const server = source("features/ops/server/get-deployment-health.ts");
    expect(server).toContain('.from("agent_requests")');
    expect(server).toContain('select("id", { count: "exact", head: true })');
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(server).not.toContain("api.supabase.com");
  });

  it("surfaces Deployments and Feedback in Ops navigation", () => {
    const shell = source("features/ops/components/OpsShell.tsx");
    expect(shell).toContain('{ href: "/ops/deployments", label: "Deployments", icon: GitBranch }');
    expect(shell).toContain('{ href: "/ops/feedback", label: "Feedback", icon: MessageSquareText }');
    expect(shell.match(/aria-label="Operations navigation"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps deployment health read-only and explicit that the engineering agent is retired", () => {
    const component = source("features/ops/components/OpsDeploymentHealth.tsx");
    expect(component).toContain("Deployments &amp; release health");
    expect(component).toContain("The retired engineering agent is no longer part of release health.");
    expect(component).toContain("Production commit parity");
    expect(component).toContain("CI checks");
    expect(component).toContain("Production data");
    expect(component).toContain("Open pull requests");
  });
});
