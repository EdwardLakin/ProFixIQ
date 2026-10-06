import "server-only";

import { getAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import {
  recordDurableAIUsage,
  type AITelemetryEvent,
  type AITelemetryFeature,
} from "@/features/shared/lib/server/ai-telemetry";

/**
 * Provider-call accounting for every OpenAI request that is not already
 * ledgered by a route-specific path.
 *
 * `ledgerOpenAICall` wraps one provider call, reads whatever usage the response
 * carries, and writes exactly one durable ledger row — on success and on
 * failure. Accounting never changes the call's outcome: a ledger problem is
 * swallowed (and logged by `recordDurableAIUsage`), and a provider error is
 * re-thrown unchanged.
 *
 * Cost is never guessed. A row whose model has no rate, or whose usage was not
 * returned, is persisted with a null cost so Ops can surface it as unpriced
 * exposure instead of reading it as $0.
 */

export type OpenAICallAccountingContext = {
  feature: AITelemetryFeature | (string & {});
  endpoint: string;
  /**
   * Omit to inherit the ambient `withAITelemetryContext` tenant. An explicit
   * null, or no ambient context, ledgers the call as unattributed spend.
   */
  shopId?: string | null;
  userId?: string | null;
  model: string | null;
  modality?: AITelemetryEvent["modality"];
  operation?: string | null;
  /** Characters sent to a speech model; used for character-priced TTS. */
  speechCharacters?: number | null;
  sourceProduct?: AITelemetryEvent["source_product"];
};

export type OpenAIUsageSnapshot = {
  promptTokens: number | null;
  cachedPromptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  providerRequestId: string | null;
};

const EMPTY_USAGE: OpenAIUsageSnapshot = {
  promptTokens: null,
  cachedPromptTokens: null,
  completionTokens: null,
  totalTokens: null,
  providerRequestId: null,
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Reads usage from chat completions, the responses API, embeddings and image
 * responses. Missing fields stay null; nothing is inferred.
 */
export function readOpenAIUsage(response: unknown): OpenAIUsageSnapshot {
  if (!response || typeof response !== "object") return EMPTY_USAGE;
  const record = response as Record<string, unknown>;
  const usage =
    record.usage && typeof record.usage === "object"
      ? (record.usage as Record<string, unknown>)
      : null;
  const id =
    typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
  if (!usage) return { ...EMPTY_USAGE, providerRequestId: id };

  const details = (key: string): Record<string, unknown> | null => {
    const value = usage[key];
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  };
  const promptTokens =
    finiteNumber(usage.prompt_tokens) ?? finiteNumber(usage.input_tokens);
  const completionTokens =
    finiteNumber(usage.completion_tokens) ?? finiteNumber(usage.output_tokens);

  return {
    promptTokens,
    cachedPromptTokens:
      finiteNumber(details("prompt_tokens_details")?.cached_tokens) ??
      finiteNumber(details("input_tokens_details")?.cached_tokens),
    completionTokens,
    totalTokens:
      finiteNumber(usage.total_tokens) ??
      (promptTokens != null && completionTokens != null
        ? promptTokens + completionTokens
        : promptTokens),
    providerRequestId: id,
  };
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/timed out|timeout|abort/i.test(message)) return "provider_timeout";
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : null;
  if (status === 429) return "provider_rate_limited";
  return "provider_error";
}

export async function ledgerOpenAICall<R>(
  context: OpenAICallAccountingContext,
  call: () => Promise<R>,
): Promise<R> {
  const startedAt = Date.now();
  let response: R;
  try {
    response = await call();
  } catch (error) {
    await recordSafely(context, startedAt, EMPTY_USAGE, "error", error);
    throw error;
  }
  await recordSafely(context, startedAt, readOpenAIUsage(response), "success");
  return response;
}

async function recordSafely(
  context: OpenAICallAccountingContext,
  startedAt: number,
  usage: OpenAIUsageSnapshot,
  status: "success" | "error",
  error?: unknown,
): Promise<void> {
  const ambient = getAITelemetryContext();
  try {
    await recordDurableAIUsage({
      feature: context.feature as AITelemetryFeature,
      endpoint: context.endpoint,
      shop_id: context.shopId === undefined ? (ambient?.shopId ?? null) : context.shopId,
      user_id: context.userId === undefined ? (ambient?.userId ?? null) : context.userId,
      provider: "openai",
      model: context.model,
      modality: context.modality ?? "text",
      latency_ms: Date.now() - startedAt,
      prompt_tokens: usage.promptTokens,
      cached_prompt_tokens: usage.cachedPromptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      speech_characters: context.speechCharacters ?? null,
      status,
      error_code: status === "error" ? errorCode(error) : null,
      error_message:
        status === "error"
          ? (error instanceof Error ? error.message : "unknown_error").slice(0, 200)
          : null,
      provider_request_id: usage.providerRequestId,
      operation: context.operation ?? null,
      source_product: context.sourceProduct,
    });
  } catch (accountingError) {
    console.error("[ai-provider-accounting] ledger write threw", {
      feature: context.feature,
      endpoint: context.endpoint,
      error:
        accountingError instanceof Error
          ? accountingError.message.slice(0, 200)
          : "unknown_error",
    });
  }
}
