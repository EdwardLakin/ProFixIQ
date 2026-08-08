import "server-only";

import type { Database } from "@shared/types/types/supabase";
import type { OpsAgentRequestSummary } from "@/features/ops/lib/dashboard";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";

type AgentRequestRow = Pick<
  Database["public"]["Tables"]["agent_requests"]["Row"],
  | "id"
  | "description"
  | "intent"
  | "status"
  | "normalized_json"
  | "github_pr_number"
  | "github_pr_url"
  | "created_at"
  | "updated_at"
>;

export async function getOpsDashboardRequests(): Promise<
  OpsAgentRequestSummary[]
> {
  const access = await requireOpsOperatorPageAccess();
  const { data, error } = await access.supabase
    .from("agent_requests")
    .select(
      "id, description, intent, status, normalized_json, github_pr_number, github_pr_url, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .returns<AgentRequestRow[]>();

  if (error) {
    throw new Error(`Unable to load ops dashboard requests: ${error.message}`);
  }

  return (data ?? []).map((request) => ({
    ...request,
    intent: request.intent ?? null,
  }));
}
