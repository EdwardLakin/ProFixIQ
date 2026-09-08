import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * supabase-js resolves `.rpc()` to a PostgrestFilterBuilder: a PromiseLike with
 * `then()` and NO `catch()`. Mocking it with a real Promise hides the bug this
 * suite exists to catch, so the mock below is deliberately then-only.
 */
function thenableRpcResult<T>(value: T): PromiseLike<T> {
  return {
    then(onfulfilled, onrejected) {
      return Promise.resolve(value).then(onfulfilled, onrejected);
    },
  };
}

const supabase = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => supabase,
}));

import { recordDurableAIUsage } from "@/features/shared/lib/server/ai-telemetry";

const event = {
  feature: "dtc_suggest" as const,
  endpoint: "/api/work-orders/dtc-suggest",
  shop_id: "shop-1",
  user_id: "user-1",
  model: "gpt-5.5",
  latency_ms: 10,
  prompt_tokens: 100,
  completion_tokens: 20,
  total_tokens: 120,
  status: "success" as const,
  error_code: null,
  error_message: null,
};

describe("recordDurableAIUsage against a PromiseLike rpc builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("persists when the client returns a then-only builder", async () => {
    supabase.rpc.mockReturnValueOnce(
      thenableRpcResult({ data: "ledger-row-id", error: null }),
    );

    const result = await recordDurableAIUsage(event);

    // Attaching .catch() directly to the builder throws TypeError before the
    // request is issued; the outer catch would swallow it and report false.
    expect(result.persisted).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_ai_usage_ledger",
      expect.objectContaining({ p_shop_id: "shop-1", p_user_id: "user-1" }),
    );
  });

  it("reports a denied write without throwing", async () => {
    supabase.rpc.mockReturnValueOnce(
      thenableRpcResult({ data: null, error: { message: "denied", code: "42501" } }),
    );

    await expect(recordDurableAIUsage(event)).resolves.toMatchObject({
      persisted: false,
    });
  });

  it("survives a builder that rejects", async () => {
    supabase.rpc.mockReturnValueOnce({
      then: (_: unknown, onrejected: (reason: unknown) => unknown) =>
        Promise.resolve().then(() => onrejected(new Error("network down"))),
    } as PromiseLike<never>);

    await expect(recordDurableAIUsage(event)).resolves.toMatchObject({
      persisted: false,
    });
  });
});

describe("durable cost by modality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("leaves image cost unknown rather than persisting a non-dimension-aware proxy", async () => {
    supabase.rpc.mockReturnValueOnce(thenableRpcResult({ data: "id", error: null }));

    const result = await recordDurableAIUsage({
      ...event,
      feature: "branding_generate_logo",
      endpoint: "/api/branding/generate",
      modality: "image",
      model: "gpt-image-1.5",
      estimated_cost_usd: 0.42,
    });

    expect(result.estimatedCostUsd).toBeNull();
    const payload = supabase.rpc.mock.calls[0][1].p_payload as Record<string, unknown>;
    expect(payload.estimated_cost_usd).toBeNull();
    // Raw usage is still recorded so a rate card can price it retroactively.
    expect(payload.total_tokens).toBe(120);
  });
});
