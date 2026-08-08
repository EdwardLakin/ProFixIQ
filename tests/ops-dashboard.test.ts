import { describe, expect, it } from "vitest";
import {
  attentionRequests,
  buildOpsDashboardMetrics,
  isOpsRequestBlocked,
  type OpsAgentRequestSummary,
} from "@/features/ops/lib/dashboard";

function request(
  id: string,
  status: OpsAgentRequestSummary["status"],
  options: { blocked?: boolean; updatedAt?: string } = {},
): OpsAgentRequestSummary {
  return {
    id,
    description: `Request ${id}`,
    intent: "bug_report",
    status,
    normalized_json: options.blocked
      ? { agentTeam: { caseStatus: "blocked" } }
      : {},
    github_pr_number: null,
    github_pr_url: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: options.updatedAt ?? "2026-08-02T00:00:00.000Z",
  };
}

describe("ops dashboard request triage", () => {
  it("summarizes the canonical agent request states", () => {
    const requests = [
      request("approval", "awaiting_approval"),
      request("working", "in_progress"),
      request("blocked", "in_progress", { blocked: true }),
      request("failure", "failed"),
      request("merged", "merged"),
      request("rejected", "rejected"),
    ];

    expect(buildOpsDashboardMetrics(requests)).toEqual({
      total: 6,
      open: 4,
      awaitingApproval: 1,
      inProgress: 2,
      blocked: 1,
      failed: 1,
    });
    expect(isOpsRequestBlocked(requests[2])).toBe(true);
  });

  it("prioritizes approvals before blocked, failed, and submitted work", () => {
    const requests = [
      request("submitted", "submitted"),
      request("failed", "failed"),
      request("blocked", "in_progress", { blocked: true }),
      request("approval-old", "awaiting_approval", {
        updatedAt: "2026-08-02T00:00:00.000Z",
      }),
      request("approval-new", "awaiting_approval", {
        updatedAt: "2026-08-03T00:00:00.000Z",
      }),
      request("working", "in_progress"),
    ];

    expect(attentionRequests(requests).map(({ id }) => id)).toEqual([
      "approval-new",
      "approval-old",
      "blocked",
      "failed",
      "submitted",
    ]);
  });

  it("limits the attention queue without mutating the input", () => {
    const requests = [
      request("one", "failed"),
      request("two", "failed"),
      request("three", "failed"),
    ];
    const originalOrder = requests.map(({ id }) => id);

    expect(attentionRequests(requests, 2)).toHaveLength(2);
    expect(requests.map(({ id }) => id)).toEqual(originalOrder);
  });
});
