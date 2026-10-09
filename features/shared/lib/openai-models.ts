export type OpenAIModelPurpose =
  | "reasoning"
  | "fast"
  | "extraction"
  | "embedding"
  | "vision";

export type OpenAIModelEnv = Partial<Record<
  | "OPENAI_MODEL"
  | "OPENAI_REASONING_MODEL"
  | "OPENAI_FAST_MODEL"
  | "OPENAI_EXTRACTION_MODEL"
  | "OPENAI_EMBEDDING_MODEL"
  | "OPENAI_VISION_MODEL",
  string | undefined
>>;

export const DEFAULT_OPENAI_MODELS: Record<OpenAIModelPurpose, string> = {
  reasoning: "gpt-5.5",
  fast: "gpt-5.4-mini",
  extraction: "gpt-5.5",
  embedding: "text-embedding-3-small",
  vision: "gpt-5.5",
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveOpenAIModel(purpose: OpenAIModelPurpose, env: OpenAIModelEnv = {}): string {
  const globalModel = clean(env.OPENAI_MODEL);

  if (purpose === "reasoning") {
    return clean(env.OPENAI_REASONING_MODEL) ?? globalModel ?? DEFAULT_OPENAI_MODELS.reasoning;
  }

  if (purpose === "fast") {
    return clean(env.OPENAI_FAST_MODEL) ?? globalModel ?? DEFAULT_OPENAI_MODELS.fast;
  }

  if (purpose === "extraction") {
    return clean(env.OPENAI_EXTRACTION_MODEL)
      ?? clean(env.OPENAI_REASONING_MODEL)
      ?? globalModel
      ?? DEFAULT_OPENAI_MODELS.extraction;
  }

  if (purpose === "embedding") {
    return clean(env.OPENAI_EMBEDDING_MODEL) ?? DEFAULT_OPENAI_MODELS.embedding;
  }

  if (purpose === "vision") {
    return clean(env.OPENAI_VISION_MODEL)
      ?? clean(env.OPENAI_REASONING_MODEL)
      ?? globalModel
      ?? DEFAULT_OPENAI_MODELS.vision;
  }

  return globalModel ?? DEFAULT_OPENAI_MODELS.reasoning;
}


export function getOpenAIModelForPurpose(
  purpose: OpenAIModelPurpose,
  env: OpenAIModelEnv = {},
): string {
  return resolveOpenAIModel(purpose, env);
}

export function supportsOpenAITemperature(model: string): boolean {
  const normalized = model.trim().toLowerCase();

  if (!normalized) return true;

  return !(
    normalized.startsWith("gpt-5") ||
    normalized.includes("reasoning") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

/**
 * GPT-5 reasoning models spend completion tokens on hidden reasoning before
 * they write any output, so structured-output calls should ask for low effort.
 * Covers the GPT-5 family and the o3/o4 models, which take low/medium/high.
 * Models that do not take the parameter (o1-mini/preview, non-reasoning chat
 * models) get nothing.
 */
export function openAIReasoningEffortParam(
  model: string,
  effort: "low" | "medium" | "high" = "low",
): { reasoning_effort: "low" | "medium" | "high" } | Record<string, never> {
  const normalized = model.trim().toLowerCase();
  const supportsEffort =
    (normalized.startsWith("gpt-5") && !normalized.includes("chat")) ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4");
  return supportsEffort ? { reasoning_effort: effort } : {};
}

export function openAITemperatureParam(
  model: string,
  temperature: number,
): { temperature: number } | Record<string, never> {
  return supportsOpenAITemperature(model) ? { temperature } : {};
}
