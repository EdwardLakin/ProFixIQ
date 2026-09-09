import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("durable Technician CoPilot budget", () => {
  it("uses the advertised environment-backed durable limits", () => {
    const guard = source("features/shared/lib/server/durable-ai-guard.ts");
    expect(guard).toContain('AI_BUDGET_HARD_USD_COPILOT_TEXT');
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
