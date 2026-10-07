import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AIBudgetDeniedError,
  AIBudgetReplayError,
  AIBudgetUnavailableError,
} from "@/features/shared/lib/server/ai-budget";
import {
  aiBudgetStopResponse,
  governAICall,
  isAIBudgetStop,
} from "@/features/shared/lib/server/ai-governance";

describe("budget stop mapping", () => {
  it("recognises denial, replay and unavailable as stops, not other errors", () => {
    expect(isAIBudgetStop(new AIBudgetDeniedError("insufficient_balance", 0, null))).toBe(true);
    expect(isAIBudgetStop(new AIBudgetUnavailableError("down"))).toBe(true);
    expect(isAIBudgetStop(new Error("boom"))).toBe(false);
    expect(isAIBudgetStop(undefined)).toBe(false);
  });

  it("maps each stop to a distinct non-500 response", () => {
    expect(
      aiBudgetStopResponse(new AIBudgetDeniedError("insufficient_balance", 0, null)).status,
    ).toBe(402);
    expect(aiBudgetStopResponse(new AIBudgetUnavailableError("down"))).toMatchObject({
      status: 503,
      body: { code: "ai_budget_unavailable" },
    });
    const replay = Object.create(AIBudgetReplayError.prototype) as AIBudgetReplayError;
    expect(aiBudgetStopResponse(replay)).toMatchObject({
      status: 409,
      body: { code: "ai_budget_replay" },
    });
  });
});

describe("governAICall status classification", () => {
  it("treats a plain Error carrying a 4xx status as not billed (no throw from classification)", async () => {
    const err = Object.assign(new Error("rejected"), { status: 400 });
    await expect(
      governAICall({ feature: "f", endpoint: "/e", model: "gpt-5.5" }, async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });
});
