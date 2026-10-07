import "server-only";

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
