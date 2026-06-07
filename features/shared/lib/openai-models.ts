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
  fast: "gpt-5.5",
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
