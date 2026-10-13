import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), access: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.admin,
}));
vi.mock("@/features/ops/server/operator-access", () => ({
  requireOpsOperatorPageAccess: mocks.access,
}));
import { getOpsSystemHealth } from "@/features/ops/server/get-system-health";
import { getOpsDeploymentHealth } from "@/features/ops/server/get-deployment-health";
import {
  buildOpsDashboardMetrics,
  type OpsFeedbackSummary,
} from "@/features/ops/lib/dashboard";
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  mocks.access.mockResolvedValue({
    supabase: {
      from: () => ({ select: async () => ({ count: 1, error: null }) }),
    },
  });
  mocks.admin.mockReturnValue({
    rpc: async () => ({ data: true, error: null }),
    from: () => ({ select: async () => ({ count: 2, error: null }) }),
  });
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "merge-sha");
  vi.stubEnv("SUPABASE_ACCESS_TOKEN", "mock-token");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("OPS_REQUIRED_CI_CHECKS", "other");
});
const fetchEvidence = (checks: unknown[], merged?: string) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const value = String(url);
    let data: unknown = [];
    if (value.endsWith("/commits/main")) data = { sha: "merge-sha" };
    else if (value.includes("/check-runs"))
      data = {
        check_runs: value.includes("/head-sha/")
          ? [{ name: "checks", status: "completed", conclusion: "success" }]
          : checks,
      };
    else if (value.includes("/commits/merge-sha/pulls"))
      data = merged
        ? [
            {
              merged_at: "2026-10-12",
              merge_commit_sha: merged,
              head: { sha: "head-sha" },
            },
          ]
        : [];
    return new Response(JSON.stringify(data), { status: 200 });
  });
describe("Ops evidence matches the canonical feedback path", () => {
  it("keeps System Health available when the privileged client is missing", async () => {
    mocks.admin.mockImplementation(() => {
      throw new Error("missing service credential");
    });
    const health = await getOpsSystemHealth();
    expect(health.overall).toBe("down");
    expect(
      health.services.find((service) => service.key === "feedback")?.state,
    ).toBe("down");
  });
  it("cannot report healthy CI without the universal checks gate, even with configured extra names", async () => {
    fetchEvidence([
      { name: "other", status: "completed", conclusion: "success" },
    ]);
    const health = await getOpsDeploymentHealth();
    expect(health.ci.state).toBe("degraded");
    expect(health.ci.missingRequired).toContain("checks");
  });
  it("inherits checks only from the PR associated with the exact production merge commit", async () => {
    fetchEvidence(
      [{ name: "other", status: "completed", conclusion: "success" }],
      "merge-sha",
    );
    expect((await getOpsDeploymentHealth()).ci.state).toBe("healthy");
  });
  it("rejects an unrelated green PR as deployment evidence", async () => {
    fetchEvidence(
      [{ name: "other", status: "completed", conclusion: "success" }],
      "different-merge",
    );
    expect((await getOpsDeploymentHealth()).ci.missingRequired).toContain(
      "checks",
    );
  });
  it("counts actual reports while counting product lifecycle decisions by theme", () => {
    const summary = {
      id: "theme",
      description: "Improve navigation",
      intent: null,
      status: "submitted",
      normalized_json: null,
      reporter_id: null,
      shop_id: null,
      created_at: "",
      updated_at: "",
      submissionCount: 10,
    } satisfies OpsFeedbackSummary;
    expect(buildOpsDashboardMetrics([summary])).toMatchObject({
      totalSubmissions: 10,
      newSubmissions: 10,
      completed: 0,
    });
  });
});
