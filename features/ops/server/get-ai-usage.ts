import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";

export type OpsAIUsageBreakdownRow = {
  key: string;
  id?: string | null;
  endpoint?: string | null;
  source_product?: string | null;
  requests: number;
  tokens: number;
  cost: number;
};

export type OpsAIUsageEvent = {
  id: string;
  occurred_at: string;
  source_product: "profixiq_app" | "engineering_agent";
  feature: string;
  endpoint: string;
  model: string | null;
  status: "success" | "error";
  error_code: string | null;
  cost: number | null;
  prompt_tokens: number | null;
  cached_prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  agent_run_id: string | null;
  external_request_id: string | null;
  operation: string | null;
};

export type OpsAIUsageWarning = {
  severity: "critical" | "warning";
  kind: "abnormal_prompt" | "runaway_agent_run" | "high_request_frequency";
  title: string;
  detail: string;
  metric: number;
  ref: string;
};

export type OpsAIUsageSnapshot = {
  generatedAt: string;
  since: string;
  summary: {
    spendToday: number;
    spend7d: number;
    spendMonth: number;
    promptTokens: number;
    cachedPromptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
    avgTokensPerRequest: number;
    failures: number;
    rateLimited: number;
  };
  products: OpsAIUsageBreakdownRow[];
  features: OpsAIUsageBreakdownRow[];
  models: OpsAIUsageBreakdownRow[];
  shops: OpsAIUsageBreakdownRow[];
  users: OpsAIUsageBreakdownRow[];
  expensiveEvents: OpsAIUsageEvent[];
  trend: Array<{ bucket: string; requests: number; tokens: number; cost: number }>;
  warnings: OpsAIUsageWarning[];
};

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSnapshot(raw: unknown): OpsAIUsageSnapshot {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const summaryRaw = value.summary && typeof value.summary === "object"
    ? value.summary as Record<string, unknown>
    : {};
  const normalizeRows = (key: string): OpsAIUsageBreakdownRow[] =>
    Array.isArray(value[key])
      ? (value[key] as Array<Record<string, unknown>>).map((row) => ({
          key: String(row.key ?? "Unknown"),
          id: row.id == null ? null : String(row.id),
          endpoint: row.endpoint == null ? null : String(row.endpoint),
          source_product: row.source_product == null ? null : String(row.source_product),
          requests: numberValue(row.requests),
          tokens: numberValue(row.tokens),
          cost: numberValue(row.cost),
        }))
      : [];

  return {
    generatedAt: String(value.generatedAt ?? new Date().toISOString()),
    since: String(value.since ?? new Date(Date.now() - 30 * 86400000).toISOString()),
    summary: {
      spendToday: numberValue(summaryRaw.spendToday),
      spend7d: numberValue(summaryRaw.spend7d),
      spendMonth: numberValue(summaryRaw.spendMonth),
      promptTokens: numberValue(summaryRaw.promptTokens),
      cachedPromptTokens: numberValue(summaryRaw.cachedPromptTokens),
      completionTokens: numberValue(summaryRaw.completionTokens),
      totalTokens: numberValue(summaryRaw.totalTokens),
      requests: numberValue(summaryRaw.requests),
      avgTokensPerRequest: numberValue(summaryRaw.avgTokensPerRequest),
      failures: numberValue(summaryRaw.failures),
      rateLimited: numberValue(summaryRaw.rateLimited),
    },
    products: normalizeRows("products"),
    features: normalizeRows("features"),
    models: normalizeRows("models"),
    shops: normalizeRows("shops"),
    users: normalizeRows("users"),
    expensiveEvents: Array.isArray(value.expensiveEvents)
      ? value.expensiveEvents as OpsAIUsageEvent[]
      : [],
    trend: Array.isArray(value.trend)
      ? (value.trend as Array<Record<string, unknown>>).map((row) => ({
          bucket: String(row.bucket ?? ""),
          requests: numberValue(row.requests),
          tokens: numberValue(row.tokens),
          cost: numberValue(row.cost),
        }))
      : [],
    warnings: Array.isArray(value.warnings)
      ? value.warnings as OpsAIUsageWarning[]
      : [],
  };
}

export async function getOpsAIUsage(): Promise<OpsAIUsageSnapshot> {
  await requireOpsOperatorPageAccess();

  const admin = createAdminSupabase();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await admin.rpc("get_ops_ai_usage_snapshot", {
    p_since: since,
    p_event_limit: 50,
  });

  if (error) {
    throw new Error(`Unable to load AI usage: ${error.message}`);
  }

  return normalizeSnapshot(data);
}
