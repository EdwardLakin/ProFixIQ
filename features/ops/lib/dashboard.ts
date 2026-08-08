import type { Json } from "@shared/types/types/supabase";

export type OpsAgentRequestStatus =
  | "submitted"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "merged";

export type OpsAgentRequestSummary = {
  id: string;
  description: string;
  intent: string | null;
  status: OpsAgentRequestStatus;
  normalized_json: Json | null;
  github_pr_number: number | null;
  github_pr_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OpsDashboardMetrics = {
  total: number;
  open: number;
  awaitingApproval: number;
  inProgress: number;
  blocked: number;
  failed: number;
};

function agentTeamState(
  value: Json | null,
): Record<string, Json | undefined> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const team = value.agentTeam;
  if (!team || Array.isArray(team) || typeof team !== "object") return null;
  return team;
}

export function isOpsRequestBlocked(request: OpsAgentRequestSummary): boolean {
  return agentTeamState(request.normalized_json)?.caseStatus === "blocked";
}

export function buildOpsDashboardMetrics(
  requests: OpsAgentRequestSummary[],
): OpsDashboardMetrics {
  return {
    total: requests.length,
    open: requests.filter(
      (request) => !["merged", "rejected"].includes(request.status),
    ).length,
    awaitingApproval: requests.filter(
      (request) => request.status === "awaiting_approval",
    ).length,
    inProgress: requests.filter((request) => request.status === "in_progress")
      .length,
    blocked: requests.filter(isOpsRequestBlocked).length,
    failed: requests.filter((request) => request.status === "failed").length,
  };
}

export function opsRequestPriority(request: OpsAgentRequestSummary): number {
  if (request.status === "awaiting_approval") return 0;
  if (isOpsRequestBlocked(request)) return 1;
  if (request.status === "failed") return 2;
  if (request.status === "submitted") return 3;
  if (request.status === "in_progress") return 4;
  return 5;
}

export function attentionRequests(
  requests: OpsAgentRequestSummary[],
  limit = 5,
): OpsAgentRequestSummary[] {
  return requests
    .filter(
      (request) =>
        request.status === "awaiting_approval" ||
        request.status === "failed" ||
        request.status === "submitted" ||
        isOpsRequestBlocked(request),
    )
    .sort((left, right) => {
      const priority = opsRequestPriority(left) - opsRequestPriority(right);
      if (priority !== 0) return priority;
      return (
        new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime()
      );
    })
    .slice(0, limit);
}
