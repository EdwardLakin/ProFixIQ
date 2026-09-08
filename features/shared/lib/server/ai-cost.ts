import "server-only";

export const AI_RATE_CARD_VERSION = "openai-2026-09-08-v1";

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

export function estimateOpenAITextCostUsd(
  input: OpenAITextCostInput,
): number | null {
  const rate = getOpenAITextModelRate(input.model);
  if (!rate) return null;

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
