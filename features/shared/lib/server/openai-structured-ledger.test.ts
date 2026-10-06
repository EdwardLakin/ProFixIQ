import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const recordDurableAIUsage = vi.fn();
vi.mock("@/features/shared/lib/server/ai-telemetry", () => ({
  recordDurableAIUsage: (event: unknown) => recordDurableAIUsage(event),
}));
vi.mock("@/features/shared/lib/server/openai", () => ({
  isOpenAIConfigured: vi.fn(() => true),
  getOpenAIClient: vi.fn(() => ({
    responses: {
      create: vi.fn(async () => ({
        id: "resp_1",
        output_text: '{"value":1}',
        usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
      })),
    },
  })),
}));
vi.mock("@/features/shared/lib/server/openai-models", () => ({
  getOpenAIModelForPurpose: vi.fn(() => "gpt-5.5"),
  openAITemperatureParam: vi.fn(() => ({})),
}));

import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";

const base = {
  purpose: "fast" as const,
  feature: "quote-history-insights",
  system: "system",
  user: {},
  schemaName: "Test",
  fallback: () => ({ value: 0 }),
};

beforeEach(() => {
  recordDurableAIUsage.mockReset();
  recordDurableAIUsage.mockResolvedValue({ persisted: true });
});

describe("runOpenAIStructuredJson ledgering", () => {
  it("attributes the call to the supplied shop and actor", async () => {
    await runOpenAIStructuredJson({
      ...base,
      telemetry: { endpoint: "/api/x", shopId: "shop-1", userId: "user-1" },
    });
    expect(recordDurableAIUsage).toHaveBeenCalledTimes(1);
    expect(recordDurableAIUsage.mock.calls[0][0]).toMatchObject({
      shop_id: "shop-1",
      user_id: "user-1",
      endpoint: "/api/x",
      status: "success",
      prompt_tokens: 10,
      total_tokens: 14,
      provider_request_id: "resp_1",
    });
  });

  it("still ledgers a contextless call, as unattributed spend", async () => {
    await runOpenAIStructuredJson(base);
    expect(recordDurableAIUsage.mock.calls[0][0]).toMatchObject({
      shop_id: null,
      user_id: null,
      endpoint: "unattributed:quote-history-insights",
      status: "success",
    });
  });
});
