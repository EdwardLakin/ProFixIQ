import "server-only";

export const AI_RATE_CARD_VERSION = "openai-2026-09-08-v1";

export type AITextUsage = {
  promptTokens: number | null;
  cachedPromptTokens?: number | null;
  completionTokens: number | null;
  totalTokens?: number | null;
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
    rate: { inputPerMillionUsd: 5, cachedInputPerMillionUsd: 0.5, outputPerMillionUsd: 30 },
  },
  {
    matches: (model) => model === "gpt-5.4-mini" || model.startsWith("gpt-5.4-mini-"),
    rate: { inputPerMillionUsd: 0.75, cachedInputPerMillionUsd: 0.075, outputPerMillionUsd: 4.5 },
  },
];

export function getOpenAITextModelRate(model: string | null): TextModelRate | null {
  const normalized = model?.trim().toLowerCase();
  if (!normalized) return null;
  return OPENAI_TEXT_MODEL_RATES.find((entry) => entry.matches(normalized))?.rate ?? null;
}

export function estimateOpenAITextCostUsd(
  model: string | null,
  usage: AITextUsage,
): number | null {
  const rate = getOpenAITextModelRate(model);
  if (!rate) return null;

  const promptTokens = Math.max(usage.promptTokens ?? 0, 0);
  const cachedPromptTokens = Math.min(promptTokens, Math.max(usage.cachedPromptTokens ?? 0, 0));
  const uncachedPromptTokens = promptTokens - cachedPromptTokens;
  const completionTokens = Math.max(usage.completionTokens ?? 0, 0);

  return Number((
    (uncachedPromptTokens / 1_000_000) * rate.inputPerMillionUsd +
    (cachedPromptTokens / 1_000_000) * rate.cachedInputPerMillionUsd +
    (completionTokens / 1_000_000) * rate.outputPerMillionUsd
  ).toFixed(8));
}

export function estimateOpenAISpeechCostUsd(characterCount: number): number {
  return Number(((Math.max(characterCount, 0) / 1_000_000) * 15).toFixed(8));
}
