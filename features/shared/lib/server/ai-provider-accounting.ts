import "server-only";

import {
  AIBudgetDeniedError,
  AIBudgetReplayError,
} from "@/features/shared/lib/server/ai-budget";
import { governAICall } from "@/features/shared/lib/server/ai-governance";
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
  /** Token ceilings that size the budget hold. Defaults come from the AI policy. */
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
  /** Override the budget hold in USD. */
  budgetAmountUsd?: number;
  /** Skip budget governance for this call (the usage ledger row is still written). */
  skipGovernance?: boolean;
};

export { readOpenAIUsage, type OpenAIUsageSnapshot } from "@/features/shared/lib/server/ai-usage-reader";
import {
  readOpenAIUsage,
  type OpenAIUsageSnapshot,
} from "@/features/shared/lib/server/ai-usage-reader";

const EMPTY_USAGE: OpenAIUsageSnapshot = {
  promptTokens: null,
  cachedPromptTokens: null,
  completionTokens: null,
  totalTokens: null,
  providerRequestId: null,
};

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
    response = context.skipGovernance
      ? await call()
      : await governAICall(
          {
            feature: context.feature,
            endpoint: context.endpoint,
            shopId: context.shopId,
            userId: context.userId,
            model: context.model,
            // The ledger records embeddings as modality "other".
            modality:
              context.modality === "image"
                ? "image"
                : context.modality === "speech"
                  ? "speech"
                  : context.modality === "other"
                    ? "embedding"
                    : "text",
            amountUsd: context.budgetAmountUsd,
            maxPromptTokens: context.maxPromptTokens,
            maxCompletionTokens: context.maxCompletionTokens,
          },
          call,
        );
  } catch (error) {
    // A denied or replayed call never reached the provider: it is already
    // recorded as a reservation, and is not provider activity for the ledger.
    if (error instanceof AIBudgetDeniedError || error instanceof AIBudgetReplayError) throw error;
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
