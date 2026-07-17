import "server-only";

import type { AIFeature } from "@/features/shared/lib/server/ai-policy";

type AIOpsPolicy = {
  budgetSoftUsd: number;
  budgetHardUsd: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  anomalySpikeThreshold: number;
  anomalyFailureThreshold: number;
  anomalyHighCostUsd: number;
  anomalyHardDenialThreshold: number;
};

type EnforceInput = {
  feature: AIFeature;
  endpoint: string;
  shopId: string | null;
};

type UsageEventInput = {
  feature: AIFeature;
  endpoint: string;
  shopId: string | null;
  model: string | null;
  totalTokens: number | null;
  estimatedCostUsd: number;
  status: "success" | "error";
  errorCode: string | null;
};

const monthUsage = new Map<string, number>();
const rateBuckets = new Map<string, number[]>();
const failureBuckets = new Map<string, number[]>();
const hardDenialBuckets = new Map<string, number[]>();

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function startOfMonthEpoch(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
}

function usageKey(shopId: string | null, feature: AIFeature, now: Date): string {
  const shopScope = shopId ?? "unknown_shop";
  return `${shopScope}:${feature}:${startOfMonthEpoch(now)}`;
}

function scopedKey(shopId: string | null, endpoint: string): string {
  return `${shopId ?? "unknown_shop"}:${endpoint}`;
}

const FEATURE_POLICY: Record<AIFeature, AIOpsPolicy> = {
  work_orders_suggest_lines: {
    budgetSoftUsd: envNum("AI_BUDGET_SOFT_USD_SUGGEST_LINES", 40),
    budgetHardUsd: envNum("AI_BUDGET_HARD_USD_SUGGEST_LINES", 60),
    rateLimitMax: envNum("AI_RATE_LIMIT_SUGGEST_LINES_MAX", 30),
    rateLimitWindowMs: envNum("AI_RATE_LIMIT_SUGGEST_LINES_WINDOW_MS", 5 * 60 * 1000),
    anomalySpikeThreshold: envNum("AI_ANOMALY_SPIKE_SUGGEST_LINES", 20),
    anomalyFailureThreshold: envNum("AI_ANOMALY_FAIL_SUGGEST_LINES", 6),
    anomalyHighCostUsd: envNum("AI_ANOMALY_COST_SUGGEST_LINES", 0.2),
    anomalyHardDenialThreshold: envNum("AI_ANOMALY_DENIAL_SUGGEST_LINES", 4),
  },
  ai_summarize_stats: {
    budgetSoftUsd: envNum("AI_BUDGET_SOFT_USD_SUMMARIZE_STATS", 30),
    budgetHardUsd: envNum("AI_BUDGET_HARD_USD_SUMMARIZE_STATS", 50),
    rateLimitMax: envNum("AI_RATE_LIMIT_SUMMARIZE_STATS_MAX", 20),
    rateLimitWindowMs: envNum("AI_RATE_LIMIT_SUMMARIZE_STATS_WINDOW_MS", 5 * 60 * 1000),
    anomalySpikeThreshold: envNum("AI_ANOMALY_SPIKE_SUMMARIZE_STATS", 15),
    anomalyFailureThreshold: envNum("AI_ANOMALY_FAIL_SUMMARIZE_STATS", 6),
    anomalyHighCostUsd: envNum("AI_ANOMALY_COST_SUMMARIZE_STATS", 0.15),
    anomalyHardDenialThreshold: envNum("AI_ANOMALY_DENIAL_SUMMARIZE_STATS", 4),
  },
  openai_realtime_token: {
    budgetSoftUsd: envNum("AI_BUDGET_SOFT_USD_REALTIME_TOKEN", 15),
    budgetHardUsd: envNum("AI_BUDGET_HARD_USD_REALTIME_TOKEN", 30),
    rateLimitMax: envNum("AI_RATE_LIMIT_REALTIME_TOKEN_MAX", 60),
    rateLimitWindowMs: envNum("AI_RATE_LIMIT_REALTIME_TOKEN_WINDOW_MS", 5 * 60 * 1000),
    anomalySpikeThreshold: envNum("AI_ANOMALY_SPIKE_REALTIME_TOKEN", 30),
    anomalyFailureThreshold: envNum("AI_ANOMALY_FAIL_REALTIME_TOKEN", 8),
    anomalyHighCostUsd: envNum("AI_ANOMALY_COST_REALTIME_TOKEN", 0.05),
    anomalyHardDenialThreshold: envNum("AI_ANOMALY_DENIAL_REALTIME_TOKEN", 8),
  },
  work_order_documentation_rewrite: {
    budgetSoftUsd: envNum("AI_BUDGET_SOFT_USD_DOCUMENTATION", 30),
    budgetHardUsd: envNum("AI_BUDGET_HARD_USD_DOCUMENTATION", 50),
    rateLimitMax: envNum("AI_RATE_LIMIT_DOCUMENTATION_MAX", 40),
    rateLimitWindowMs: envNum("AI_RATE_LIMIT_DOCUMENTATION_WINDOW_MS", 5 * 60 * 1000),
    anomalySpikeThreshold: envNum("AI_ANOMALY_SPIKE_DOCUMENTATION", 25),
    anomalyFailureThreshold: envNum("AI_ANOMALY_FAIL_DOCUMENTATION", 6),
    anomalyHighCostUsd: envNum("AI_ANOMALY_COST_DOCUMENTATION", 0.15),
    anomalyHardDenialThreshold: envNum("AI_ANOMALY_DENIAL_DOCUMENTATION", 4),
  },
  branding_generate_logo: {
    budgetSoftUsd: envNum("AI_BUDGET_SOFT_USD_BRANDING", 80),
    budgetHardUsd: envNum("AI_BUDGET_HARD_USD_BRANDING", 120),
    rateLimitMax: envNum("AI_RATE_LIMIT_BRANDING_MAX", 10),
    rateLimitWindowMs: envNum("AI_RATE_LIMIT_BRANDING_WINDOW_MS", 10 * 60 * 1000),
    anomalySpikeThreshold: envNum("AI_ANOMALY_SPIKE_BRANDING", 7),
    anomalyFailureThreshold: envNum("AI_ANOMALY_FAIL_BRANDING", 4),
    anomalyHighCostUsd: envNum("AI_ANOMALY_COST_BRANDING", 1.5),
    anomalyHardDenialThreshold: envNum("AI_ANOMALY_DENIAL_BRANDING", 3),
  },
};

