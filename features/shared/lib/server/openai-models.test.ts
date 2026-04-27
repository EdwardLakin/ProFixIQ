import { afterEach, describe, expect, it } from "vitest";
import {
  getOnboardingAgentModel,
  getOpenAIEmbeddingModel,
  getOpenAIExtractionModel,
  getOpenAIFastModel,
  getOpenAIReasoningModel,
} from "@/features/shared/lib/server/openai-models";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("openai-models precedence", () => {
  it("prefers purpose-specific env before OPENAI_MODEL", () => {
    process.env.OPENAI_MODEL = "gpt-global";
    process.env.OPENAI_REASONING_MODEL = "gpt-reasoning";
    process.env.OPENAI_FAST_MODEL = "gpt-fast";
    process.env.OPENAI_EXTRACTION_MODEL = "gpt-extract";
    process.env.OPENAI_EMBEDDING_MODEL = "text-embedding-custom";
    process.env.ONBOARDING_AGENT_MODEL = "gpt-onboarding";

    expect(getOpenAIReasoningModel()).toBe("gpt-reasoning");
    expect(getOpenAIFastModel()).toBe("gpt-fast");
    expect(getOpenAIExtractionModel()).toBe("gpt-extract");
    expect(getOpenAIEmbeddingModel()).toBe("text-embedding-custom");
    expect(getOnboardingAgentModel()).toBe("gpt-onboarding");
  });

  it("falls back through global model and defaults", () => {
    delete process.env.OPENAI_REASONING_MODEL;
    delete process.env.OPENAI_FAST_MODEL;
    delete process.env.OPENAI_EXTRACTION_MODEL;
    delete process.env.OPENAI_EMBEDDING_MODEL;
    delete process.env.ONBOARDING_AGENT_MODEL;
    process.env.OPENAI_MODEL = "gpt-global";

    expect(getOpenAIReasoningModel()).toBe("gpt-global");
    expect(getOpenAIFastModel()).toBe("gpt-global");
    expect(getOpenAIExtractionModel()).toBe("gpt-global");
    expect(getOpenAIEmbeddingModel()).toBe("text-embedding-3-small");
    expect(getOnboardingAgentModel()).toBe("gpt-global");
  });
});
