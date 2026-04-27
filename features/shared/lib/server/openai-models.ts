import "server-only";

import {
  DEFAULT_OPENAI_MODELS,
  resolveOpenAIModel,
  type OpenAIModelEnv,
  type OpenAIModelPurpose,
} from "@/features/shared/lib/openai-models";

export { DEFAULT_OPENAI_MODELS, resolveOpenAIModel };
export type { OpenAIModelEnv, OpenAIModelPurpose };

function readOpenAIModelEnv(): OpenAIModelEnv {
  return {
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_REASONING_MODEL: process.env.OPENAI_REASONING_MODEL,
    OPENAI_FAST_MODEL: process.env.OPENAI_FAST_MODEL,
    OPENAI_EXTRACTION_MODEL: process.env.OPENAI_EXTRACTION_MODEL,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
    OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL,
    ONBOARDING_AGENT_MODEL: process.env.ONBOARDING_AGENT_MODEL,
  };
}

export function getOpenAIModelForPurpose(purpose: OpenAIModelPurpose): string {
  return resolveOpenAIModel(purpose, readOpenAIModelEnv());
}

export function getOpenAIModelDiagnostics() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    reasoning: getOpenAIModelForPurpose("reasoning"),
    fast: getOpenAIModelForPurpose("fast"),
    extraction: getOpenAIModelForPurpose("extraction"),
    embedding: getOpenAIModelForPurpose("embedding"),
    vision: getOpenAIModelForPurpose("vision"),
    onboarding: getOpenAIModelForPurpose("onboarding"),
  };
}


export function getOpenAIReasoningModel(): string {
  return getOpenAIModelForPurpose("reasoning");
}

export function getOpenAIFastModel(): string {
  return getOpenAIModelForPurpose("fast");
}

export function getOpenAIExtractionModel(): string {
  return getOpenAIModelForPurpose("extraction");
}

export function getOpenAIEmbeddingModel(): string {
  return getOpenAIModelForPurpose("embedding");
}

export function getOpenAIVisionModel(): string {
  return getOpenAIModelForPurpose("vision");
}

export function getOnboardingAgentModel(): string {
  return getOpenAIModelForPurpose("onboarding");
}
