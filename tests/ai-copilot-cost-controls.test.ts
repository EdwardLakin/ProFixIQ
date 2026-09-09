import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  boundTechnicianCopilotModelInput,
  TECHNICIAN_COPILOT_RECENT_TURN_LIMIT,
} from "@/features/copilot/technician/server/reasoningContext";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";

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

  it("rate limits the chat route and advances the monthly budget", () => {
    const route = source("app/api/copilot/technician/chat/route.ts");

    expect(route).toContain("enforceAIOperationalPolicy");
    // A rate limit without registerAIUsageEvent leaves the budget frozen.
    expect(route).toContain("registerAIUsageEvent");
    expect(route).toContain("estimateCopilotTurnCostUsd");
  });
});
