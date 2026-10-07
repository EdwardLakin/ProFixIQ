import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const createAdminSupabase = vi.fn();
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => createAdminSupabase(),
}));

import { AIBudgetDeniedError } from "@/features/shared/lib/server/ai-budget";
import {
  actualAICostUsd,
  aiBudgetDeniedBody,
  estimateAIGovernanceHoldUsd,
  governAICall,
  isAIBudgetDenied,
} from "@/features/shared/lib/server/ai-governance";
import { withAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";

const reserved = (over: Record<string, unknown> = {}) => ({
  data: [
    {
      decision: "shadow_allowed",
      denial_reason: null,
      reservation_id: "res-1",
      available_usd: 0,
      pool_remaining_usd: null,
      replayed: false,
      ...over,
    },
  ],
  error: null,
});
const settled = { data: [{ settled: true, status: "committed" }], error: null };

const ctx = {
  feature: "work_order_documentation_rewrite",
  endpoint: "/api/x",
  shopId: "shop-1",
  userId: "user-1",
  model: "gpt-5.5",
};
const response = {
  id: "resp",
  usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
};

beforeEach(() => {
  rpc.mockReset();
  createAdminSupabase.mockReset();
  createAdminSupabase.mockReturnValue({ rpc });
  delete process.env.AI_BUDGET_GOVERNANCE;
  delete process.env.AI_GOVERNANCE_FAIL_CLOSED;
});

describe("governAICall: when governance does not apply", () => {
  it("runs a call with no shop untouched", async () => {
    const call = vi.fn(async () => response);
    await expect(governAICall({ ...ctx, shopId: null }, call)).resolves.toBe(response);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is switched off by AI_BUDGET_GOVERNANCE=off", async () => {
    process.env.AI_BUDGET_GOVERNANCE = "off";
    await governAICall(ctx, async () => response);
    expect(createAdminSupabase).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("inherits the ambient shop when none is given", async () => {
    rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce(settled);
    const { shopId: _s, ...noShop } = ctx;
    void _s;
    await withAITelemetryContext({ endpoint: "/e", shopId: "ambient-shop", userId: "u" }, () =>
      governAICall(noShop, async () => response),
    );
    expect(rpc).toHaveBeenCalledWith("reserve_ai_budget", expect.objectContaining({ p_shop_id: "ambient-shop" }));
  });
});

describe("governAICall: reserve, run, settle", () => {
  it("reserves, runs the call, and commits the real priced cost", async () => {
    rpc.mockResolvedValueOnce(reserved({ decision: "allowed" })).mockResolvedValueOnce(settled);
    await expect(governAICall(ctx, async () => response)).resolves.toBe(response);

    expect(rpc.mock.calls[0][0]).toBe("reserve_ai_budget");
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_shop_id: "shop-1", p_pool: "documentation" });
    // gpt-5.5: 1000 in * $5/M + 500 out * $30/M = $0.02
    expect(rpc).toHaveBeenLastCalledWith("commit_ai_budget", {
      p_reservation_id: "res-1",
      p_shop_id: "shop-1",
      p_actual_usd: 0.02,
    });
  });

  it("commits unknown cost (hold kept) when the model has no rate card", async () => {
    rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce(settled);
    await governAICall({ ...ctx, model: "mystery-model" }, async () => response);
    expect(rpc).toHaveBeenLastCalledWith("commit_ai_budget", expect.objectContaining({ p_actual_usd: null }));
  });

  it("uses a caller-supplied cost function for non-provider results", async () => {
    rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce(settled);
    await governAICall(ctx, async () => ({ tokens: 9 }), { actualCostUsd: () => 0.5 });
    expect(rpc).toHaveBeenLastCalledWith("commit_ai_budget", expect.objectContaining({ p_actual_usd: 0.5 }));
  });

  it("does not block a shadow shop that would be denied, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc
      .mockResolvedValueOnce(reserved({ denial_reason: "insufficient_balance" }))
      .mockResolvedValueOnce(settled);
    const call = vi.fn(async () => response);
    await expect(governAICall(ctx, call)).resolves.toBe(response);
    expect(call).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.some(([line]) => String(line).includes("ai_budget_shadow_would_deny"))).toBe(true);
    warn.mockRestore();
  });
});

