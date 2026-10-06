import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ---- Copilot governed turn ---------------------------------------------------
const claimDurableAIRouteQuota = vi.fn();
const completeDurableAIRouteQuota = vi.fn();
const runTechnicianCopilotTurn = vi.fn();
vi.mock("@/features/shared/lib/server/durable-ai-guard", async () => {
  class DurableAIQuotaUnavailableError extends Error {
    constructor(readonly code: string, readonly deterministic: boolean) {
      super(`unavailable ${code}`);
    }
  }
  return {
    claimDurableAIRouteQuota: (a: unknown) => claimDurableAIRouteQuota(a),
    completeDurableAIRouteQuota: (a: unknown) => completeDurableAIRouteQuota(a),
    DurableAIQuotaUnavailableError,
  };
});
vi.mock("@/features/shared/lib/supabase/server", () => ({ createAdminSupabase: () => ({}) }));
vi.mock("@/features/shared/lib/server/ai-ops-guard", () => ({
  estimateCopilotTurnCostUsd: () => 0.05,
  registerAIUsageEvent: vi.fn(),
}));
vi.mock("@/features/copilot/technician/server/chat", () => ({
  runTechnicianCopilotTurn: (t: unknown) => runTechnicianCopilotTurn(t),
}));
vi.mock("@/features/copilot/technician/server/transport", () => ({
  sendCopilotServerCommand: vi.fn(async () => ({ session: null, events: [] })),
}));

import { AIBudgetDeniedError } from "@/features/shared/lib/server/ai-budget";
import { runGovernedTechnicianCopilotTurn } from "@/features/copilot/technician/server/governedTurn";

const turn = {
  identity: { authUserId: "a", profileId: "p", shopId: "shop-1", documentationEnabled: true },
  turnId: "t1",
  sessionId: null,
} as never;

beforeEach(() => {
  claimDurableAIRouteQuota.mockReset();
  completeDurableAIRouteQuota.mockReset();
  runTechnicianCopilotTurn.mockReset();
  delete process.env.AI_GOVERNANCE_FAIL_CLOSED;
  claimDurableAIRouteQuota.mockResolvedValue({ allowed: true, receiptId: "rcpt-1" });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("Copilot turn under budget governance", () => {
  it("maps an out-of-budget denial to the terminal 402 quota error and returns the quota slot at $0", async () => {
    runTechnicianCopilotTurn.mockRejectedValue(new AIBudgetDeniedError("insufficient_balance", 0, null));
    await expect(runGovernedTechnicianCopilotTurn({ endpoint: "/api/copilot", turn })).rejects.toMatchObject({
      name: "TechnicianCopilotQuotaError",
      code: "hard_budget_exceeded",
      status: 402,
    });
    expect(completeDurableAIRouteQuota).toHaveBeenCalledWith(
      expect.objectContaining({ receiptId: "rcpt-1", actualCostUsd: 0, succeeded: false }),
    );
  });

  it("still charges the conservative per-turn cost when the provider fails", async () => {
    runTechnicianCopilotTurn.mockRejectedValue(new Error("provider exploded"));
    await expect(runGovernedTechnicianCopilotTurn({ endpoint: "/api/copilot", turn })).rejects.toThrow("provider exploded");
    expect(completeDurableAIRouteQuota).toHaveBeenCalledWith(
      expect.objectContaining({ actualCostUsd: 0.05, succeeded: false }),
    );
  });

  it("by default continues the turn when the quota service has a transient fault (unchanged)", async () => {
    claimDurableAIRouteQuota.mockRejectedValue(new Error("connection reset"));
    runTechnicianCopilotTurn.mockResolvedValue({ modelCalls: 1 });
    await expect(runGovernedTechnicianCopilotTurn({ endpoint: "/api/copilot", turn })).resolves.toMatchObject({ modelCalls: 1 });
    expect(runTechnicianCopilotTurn).toHaveBeenCalledTimes(1);
  });

  it("refuses the turn on a transient quota fault when AI_GOVERNANCE_FAIL_CLOSED is set", async () => {
    process.env.AI_GOVERNANCE_FAIL_CLOSED = "1";
    claimDurableAIRouteQuota.mockRejectedValue(new Error("connection reset"));
    await expect(runGovernedTechnicianCopilotTurn({ endpoint: "/api/copilot", turn })).rejects.toMatchObject({
      code: "governance_unavailable",
      status: 429,
    });
    expect(runTechnicianCopilotTurn).not.toHaveBeenCalled();
  });
});
