import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  boundTechnicianCopilotModelInput,
  TECHNICIAN_COPILOT_RECENT_TURN_LIMIT,
} from "@/features/copilot/technician/server/reasoningContext";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { readdirSync } from "node:fs";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function contextWithTurns(count: number) {
  return {
    repairContext: {
      conversation: Array.from({ length: count }, (_, i) => ({
        eventId: `e${i}`,
        role: i % 2 === 0 ? "user" : "assistant",
        text: `turn ${i} `.repeat(20),
        turnId: `t${i}`,
        occurredAt: new Date().toISOString(),
      })),
    },
  };
}

describe("CoPilot conversation context is bounded on every model call", () => {
  it("caps the conversation and summarizes the remainder", () => {
    const bounded = boundTechnicianCopilotModelInput(contextWithTurns(60)) as {
      repairContext: { conversation: unknown[]; conversationSummary: string | null };
    };

    expect(bounded.repairContext.conversation).toHaveLength(
      TECHNICIAN_COPILOT_RECENT_TURN_LIMIT,
    );
    expect(bounded.repairContext.conversationSummary).toBeTruthy();
  });

  it("holds prompt size constant as the session grows without limit", () => {
    // The cost bug is O(n) prompt growth per turn (quadratic per session). The
    // property that matters is a ceiling: once the older-turn summary saturates,
    // ten times more history must not add a single character.
    const long = JSON.stringify(boundTechnicianCopilotModelInput(contextWithTurns(400)));
    const longer = JSON.stringify(
      boundTechnicianCopilotModelInput(contextWithTurns(4000)),
    );

    // A fixed ceiling, not proportional growth: 10x the history stays within a
    // few hundred characters (the fixture's turn labels get one digit longer),
    // while the unbounded payload is two orders of magnitude larger.
    expect(Math.abs(longer.length - long.length)).toBeLessThan(500);
    expect(longer.length).toBeLessThan(6000);

    const unbounded = JSON.stringify(contextWithTurns(4000));
    expect(longer.length).toBeLessThan(unbounded.length / 50);
  });

  it("applies the bound to the documentation extractor, not just the decision call", () => {
    const documentation = source(
      "features/copilot/technician/server/documentation.ts",
    );
    const model = source("features/copilot/technician/server/model.ts");

    expect(model).toContain("user: boundTechnicianCopilotModelInput(input)");
    expect(documentation).toContain(
      "user: boundTechnicianCopilotModelInput(input)",
    );
  });
});

describe("CoPilot turns are governed like every other AI route", () => {
  it("has a first-class AI policy for both model calls", () => {
    expect(getAIPolicy("technician_copilot_text").maxTokens).toBeGreaterThan(0);
    expect(getAIPolicy("technician_copilot_documentation").modelPurpose).toBe(
      "fast",
    );
  });

  it("caps the chat route durably and advances the anomaly counters", () => {
    const route = source("app/api/copilot/technician/chat/route.ts");

    // The durable receipt is the real ceiling: the in-memory guard resets on
    // every serverless cold start, so it cannot bound monthly spend on its own.
    expect(route).toContain("claimDurableAIRouteQuota");
    expect(route).toContain("completeDurableAIRouteQuota");
    // registerAIUsageEvent still feeds the spike / high-cost / denial alerts.
    expect(route).toContain("registerAIUsageEvent");
    expect(route).toContain("estimateCopilotTurnCostUsd");
    // Denials must surface as 429, not a silent success.
    expect(route).toContain("hard_budget_exceeded");
  });
});

describe("durable quota features are backed by the database", () => {
  // The receipts table CHECK and both quota RPCs validate `feature` against a
  // hardcoded list. A DurableAIFeature with no SQL backing typechecks cleanly
  // and then fails every claim at runtime as AI_ROUTE_QUOTA_INPUT_INVALID, so
  // assert the two stay in step.
  function latestQuotaWhitelist(): string {
    const dir = "supabase/migrations";
    const files = readdirSync(join(process.cwd(), dir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let whitelist = "";
    for (const file of files) {
      const sql = source(join(dir, file));
      for (const match of sql.matchAll(
        /feature\s+(?:text\s+not\s+null\s+)?(?:in|check\s*\(feature\s+in)\s*\(([^)]*)\)/gi,
      )) {
        whitelist = match[1];
      }
      for (const match of sql.matchAll(
        /p_feature\s+not\s+in\s*\(([^)]*)\)/gi,
      )) {
        whitelist = match[1];
      }
    }
    return whitelist;
  }

  it("includes technician_copilot_text in the SQL whitelist", () => {
    const whitelist = latestQuotaWhitelist();

    expect(whitelist).toContain("technician_copilot_text");
    // The pre-existing features must survive the widening.
    expect(whitelist).toContain("dtc_suggest");
    expect(whitelist).toContain("inspection_interpret");
  });

  it("routes the CoPilot turn through claim and completion", () => {
    const route = source("app/api/copilot/technician/chat/route.ts");

    expect(route).toContain("claimDurableAIRouteQuota");
    // A claimed receipt that never settles counts against the window and budget
    // until the stale sweep reclaims it, so both paths must complete it.
    expect(route).toContain("settleReceipt(false)");
    expect(route).toContain("settleReceipt(true)");
  });
});
