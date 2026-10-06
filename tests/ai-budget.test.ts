import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AI_BUDGET_UNPRICED_RESERVATION_USD,
  AIBudgetDeniedError,
  AIBudgetUnavailableError,
  AIProviderNotCalledError,
  aiBudgetPoolForFeature,
  estimateAIBudgetReservationUsd,
  reserveAIBudget,
  withAIBudget,
} from "@/features/shared/lib/server/ai-budget";

type Rpc = ReturnType<typeof vi.fn>;

function fakeAdmin(rpc: Rpc) {
  return { rpc } as never;
}

const reserved = (over: Record<string, unknown> = {}) => ({
  data: [
    {
      decision: "allowed",
      denial_reason: null,
      reservation_id: "res-1",
      available_usd: "6.000000",
      pool_remaining_usd: null,
      replayed: false,
      ...over,
    },
  ],
  error: null,
});
const settled = { data: [{ settled: true, status: "committed" }], error: null };

const base = {
  shopId: "shop-1",
  feature: "technician_copilot_text",
  amountUsd: 0.5,
  idempotencyKey: "turn-1",
  onUnavailable: "deny" as const,
};

let rpc: Rpc;
beforeEach(() => {
  rpc = vi.fn();
});

describe("pools and estimates", () => {
  it("maps features to subpools and defaults to general", () => {
    expect(aiBudgetPoolForFeature("technician_copilot_text")).toBe("copilot");
    expect(aiBudgetPoolForFeature("inspection_voice_speech")).toBe("voice");
    expect(aiBudgetPoolForFeature("something_new")).toBe("general");
  });

  it("holds a fixed amount for unpriced models, and the real maximum otherwise", () => {
    expect(
      estimateAIBudgetReservationUsd({ model: "mystery-model", maxPromptTokens: 1000, maxCompletionTokens: 500 }),
    ).toBe(AI_BUDGET_UNPRICED_RESERVATION_USD);
    expect(
      estimateAIBudgetReservationUsd({ model: "gpt-5.5", maxPromptTokens: 1_000_000, maxCompletionTokens: 100_000 }),
    ).toBe(8);
  });
});

describe("reserveAIBudget", () => {
  it("returns the hold with numeric balances and the feature's pool", async () => {
    rpc.mockResolvedValue(reserved());
    const result = await reserveAIBudget({ admin: fakeAdmin(rpc), ...base });
    expect(result).toMatchObject({ reservationId: "res-1", decision: "allowed", wouldDeny: false, availableUsd: 6 });
    expect(rpc).toHaveBeenCalledWith(
      "reserve_ai_budget",
      expect.objectContaining({ p_pool: "copilot", p_idempotency_key: "turn-1", p_amount_usd: 0.5 }),
    );
  });

  it("flags a shadow hold that would have been denied, without blocking", async () => {
    rpc.mockResolvedValue(reserved({ decision: "shadow_allowed", denial_reason: "insufficient_balance" }));
    const result = await reserveAIBudget({ admin: fakeAdmin(rpc), ...base });
    expect(result).toMatchObject({ decision: "shadow_allowed", wouldDeny: true, reason: "insufficient_balance" });
  });

  it("throws a typed denial", async () => {
    rpc.mockResolvedValue(reserved({ decision: "denied", denial_reason: "pool_cap_exceeded", available_usd: 9, pool_remaining_usd: 0 }));
    await expect(reserveAIBudget({ admin: fakeAdmin(rpc), ...base })).rejects.toMatchObject({
      name: "AIBudgetDeniedError",
      reason: "pool_cap_exceeded",
      poolRemainingUsd: 0,
    });
  });

  it("treats an RPC error or empty result as unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883" } });
    await expect(reserveAIBudget({ admin: fakeAdmin(rpc), ...base })).rejects.toBeInstanceOf(AIBudgetUnavailableError);
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(reserveAIBudget({ admin: fakeAdmin(rpc), ...base })).rejects.toBeInstanceOf(AIBudgetUnavailableError);
  });

  it("will not run a call for a replayed released or denied key", async () => {
    rpc.mockResolvedValue(reserved({ decision: "released", replayed: true }));
    await expect(reserveAIBudget({ admin: fakeAdmin(rpc), ...base })).rejects.toBeInstanceOf(AIBudgetUnavailableError);
  });
});

describe("withAIBudget", () => {
  it("commits the actual cost after a successful call", async () => {
    rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce(settled);
    const out = await withAIBudget({ admin: fakeAdmin(rpc), ...base }, async () => ({ output: "ok", actualCostUsd: 0.12 }));
    expect(out).toBe("ok");
    expect(rpc).toHaveBeenLastCalledWith("commit_ai_budget", {
      p_reservation_id: "res-1",
      p_shop_id: "shop-1",
      p_actual_usd: 0.12,
    });
  });

  it("commits with unknown cost (reservation kept) when usage was not priced", async () => {
    rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce(settled);
    await withAIBudget({ admin: fakeAdmin(rpc), ...base }, async () => ({ output: 1, actualCostUsd: null }));
    expect(rpc).toHaveBeenLastCalledWith("commit_ai_budget", expect.objectContaining({ p_actual_usd: null }));
  });

  it("never runs the call when the budget denies it", async () => {
    rpc.mockResolvedValueOnce(reserved({ decision: "denied", denial_reason: "insufficient_balance" }));
    const operation = vi.fn();
    await expect(withAIBudget({ admin: fakeAdmin(rpc), ...base }, operation)).rejects.toBeInstanceOf(AIBudgetDeniedError);
    expect(operation).not.toHaveBeenCalled();
  });

  it("keeps the hold when the provider may have billed, and re-throws", async () => {
    rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce(settled);
    const failure = new Error("boom");
    await expect(
      withAIBudget({ admin: fakeAdmin(rpc), ...base }, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(rpc).toHaveBeenLastCalledWith("commit_ai_budget", expect.objectContaining({ p_actual_usd: null }));
  });

  it("releases the hold when the provider was never called", async () => {
    rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce({ data: [{ settled: true }], error: null });
    await expect(
      withAIBudget({ admin: fakeAdmin(rpc), ...base }, async () => {
        throw new AIProviderNotCalledError();
      }),
    ).rejects.toBeInstanceOf(AIProviderNotCalledError);
    expect(rpc).toHaveBeenLastCalledWith("release_ai_budget", { p_reservation_id: "res-1", p_shop_id: "shop-1" });
  });

  it("follows onUnavailable when the budget service is down", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    const operation = vi.fn(async () => ({ output: "ran", actualCostUsd: 0.01 }));

    await expect(withAIBudget({ admin: fakeAdmin(rpc), ...base, onUnavailable: "deny" }, operation)).rejects.toBeInstanceOf(
      AIBudgetUnavailableError,
    );
    expect(operation).not.toHaveBeenCalled();

    await expect(withAIBudget({ admin: fakeAdmin(rpc), ...base, onUnavailable: "allow" }, operation)).resolves.toBe("ran");
    expect(operation).toHaveBeenCalledWith(null);
    expect(rpc).toHaveBeenCalledTimes(2); // both reserve attempts; no commit without a hold
  });

  it("does not fail a successful call because settlement failed", async () => {
    rpc.mockResolvedValueOnce(reserved()).mockResolvedValueOnce({ data: null, error: { code: "57014" } });
    await expect(
      withAIBudget({ admin: fakeAdmin(rpc), ...base }, async () => ({ output: "done", actualCostUsd: 0.2 })),
    ).resolves.toBe("done");
  });
});
