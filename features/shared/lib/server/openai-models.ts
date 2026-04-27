import "server-only";

import { isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import {
  resolveOnboardingAgentModel,
  resolveOpenAIEmbeddingModel,
  resolveOpenAIExtractionModel,
  resolveOpenAIFastModel,
  resolveOpenAIModelForPurpose,
  resolveOpenAIReasoningModel,
  type OpenAIModelPurpose,
} from "@/features/shared/lib/openai-models";

function env(name: string): string | undefined {
  return process.env[name];
}

export type { OpenAIModelPurpose };

export function getOpenAIReasoningModel(): string {
  return resolveOpenAIReasoningModel(env);
}

export function getOpenAIFastModel(): string {
  return resolveOpenAIFastModel(env);
}

export function getOpenAIExtractionModel(): string {
  return resolveOpenAIExtractionModel(env);
}

export function getOpenAIEmbeddingModel(): string {
  return resolveOpenAIEmbeddingModel(env);
}

export function getOnboardingAgentModel(): string {
  return resolveOnboardingAgentModel(env);
}

export function getOpenAIModelForPurpose(purpose: OpenAIModelPurpose): string {
  return resolveOpenAIModelForPurpose(purpose, env);
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
