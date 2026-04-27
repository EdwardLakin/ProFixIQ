import "server-only";

import { isOpenAIConfigured } from "@/features/shared/lib/server/openai";

export type OpenAIModelPurpose =
  | "reasoning"
  | "fast"
  | "extraction"
  | "embedding"
  | "vision"
  | "onboarding";

const DEFAULT_REASONING_MODEL = "gpt-5.5";
const DEFAULT_FAST_MODEL = "gpt-5.4-mini";
const DEFAULT_EXTRACTION_MODEL = "gpt-5.5";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_VISION_MODEL = "gpt-5.5";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getOpenAIReasoningModel(): string {
  return env("OPENAI_REASONING_MODEL") ?? env("OPENAI_MODEL") ?? DEFAULT_REASONING_MODEL;
}

export function getOpenAIFastModel(): string {
  return env("OPENAI_FAST_MODEL") ?? env("OPENAI_MODEL") ?? DEFAULT_FAST_MODEL;
}

export function getOpenAIExtractionModel(): string {
  return env("OPENAI_EXTRACTION_MODEL") ?? env("OPENAI_REASONING_MODEL") ?? env("OPENAI_MODEL") ?? DEFAULT_EXTRACTION_MODEL;
}

export function getOpenAIEmbeddingModel(): string {
  return env("OPENAI_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
}

export function getOnboardingAgentModel(): string {
  return env("ONBOARDING_AGENT_MODEL")
    ?? env("OPENAI_EXTRACTION_MODEL")
    ?? env("OPENAI_REASONING_MODEL")
    ?? env("OPENAI_MODEL")
    ?? DEFAULT_REASONING_MODEL;
}

export function getOpenAIModelForPurpose(purpose: OpenAIModelPurpose): string {
  switch (purpose) {
    case "reasoning":
      return getOpenAIReasoningModel();
    case "fast":
      return getOpenAIFastModel();
    case "extraction":
      return getOpenAIExtractionModel();
    case "embedding":
      return getOpenAIEmbeddingModel();
    case "vision":
      return env("OPENAI_VISION_MODEL") ?? getOpenAIExtractionModel() ?? DEFAULT_VISION_MODEL;
    case "onboarding":
      return getOnboardingAgentModel();
    default:
      return getOpenAIReasoningModel();
  }
}

export function getOpenAIModelDiagnostics() {
  return {
    reasoningModel: getOpenAIReasoningModel(),
    fastModel: getOpenAIFastModel(),
    extractionModel: getOpenAIExtractionModel(),
    embeddingModel: getOpenAIEmbeddingModel(),
    onboardingModel: getOnboardingAgentModel(),
    openAIConfigured: isOpenAIConfigured(),
  };
}
