import "server-only";

import { randomUUID } from "node:crypto";

import { estimateOpenAITextCostUsd } from "@/features/shared/lib/server/ai-cost";
import type { AIFeature } from "@/features/shared/lib/server/ai-policy";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export type AITelemetryFeature =
  | AIFeature
  | "technician_copilot_text"
  | "technician_copilot_documentation";

export type AITelemetryEvent = {
  /** Stable only when the caller already has a durable receipt/request key. */
  event_key?: string | null;
  feature: AITelemetryFeature;
  endpoint: string;
  shop_id: string | null;
  user_id: string | null;
  provider?: string;
  model: string | null;
  modality?: "text" | "realtime" | "speech" | "image" | "other";
  latency_ms: number;
  prompt_tokens: number | null;
  cached_prompt_tokens?: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  audio_input_tokens?: number | null;
  audio_output_tokens?: number | null;
  speech_characters?: number | null;
  duration_seconds?: number | null;
  estimated_cost_usd?: number | null;
  status: "success" | "error";
  error_code: string | null;
  error_message: string | null;
  provider_request_id?: string | null;
  quota_receipt_id?: string | null;
  occurred_at?: string | null;
};

type LedgerRpcResult = {
  data: unknown;
  error: { message: string; code?: string | null } | null;
};

type LedgerRpcClient = {
  rpc: (
    name: "record_ai_usage_ledger",
    args: Record<string, unknown>,
  ) => Promise<LedgerRpcResult>;
};

export type AITelemetryRecordResult = {
  eventKey: string;
  persisted: boolean;
  estimatedCostUsd: number | null;
};

function normalizedCost(event: AITelemetryEvent): number | null {
  if (event.estimated_cost_usd !== undefined) {
    return event.estimated_cost_usd;
  }
  if ((event.provider ?? "openai") !== "openai") return null;
  if ((event.modality ?? "text") !== "text") return null;
  return estimateOpenAITextCostUsd(event.model, {
    promptTokens: event.prompt_tokens,
    cachedPromptTokens: event.cached_prompt_tokens,
    completionTokens: event.completion_tokens,
    totalTokens: event.total_tokens,
  });
}

/**
 * Records the existing structured log event and persists the same accounting
 * facts into the private AI usage ledger. Ledger persistence is awaited by
 * callers that need financial durability, but a telemetry outage never turns a
 * successful technician/shop workflow into a user-visible failure.
 */
export async function recordAITelemetry(
  event: AITelemetryEvent,
): Promise<AITelemetryRecordResult> {
  const eventKey = event.event_key?.trim() || randomUUID();
  const estimatedCostUsd = normalizedCost(event);
  const loggedEvent = {
    type: "ai_telemetry",
    ...event,
    event_key: eventKey,
    estimated_cost_usd: estimatedCostUsd,
  };
  console.info(JSON.stringify(loggedEvent));

  try {
    // The RPC is introduced by the same forward migration as this code. Cast
    // only the RPC surface here so existing generated Database types remain the
    // source of truth everywhere else until schema type generation runs.
    const admin = createAdminSupabase() as unknown as LedgerRpcClient;
    const { error } = await admin.rpc("record_ai_usage_ledger", {
      p_event_key: eventKey,
      p_shop_id: event.shop_id,
      p_user_id: event.user_id,
      p_feature: event.feature,
      p_endpoint: event.endpoint,
      p_provider: event.provider ?? "openai",
      p_model: event.model,
      p_modality: event.modality ?? "text",
      p_prompt_tokens: event.prompt_tokens,
      p_cached_prompt_tokens: event.cached_prompt_tokens ?? null,
      p_completion_tokens: event.completion_tokens,
      p_total_tokens: event.total_tokens,
      p_audio_input_tokens: event.audio_input_tokens ?? null,
      p_audio_output_tokens: event.audio_output_tokens ?? null,
      p_speech_characters: event.speech_characters ?? null,
      p_duration_seconds: event.duration_seconds ?? null,
      p_estimated_cost_usd: estimatedCostUsd,
      p_latency_ms: Math.max(0, Math.round(event.latency_ms)),
      p_status: event.status,
      p_error_code: event.error_code,
      p_error_message: event.error_message,
      p_provider_request_id: event.provider_request_id ?? null,
      p_quota_receipt_id: event.quota_receipt_id ?? null,
      p_occurred_at: event.occurred_at ?? null,
    });

    if (error) {
      console.error("[ai-telemetry] durable ledger write failed", {
        eventKey,
        feature: event.feature,
        endpoint: event.endpoint,
        code: error.code ?? null,
        error: error.message.slice(0, 200),
      });
      return { eventKey, persisted: false, estimatedCostUsd };
    }

    return { eventKey, persisted: true, estimatedCostUsd };
  } catch (error) {
    console.error("[ai-telemetry] durable ledger write failed", {
      eventKey,
      feature: event.feature,
      endpoint: event.endpoint,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
    });
    return { eventKey, persisted: false, estimatedCostUsd };
  }
}
