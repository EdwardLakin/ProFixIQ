import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("durable Technician CoPilot budget", () => {
  it("sizes the hard budget from shop revenue instead of a static env var", () => {
    // 20260913194000_unify_shop_ai_fair_use_budget.sql / ai-fair-use.ts made
    // the monthly hard budget a shared, revenue-linked ceiling (20% of MRR,
    // clamped to 25%) instead of a per-feature env-configured dollar amount.
    // AI_BUDGET_HARD_USD_COPILOT_TEXT must actually be gone, not just
    // supplemented, or a stale env var would silently keep the old ceiling.
    const guard = source("features/shared/lib/server/durable-ai-guard.ts");
    expect(guard).not.toContain('AI_BUDGET_HARD_USD_COPILOT_TEXT');
    expect(guard).toContain('resolveShopAIFairUseBudgetUsd');
    // Rate limits (distinct from the monthly spend ceiling) remain
    // env-configured and feature-scoped.
    expect(guard).toContain('AI_RATE_LIMIT_COPILOT_TEXT_MAX');
    expect(guard).toContain('AI_RATE_LIMIT_COPILOT_TEXT_WINDOW_MS');
    expect(guard).toContain('AI_RATE_LIMIT_COPILOT_TEXT_SHOP_MAX');
  });

  it("reserves with the same configurable per-turn proxy used by settlement", () => {
    const guard = source("features/shared/lib/server/durable-ai-guard.ts");
    const governed = source(
      "features/copilot/technician/server/governedTurn.ts",
    );
    expect(guard).toContain("reservationCostUsd: Math.max(0, estimateCopilotTurnCostUsd())");
    expect(governed).toContain("const turnCostUsd = estimateCopilotTurnCostUsd()");
    expect(governed).toContain("actualCostUsd: turnCostUsd");
  });

  it("does not zero out a reserved turn when provider execution fails", () => {
    const governed = source(
      "features/copilot/technician/server/governedTurn.ts",
    );
    const catchAt = governed.lastIndexOf("} catch (error) {");
    const failurePath = governed.slice(catchAt);
    expect(failurePath).toContain("actualCostUsd: turnCostUsd");
    expect(failurePath).not.toContain("actualCostUsd: 0");
    expect(failurePath).toContain("estimatedCostUsd: turnCostUsd");
  });

  it("emits a structured anomaly event for durable denials", () => {
    const governed = source(
      "features/copilot/technician/server/governedTurn.ts",
    );
    expect(governed).toContain("recordDurableDenial({");
    expect(governed).toContain('source: "durable_quota"');
    expect(governed).toContain('alert_type:');
  });
});
