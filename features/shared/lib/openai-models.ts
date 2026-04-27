export type OpenAIModelPurpose =
  | "reasoning"
  | "fast"
  | "extraction"
  | "embedding"
  | "vision"
  | "onboarding";

export const DEFAULT_REASONING_MODEL = "gpt-5.5";
export const DEFAULT_FAST_MODEL = "gpt-5.4-mini";
export const DEFAULT_EXTRACTION_MODEL = "gpt-5.5";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_VISION_MODEL = "gpt-5.5";

export type OpenAIModelEnvReader = (name: string) => string | undefined;

function fromEnv(readEnv: OpenAIModelEnvReader, name: string): string | undefined {
  const value = readEnv(name)?.trim();
  return value ? value : undefined;
}

export function resolveOpenAIReasoningModel(readEnv: OpenAIModelEnvReader): string {
  return fromEnv(readEnv, "OPENAI_REASONING_MODEL")
    ?? fromEnv(readEnv, "OPENAI_MODEL")
    ?? DEFAULT_REASONING_MODEL;
}

export function resolveOpenAIFastModel(readEnv: OpenAIModelEnvReader): string {
  return fromEnv(readEnv, "OPENAI_FAST_MODEL")
    ?? fromEnv(readEnv, "OPENAI_MODEL")
    ?? DEFAULT_FAST_MODEL;
}

export function resolveOpenAIExtractionModel(readEnv: OpenAIModelEnvReader): string {
  return fromEnv(readEnv, "OPENAI_EXTRACTION_MODEL")
    ?? fromEnv(readEnv, "OPENAI_REASONING_MODEL")
    ?? fromEnv(readEnv, "OPENAI_MODEL")
    ?? DEFAULT_EXTRACTION_MODEL;
}

export function resolveOpenAIEmbeddingModel(readEnv: OpenAIModelEnvReader): string {
  return fromEnv(readEnv, "OPENAI_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
}

export function resolveOnboardingAgentModel(readEnv: OpenAIModelEnvReader): string {
  return fromEnv(readEnv, "ONBOARDING_AGENT_MODEL")
    ?? fromEnv(readEnv, "OPENAI_EXTRACTION_MODEL")
    ?? fromEnv(readEnv, "OPENAI_REASONING_MODEL")
    ?? fromEnv(readEnv, "OPENAI_MODEL")
    ?? DEFAULT_REASONING_MODEL;
}

export function resolveOpenAIModelForPurpose(
  purpose: OpenAIModelPurpose,
  readEnv: OpenAIModelEnvReader,
): string {
  switch (purpose) {
    case "reasoning":
      return resolveOpenAIReasoningModel(readEnv);
    case "fast":
      return resolveOpenAIFastModel(readEnv);
    case "extraction":
      return resolveOpenAIExtractionModel(readEnv);
    case "embedding":
      return resolveOpenAIEmbeddingModel(readEnv);
    case "vision":
      return fromEnv(readEnv, "OPENAI_VISION_MODEL")
        ?? resolveOpenAIExtractionModel(readEnv)
        ?? DEFAULT_VISION_MODEL;
    case "onboarding":
      return resolveOnboardingAgentModel(readEnv);
    default:
      return resolveOpenAIReasoningModel(readEnv);
  }
}
