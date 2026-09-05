// Shared durable-quota + cost/telemetry accounting for AI-calling API
// routes, extracted from /api/ai/interpret's own (previously hand-rolled,
// duplicated-on-every-failure-path) wiring around claimDurableAIRouteQuota /
// completeDurableAIRouteQuota / estimateAICostUsd / recordAITelemetry /
// registerAIUsageEvent.
//
// This is deliberately model-call-agnostic: `operation` can wrap a plain
// `openai.chat.completions.create()` call (as /api/ai/interpret's own
// prompt/response-format still does — unchanged by this file) or a
// runOpenAIStructuredJson() call, as long as it reports back the token
// usage and model actually used. That keeps this the one place a future
// caller goes for the same operational safety net /api/ai/interpret has
// always had, without forcing every caller onto the same OpenAI API
// surface or response format.
import "server-only";

import {
  claimDurableAIRouteQuota,
  completeDurableAIRouteQuota,
  type DurableAIFeature,
} from "@/features/shared/lib/server/durable-ai-guard";
import {
  estimateAICostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import type { AIFeature } from "@/features/shared/lib/server/ai-policy";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type AdminSupabaseClient = ReturnType<typeof createAdminSupabase>;

/** The shop/actor is rate-limited or over its hard monthly budget. */
export class AIQuotaExceededError extends Error {
  constructor(
    public readonly reason: "rate_limited" | "hard_budget_exceeded",
    public readonly retryAfterSeconds: number,
  ) {
    super(`AI route quota exceeded: ${reason}`);
    this.name = "AIQuotaExceededError";
  }
}

/** The durable quota RPC itself failed (distinct from a denied claim). */
export class AIQuotaUnavailableError extends Error {
  constructor(cause: unknown) {
    super("AI route quota unavailable");
    this.name = "AIQuotaUnavailableError";
    this.cause = cause;
  }
}

export type AIRouteQuotaConfig = {
  admin: AdminSupabaseClient;
  durableFeature: DurableAIFeature;
  telemetryFeature: AIFeature;
  endpoint: string;
  actorId: string;
  shopId: string;
};

export type AIRouteQuotaOperationResult<T> = {
  output: T;
  model: string | null;
  latencyMs: number;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

/**
 * Wraps a model call with the same durable-quota claim/complete, cost
 * estimation, and telemetry/usage-event accounting /api/ai/interpret has
 * always had. Throws AIQuotaUnavailableError if the quota RPC itself
 * fails, AIQuotaExceededError if the shop/actor is over quota (neither
 * case runs `operation`), or whatever `operation` itself throws on a model
 * failure (recorded as a failed completion first, then rethrown unwrapped
 * so callers keep their own error-to-status-code mapping).
 */
export async function withDurableAIQuota<T>(
  config: AIRouteQuotaConfig,
  operation: () => Promise<AIRouteQuotaOperationResult<T>>,
): Promise<T> {
  let claim: Awaited<ReturnType<typeof claimDurableAIRouteQuota>>;
  try {
    claim = await claimDurableAIRouteQuota({
      admin: config.admin,
      feature: config.durableFeature,
      shopId: config.shopId,
      actorId: config.actorId,
    });
  } catch (error) {
    throw new AIQuotaUnavailableError(error);
  }

  if (!claim.allowed) {
    throw new AIQuotaExceededError(claim.reason, claim.retryAfterSeconds);
  }

  try {
    const result = await operation();
    const totalTokens = result.usage?.totalTokens ?? null;
    const estimatedCostUsd = estimateAICostUsd(config.telemetryFeature, totalTokens);

    await completeDurableAIRouteQuota({
      admin: config.admin,
      feature: config.durableFeature,
      shopId: config.shopId,
      actorId: config.actorId,
      receiptId: claim.receiptId,
      actualCostUsd: estimatedCostUsd,
      succeeded: true,
    });
    recordAITelemetry({
      feature: config.telemetryFeature,
      endpoint: config.endpoint,
      shop_id: config.shopId,
      user_id: config.actorId,
      model: result.model,
      latency_ms: result.latencyMs,
      prompt_tokens: result.usage?.promptTokens ?? null,
      completion_tokens: result.usage?.completionTokens ?? null,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd,
      status: "success",
      error_code: null,
      error_message: null,
    });
    registerAIUsageEvent({
      feature: config.telemetryFeature,
      endpoint: config.endpoint,
      shopId: config.shopId,
      model: result.model,
      totalTokens,
      estimatedCostUsd,
      status: "success",
      errorCode: null,
    });

    return result.output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const errorCode = /timed out/i.test(message)
      ? "provider_timeout"
      : "provider_error";

    await completeDurableAIRouteQuota({
      admin: config.admin,
      feature: config.durableFeature,
      shopId: config.shopId,
      actorId: config.actorId,
      receiptId: claim.receiptId,
      actualCostUsd: 0,
      succeeded: false,
    });
    recordAITelemetry({
      feature: config.telemetryFeature,
      endpoint: config.endpoint,
      shop_id: config.shopId,
      user_id: config.actorId,
      model: null,
      latency_ms: 0,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      estimated_cost_usd: 0,
      status: "error",
      error_code: errorCode,
      error_message: message.slice(0, 200),
    });
    registerAIUsageEvent({
      feature: config.telemetryFeature,
      endpoint: config.endpoint,
      shopId: config.shopId,
      model: null,
      totalTokens: null,
      estimatedCostUsd: 0,
      status: "error",
      errorCode,
    });

    throw error;
  }
}
