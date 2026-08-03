import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/shared/lib/server/openai", () => ({
  isOpenAIConfigured: vi.fn(() => false),
  getOpenAIClient: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/openai-models", () => ({
  getOpenAIModelForPurpose: vi.fn(() => "gpt-test"),
  openAITemperatureParam: vi.fn(() => ({})),
}));

import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";

describe("runOpenAIStructuredJson", () => {
  it("returns fallback when OpenAI is disabled and requireAI=false", async () => {
    vi.mocked(isOpenAIConfigured).mockReturnValue(false);

    const result = await runOpenAIStructuredJson({
      purpose: "extraction",
      feature: "test",
      system: "system",
      user: { ok: true },
      schemaName: "Test",
      fallback: () => ({ ok: false }),
      requireAI: false,
    });

    expect(result.mode).toBe("fallback");
    expect(result.output).toEqual({ ok: false });
  });

  it("throws when OpenAI is disabled and requireAI=true", async () => {
    vi.mocked(isOpenAIConfigured).mockReturnValue(false);

    await expect(
      runOpenAIStructuredJson({
        purpose: "extraction",
        feature: "test",
        system: "system",
        user: { ok: true },
        schemaName: "Test",
        fallback: () => ({ ok: false }),
        requireAI: true,
      }),
    ).rejects.toThrow(/AI is required/);
  });

  it("parses valid JSON", async () => {
    vi.mocked(isOpenAIConfigured).mockReturnValue(true);
    vi.mocked(getOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn(async () => ({ output_text: '{"value":123}' })),
      },
    } as never);

    const result = await runOpenAIStructuredJson({
      purpose: "extraction",
      feature: "test",
      system: "system",
      user: { ok: true },
      schemaName: "Test",
      fallback: () => ({ value: 0 }),
    });

    expect(result.mode).toBe("ai");
    expect(result.output).toEqual({ value: 123 });
  });

  it("falls back on invalid JSON", async () => {
    vi.mocked(isOpenAIConfigured).mockReturnValue(true);
    vi.mocked(getOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn(async () => ({ output_text: "not-json" })),
      },
    } as never);

    const result = await runOpenAIStructuredJson({
      purpose: "extraction",
      feature: "test",
      system: "system",
      user: { ok: true },
      schemaName: "Test",
      fallback: () => ({ value: 0 }),
      requireAI: false,
    });

    expect(result.mode).toBe("fallback");
    expect(result.output).toEqual({ value: 0 });
  });
});