describe("governAICall: denial", () => {
  it("throws before the provider call when an enforcing shop is out of budget", async () => {
    rpc.mockResolvedValueOnce(reserved({ decision: "denied", denial_reason: "insufficient_balance" }));
    const call = vi.fn();
    await expect(governAICall(ctx, call)).rejects.toSatisfy(isAIBudgetDenied);
    expect(call).not.toHaveBeenCalled();
  });

  it("builds a stable 402 body that does not leak balances", () => {
    const body = aiBudgetDeniedBody(new AIBudgetDeniedError("pool_cap_exceeded", 12.5, 0));
    expect(body).toEqual({
      error: "This shop has reached its AI limit for this feature.",
      code: "ai_budget_exceeded",
      reason: "pool_cap_exceeded",
    });
    expect(JSON.stringify(body)).not.toContain("12.5");
  });
});

describe("governAICall: provider errors", () => {
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "releases the hold and re-throws the original error on a %s (nothing was billed)",
    async (status) => {
      rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce({ data: [{ settled: true }], error: null });
      const failure = Object.assign(new Error("rejected"), { status });
      await expect(
        governAICall(ctx, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(rpc).toHaveBeenLastCalledWith("release_ai_budget", { p_reservation_id: "res-1", p_shop_id: "shop-1" });
    },
  );

  it.each([500, 502, 503, null])(
    "keeps the hold (commits unknown cost) on status %s, because the provider may have billed",
    async (status) => {
      rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce(settled);
      const failure = Object.assign(new Error("boom"), status == null ? {} : { status });
      await expect(
        governAICall(ctx, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(rpc).toHaveBeenLastCalledWith("commit_ai_budget", expect.objectContaining({ p_actual_usd: null }));
    },
  );
});

describe("governAICall: governance infrastructure failures", () => {
  it("runs the call ungoverned when the budget service is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    const call = vi.fn(async () => response);
    await expect(governAICall(ctx, call)).resolves.toBe(response);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("runs the call ungoverned when the admin client cannot be built", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAdminSupabase.mockImplementation(() => {
      throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
    });
    const call = vi.fn(async () => response);
    await expect(governAICall(ctx, call)).resolves.toBe(response);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("refuses the call in both cases when AI_GOVERNANCE_FAIL_CLOSED is set", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.AI_GOVERNANCE_FAIL_CLOSED = "1";
    const call = vi.fn(async () => response);

    rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    await expect(governAICall(ctx, call)).rejects.toMatchObject({ name: "AIBudgetUnavailableError" });

    createAdminSupabase.mockImplementation(() => {
      throw new Error("no key");
    });
    await expect(governAICall(ctx, call)).rejects.toMatchObject({ name: "AIBudgetUnavailableError" });
    expect(call).not.toHaveBeenCalled();
  });
});

describe("hold sizing and settlement cost", () => {
  it("sizes a text hold from the model rate and the policy's token ceiling", () => {
    // work_order_documentation_rewrite policy maxTokens = 700: 8000 in + 700 out on gpt-5.5
    expect(estimateAIGovernanceHoldUsd(ctx)).toBeCloseTo((8000 * 5 + 700 * 30) / 1_000_000, 6);
  });

  it("holds more input for vision and document features", () => {
    const text = estimateAIGovernanceHoldUsd({ ...ctx, feature: "inspection_template_generate" });
    const vision = estimateAIGovernanceHoldUsd({ ...ctx, feature: "inspection_form_import_page" });
    expect(vision).toBeGreaterThan(text);
  });

  it("holds a fixed amount for unpriced models, images and embeddings", () => {
    expect(estimateAIGovernanceHoldUsd({ ...ctx, model: "mystery" })).toBe(0.25);
    expect(estimateAIGovernanceHoldUsd({ ...ctx, modality: "image" })).toBe(0.25);
    expect(estimateAIGovernanceHoldUsd({ ...ctx, modality: "embedding" })).toBe(0.01);
    expect(estimateAIGovernanceHoldUsd({ ...ctx, amountUsd: 3 })).toBe(3);
  });

  it("prices embeddings and leaves images and unknown usage unpriced", () => {
    const emb = { usage: { prompt_tokens: 1_000_000, total_tokens: 1_000_000 } };
    expect(actualAICostUsd({ model: "text-embedding-3-small", modality: "embedding" }, emb)).toBe(0.02);
    expect(actualAICostUsd({ model: "gpt-image-1.5", modality: "image" }, { usage: { total_tokens: 5 } })).toBeNull();
    expect(actualAICostUsd({ model: "gpt-5.5", modality: "text" }, { id: "no-usage" })).toBeNull();
  });
});
