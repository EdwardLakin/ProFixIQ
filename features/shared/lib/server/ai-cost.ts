import "server-only";

export const AI_RATE_CARD_VERSION = "openai-2026-10-02-v2";

export type OpenAITextCostInput = {
  model: string | null;
  promptTokens: number | null;
  cachedPromptTokens?: number | null;
  completionTokens: number | null;
};

type TextModelRate = {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

const OPENAI_TEXT_MODEL_RATES: Array<{
  matches: (model: string) => boolean;
  rate: TextModelRate;
}> = [
  {
    matches: (model) => model === "gpt-5.5" || model.startsWith("gpt-5.5-"),
    rate: {
      inputPerMillionUsd: 5,
      cachedInputPerMillionUsd: 0.5,
      outputPerMillionUsd: 30,
    },
  },
  {
    matches: (model) =>
      model === "gpt-5.4-mini" || model.startsWith("gpt-5.4-mini-"),
    rate: {
      inputPerMillionUsd: 0.75,
      cachedInputPerMillionUsd: 0.075,
      outputPerMillionUsd: 4.5,
    },
  },
];

export function getOpenAITextModelRate(model: string | null): TextModelRate | null {
  const normalized = model?.trim().toLowerCase();
  if (!normalized) return null;
  return OPENAI_TEXT_MODEL_RATES.find((entry) => entry.matches(normalized))?.rate ?? null;
}

export function estimateMaxOpenAITextCostUsd(input: {
  model: string | null;
  maxPromptTokens: number;
  maxCompletionTokens: number;
}): number | null {
  const rate = getOpenAITextModelRate(input.model);
  if (!rate) return null;

  const promptTokens = Math.max(0, Math.ceil(input.maxPromptTokens));
  const completionTokens = Math.max(0, Math.ceil(input.maxCompletionTokens));

  return Number(
    (
      (promptTokens / 1_000_000) * rate.inputPerMillionUsd +
      (completionTokens / 1_000_000) * rate.outputPerMillionUsd
    ).toFixed(8),
  );
}

export function estimateOpenAITextCostUsd(
  input: OpenAITextCostInput,
): number | null {
  const rate = getOpenAITextModelRate(input.model);
  if (!rate) return null;

  // A provider error can occur after billable work but before usage is returned.
  // Do not turn missing usage into a false $0 accounting record.
  if (input.promptTokens == null && input.completionTokens == null) return null;
  if (input.promptTokens == null && input.cachedPromptTokens != null) return null;

  const promptTokens = Math.max(input.promptTokens ?? 0, 0);
  const cachedPromptTokens = Math.min(
    promptTokens,
    Math.max(input.cachedPromptTokens ?? 0, 0),
  );
  const uncachedPromptTokens = promptTokens - cachedPromptTokens;
  const completionTokens = Math.max(input.completionTokens ?? 0, 0);

  return Number(
    (
      (uncachedPromptTokens / 1_000_000) * rate.inputPerMillionUsd +
      (cachedPromptTokens / 1_000_000) * rate.cachedInputPerMillionUsd +
      (completionTokens / 1_000_000) * rate.outputPerMillionUsd
    ).toFixed(8),
  );
}

/**
 * Character-priced legacy TTS can be rated exactly from the request length.
 * gpt-4o-mini-tts is token-priced, so callers must persist raw usage and leave
 * cost null unless the provider exposes billable token counts.
 */
export function estimateOpenAISpeechCostUsd(
  model: string | null,
  characterCount: number,
): number | null {
  const normalized = model?.trim().toLowerCase();
  if (normalized !== "tts-1" && !normalized?.startsWith("tts-1-")) return null;
  return Number(((Math.max(characterCount, 0) / 1_000_000) * 15).toFixed(8));
}


type LiveModelRate = {
  perMinuteUsd: number;
};

const OPENAI_LIVE_MODEL_RATES: Array<{
  matches: (model: string) => boolean;
  rate: LiveModelRate;
}> = [
  {
    matches: (model) => model === "gpt-live-1" || model.startsWith("gpt-live-1-"),
    rate: { perMinuteUsd: 0.05 },
  },
];

export function getOpenAILiveModelRate(
  model: string | null,
): LiveModelRate | null {
  const normalized = model?.trim().toLowerCase();
  if (!normalized) return null;
  return (
    OPENAI_LIVE_MODEL_RATES.find((entry) => entry.matches(normalized))?.rate ??
    null
  );
}

/**
 * GPT-Live is duration-priced and billed per second. The API reports cumulative
 * session duration in seconds, including silence and time spent waiting on the
 * delegated backend.
 */
export function estimateOpenAILiveCostUsd(
  model: string | null,
  durationSeconds: number,
): number | null {
  const rate = getOpenAILiveModelRate(model);
  if (!rate) return null;
  const seconds = Math.max(0, durationSeconds);
  return Number(((seconds / 60) * rate.perMinuteUsd).toFixed(8));
}
