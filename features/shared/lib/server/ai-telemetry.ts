import "server-only";

import { randomUUID } from "node:crypto";

import {
  AI_RATE_CARD_VERSION,
  estimateOpenAISpeechCostUsd,
  estimateOpenAITextCostUsd,
} from "@/features/shared/lib/server/ai-cost";
import type { AIFeature } from "@/features/shared/lib/server/ai-policy";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export type AITelemetryFeature =
  | AIFeature
  | "technician_copilot_text"
  | "technician_copilot_documentation";

export type AITelemetryEvent = {
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
  const provider = event.provider ?? "openai";
  const modality = event.modality ?? "text";

  // Durable ledger accounting is model-aware even when legacy callers still
  // supply the old blended estimate for their separate quota/anomaly logic.
  if (provider === "openai" && modality === "text") {
    const priced = estimateOpenAITextCostUsd({
      model: event.model,
      promptTokens: event.prompt_tokens,
      cachedPromptTokens: event.cached_prompt_tokens,
      completionTokens: event.completion_tokens,
    });
    if (priced !== null) return priced;
  }

  if (
    provider === "openai" &&
    modality === "speech" &&
    event.speech_characters != null
  ) {
    return estimateOpenAISpeechCostUsd(event.speech_characters);
  }

  return event.estimated_cost_usd ?? null;
}

export async function recordAITelemetry(
  event: AITelemetryEvent,
): Promise<AITelemetryRecordResult> {
  const eventKey = event.event_key?.trim() || randomUUID();
  const estimatedCostUsd = normalizedCost(event);
  console.info(
    JSON.stringify({
      type: "ai_telemetry",
      ...event,
      event_key: eventKey,
      rate_card_version: AI_RATE_CARD_VERSION,
      estimated_cost_usd: estimatedCostUsd,
    }),
  );

  try {
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
      p_rate_card_version: AI_RATE_CARD_VERSION,
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