export function estimateAICostUsd(feature: AIFeature, totalTokens: number | null): number {
  const tokens = Math.max(totalTokens ?? 0, 0);
  const perThousand =
    feature === "branding_generate_logo"
      ? envNum("AI_COST_PER_1K_TOKENS_BRANDING", 0.04)
      : envNum("AI_COST_PER_1K_TOKENS_DEFAULT", 0.006);
  const minimumFlat = feature === "openai_realtime_token" ? 0.001 : 0;
  return Number(((tokens / 1000) * perThousand + minimumFlat).toFixed(6));
}

export function enforceAIOperationalPolicy(input: EnforceInput):
  | { allowed: true; softBudgetWarning: boolean }
  | { allowed: false; reason: "rate_limited" | "hard_budget_exceeded"; code: string } {
  const now = Date.now();
  const nowDate = new Date(now);
  const policy = FEATURE_POLICY[input.feature];
  const key = scopedKey(input.shopId, input.endpoint);

  const bucket = rateBuckets.get(key) ?? [];
  const filtered = bucket.filter((ts) => now - ts <= policy.rateLimitWindowMs);
  if (filtered.length >= policy.rateLimitMax) {
    hardDenialBuckets.set(key, [...(hardDenialBuckets.get(key) ?? []), now]);
    emitAlert("rate_limit_exceeded", input, { windowMs: policy.rateLimitWindowMs, max: policy.rateLimitMax });
    return { allowed: false, reason: "rate_limited", code: "ai_rate_limit_exceeded" };
  }
  filtered.push(now);
  rateBuckets.set(key, filtered);

  const mKey = usageKey(input.shopId, input.feature, nowDate);
  const currentBudget = monthUsage.get(mKey) ?? 0;

  if (currentBudget >= policy.budgetHardUsd) {
    hardDenialBuckets.set(key, [...(hardDenialBuckets.get(key) ?? []), now]);
    emitAlert("hard_budget_denial", input, { currentBudget, hardLimit: policy.budgetHardUsd });
    return { allowed: false, reason: "hard_budget_exceeded", code: "ai_budget_hard_limit_exceeded" };
  }

  return { allowed: true, softBudgetWarning: currentBudget >= policy.budgetSoftUsd };
}

export function registerAIUsageEvent(event: UsageEventInput): void {
  const now = Date.now();
  const nowDate = new Date(now);
  const policy = FEATURE_POLICY[event.feature];
  const mKey = usageKey(event.shopId, event.feature, nowDate);
  monthUsage.set(mKey, (monthUsage.get(mKey) ?? 0) + Math.max(event.estimatedCostUsd, 0));

  const key = scopedKey(event.shopId, event.endpoint);

  if (event.status === "error") {
    const failures = [...(failureBuckets.get(key) ?? []), now].filter(
      (ts) => now - ts <= policy.rateLimitWindowMs,
    );
    failureBuckets.set(key, failures);
    if (failures.length >= policy.anomalyFailureThreshold) {
      emitAlert("failure_spike", { feature: event.feature, endpoint: event.endpoint, shopId: event.shopId }, { count: failures.length });
    }
  }

  const requestsInWindow = (rateBuckets.get(key) ?? []).filter(
    (ts) => now - ts <= policy.rateLimitWindowMs,
  ).length;
  if (requestsInWindow >= policy.anomalySpikeThreshold) {
    emitAlert("request_spike", { feature: event.feature, endpoint: event.endpoint, shopId: event.shopId }, { count: requestsInWindow });
  }

  if (event.estimatedCostUsd >= policy.anomalyHighCostUsd) {
    emitAlert("high_request_cost", { feature: event.feature, endpoint: event.endpoint, shopId: event.shopId }, { estimatedCostUsd: event.estimatedCostUsd, model: event.model });
  }

  const denialCount = (hardDenialBuckets.get(key) ?? []).filter(
    (ts) => now - ts <= policy.rateLimitWindowMs,
  ).length;
  if (denialCount >= policy.anomalyHardDenialThreshold) {
    emitAlert("repeated_denials", { feature: event.feature, endpoint: event.endpoint, shopId: event.shopId }, { denialCount });
  }
}

function emitAlert(type: string, input: EnforceInput, details: Record<string, unknown>): void {
  console.warn(
    JSON.stringify({
      type: "ai_anomaly_alert",
      alert_type: type,
      feature: input.feature,
      endpoint: input.endpoint,
      shop_id: input.shopId,
      emitted_at: new Date().toISOString(),
      details,
    }),
  );
}
