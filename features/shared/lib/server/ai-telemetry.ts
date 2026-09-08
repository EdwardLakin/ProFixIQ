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
  /**
   * supabase-js resolves `.rpc()` to a PostgrestFilterBuilder, which implements
   * PromiseLike — it has `then()` but no `catch()`/`finally()`. Model that
   * exactly: typing it as a full Promise lets `.catch()` compile and then throw
   * `TypeError` at runtime, which silently discards every ledger write.
   */
  rpc: (
    name: "record_ai_usage_ledger",
    args: Record<string, unknown>,
  ) => PromiseLike<LedgerRpcResult>;
};

export type AITelemetryRecordResult = {
  eventKey: string;
  persisted: boolean;
  estimatedCostUsd: number | null;
};

const AI_TELEMETRY_WRITE_TIMEOUT_MS = 1_000;

function normalizedCost(event: AITelemetryEvent): number | null {
  const provider = event.provider ?? "openai";
  const modality = event.modality ?? "text";

  // Durable ledger accounting is model-aware even when legacy callers still
  // supply the old blended estimate for their separate quota/anomaly logic.
  if (provider === "openai" && modality === "text") {
    return estimateOpenAITextCostUsd({
      model: event.model,
      promptTokens: event.prompt_tokens,
      cachedPromptTokens: event.cached_prompt_tokens,
      completionTokens: event.completion_tokens,
    });
  }

  if (
    provider === "openai" &&
    modality === "speech" &&
    event.speech_characters != null
  ) {
    return estimateOpenAISpeechCostUsd(event.model, event.speech_characters);
  }

  // Image generation prices input and output dimensions separately, and there
  // is no rate card for gpt-image-1.5 yet. The branding caller's blended
  // per-1K-token proxy is not dimension-aware, so persist the raw usage and
  // leave durable cost unknown rather than recording a figure we cannot stand
  // behind — the same treatment gpt-4o-mini-tts already gets. The operational
  // budget proxy in registerAIUsageEvent is unchanged.
  if (provider === "openai" && modality === "image") {
    return null;
  }

  return event.estimated_cost_usd ?? null;
}

async function persistLedgerEvent(
  admin: LedgerRpcClient,
  args: Record<string, unknown>,
): Promise<LedgerRpcResult | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      // Promise.resolve() adopts the builder's thenable. Calling .catch()
      // on the builder itself throws before the request is ever issued.
      Promise.resolve(admin.rpc("record_ai_usage_ledger", args)).catch((error: unknown) => ({
        data: null,
        error: {
          message: error instanceof Error ? error.message : "unknown_error",
          code: "telemetry_rpc_exception",
        },
      })),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), AI_TELEMETRY_WRITE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function telemetryLogLine(
  event: AITelemetryEvent,
  eventKey: string,
  estimatedCostUsd: number | null,
): string {
  return JSON.stringify({
    type: "ai_telemetry",
    ...event,
    event_key: eventKey,
    rate_card_version: AI_RATE_CARD_VERSION,
    estimated_cost_usd: estimatedCostUsd,
  });
}

/**
 * Pre-existing structured-log telemetry contract. Synchronous, console-only,
 * and free of persistence side effects. Callers that additionally need durable
 * ledger accounting use `recordDurableAIUsage`.
 */
export function recordAITelemetry(event: AITelemetryEvent): void {
  const eventKey = event.event_key?.trim() || randomUUID();
  console.info(telemetryLogLine(event, eventKey, normalizedCost(event)));
}

/**
 * Durable AI usage accounting. Logs the same structured telemetry line as
 * `recordAITelemetry` and additionally persists the event to the private
 * usage ledger via the service-role-only `record_ai_usage_ledger` adapter.
 *
 * This is a separately named addition: `recordAITelemetry` keeps its original
 * synchronous, console-only contract so the ledger can be rolled out and
 * rolled back independently of the AI routes that only need logging.
 */
export async function recordDurableAIUsage(
  event: AITelemetryEvent,
): Promise<AITelemetryRecordResult> {
  const eventKey = event.event_key?.trim() || randomUUID();
  const estimatedCostUsd = normalizedCost(event);
  console.info(telemetryLogLine(event, eventKey, estimatedCostUsd));

  try {
    const admin = createAdminSupabase() as unknown as LedgerRpcClient;
    const result = await persistLedgerEvent(admin, {
      p_shop_id: event.shop_id,
      p_user_id: event.user_id,
      p_payload: {
        event_key: eventKey,
        feature: event.feature,
        endpoint: event.endpoint,
        provider: event.provider ?? "openai",
        model: event.model,
        modality: event.modality ?? "text",
        rate_card_version: AI_RATE_CARD_VERSION,
        prompt_tokens: event.prompt_tokens,
        cached_prompt_tokens: event.cached_prompt_tokens ?? null,
        completion_tokens: event.completion_tokens,
        total_tokens: event.total_tokens,
        audio_input_tokens: event.audio_input_tokens ?? null,
        audio_output_tokens: event.audio_output_tokens ?? null,
        speech_characters: event.speech_characters ?? null,
        duration_seconds: event.duration_seconds ?? null,
        estimated_cost_usd: estimatedCostUsd,
        latency_ms: Math.max(0, Math.round(event.latency_ms)),
        status: event.status,
        error_code: event.error_code,
        error_message: event.error_message,
        provider_request_id: event.provider_request_id ?? null,
        quota_receipt_id: event.quota_receipt_id ?? null,
        occurred_at: event.occurred_at ?? null,
      },
    });

    if (result === "timeout") {
      console.error("[ai-telemetry] durable ledger write timed out", {
        eventKey,
        feature: event.feature,
        endpoint: event.endpoint,
        timeoutMs: AI_TELEMETRY_WRITE_TIMEOUT_MS,
      });
      return { eventKey, persisted: false, estimatedCostUsd };
    }

    if (result.error) {
      console.error("[ai-telemetry] durable ledger write failed", {
        eventKey,
        feature: event.feature,
        endpoint: event.endpoint,
        code: result.error.code ?? null,
        error: result.error.message.slice(0, 200),
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
