import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: "ledger-id", error: null }));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ rpc }),
}));

import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";

describe("unknown AI model accounting", () => {
  it("persists unknown cost as null rather than a fabricated blended estimate", async () => {
    await recordAITelemetry({
      event_key: "unknown-model-test",
      feature: "technician_copilot_text",
      endpoint: "/test",
      shop_id: null,
      user_id: null,
      provider: "openai",
      model: "future-model",
      modality: "text",
      latency_ms: 1,
      prompt_tokens: 100,
      cached_prompt_tokens: 0,
      completion_tokens: 10,
      total_tokens: 110,
      status: "success",
      error_code: null,
      error_message: null,
      provider_request_id: null,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ p_estimated_cost_usd: null }),
    );
  });
});
