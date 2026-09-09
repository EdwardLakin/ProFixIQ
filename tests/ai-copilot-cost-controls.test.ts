import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  boundTechnicianCopilotModelInput,
  TECHNICIAN_COPILOT_MODEL_CONTEXT_MAX_CHARS,
  TECHNICIAN_COPILOT_RECENT_TURN_LIMIT,
} from "@/features/copilot/technician/server/reasoningContext";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function documentationHeavyContext(count: number) {
  const occurredAt = (i: number) =>
    new Date(Date.UTC(2026, 8, 9, 12, 0, 0) + i * 1000).toISOString();
  const long = (label: string, i: number) => `${label} ${i} ${"detail ".repeat(80)}`;

  return {
    repairContext: {
      repairSessionId: "11111111-1111-4111-8111-111111111111",
      mode: "repair",
      status: "active",
      currentTask: long("current task", count),
      complaint: long("customer complaint", count),
      conversation: Array.from({ length: count * 2 }, (_, i) => ({
        eventId: `conversation-${i}`,
        role: i % 2 === 0 ? "user" : "assistant",
        text: long(`turn ${i}`, i),
        turnId: `turn-${Math.floor(i / 2)}`,
        occurredAt: occurredAt(i),
      })),
      observations: Array.from({ length: count }, (_, i) => ({
        eventId: `observation-${i}`,
        text: long("observation", i),
        system: `system-${i}`,
        component: `component-${i}`,
        location: `location-${i}`,
        occurredAt: occurredAt(i),
      })),
      measurements: Array.from({ length: count }, (_, i) => ({
        eventId: `measurement-${i}`,
        label: long("measurement", i),
        value: `${i}.12345`,
        unit: "V",
        condition: long("condition", i),
        component: `component-${i}`,
        location: `location-${i}`,
        occurredAt: occurredAt(i),
      })),
      dtcs: Array.from({ length: count }, (_, i) => ({
        eventId: `dtc-${i}`,
        code: `P${String(i % 10000).padStart(4, "0")}`,
        module: `module-${i}`,
        status: "current",
        description: long("dtc description", i),
        occurredAt: occurredAt(i),
      })),
      findings: Array.from({ length: count }, (_, i) => ({
        eventId: `finding-${i}`,
        text: long("finding", i),
        disposition: i % 2 === 0 ? "failed" : "recommended",
        system: `system-${i}`,
        component: `component-${i}`,
        location: `location-${i}`,
        occurredAt: occurredAt(i),
      })),
      componentStates: Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `component-${i}`,
          {
            eventId: `component-state-${i}`,
            component: long("component", i),
            location: `location-${i}`,
            state: "removed",
            occurredAt: occurredAt(i),
          },
        ]),
      ),
      fluidStates: Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `fluid-${i}`,
          {
            eventId: `fluid-state-${i}`,
            fluid: long("fluid", i),
            system: `system-${i}`,
            state: "drained",
            occurredAt: occurredAt(i),
          },
        ]),
      ),
      pendingActions: Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `pending-${String(i).padStart(5, "0")}`,
          long("pending action", i),
        ]),
      ),
      documentation: {
        capturedEventCount: count,
        lastCapturedAt: occurredAt(count),
        repairNoteDraft: Array.from({ length: count }, (_, i) =>
          long("repair note", i),
        ).join("\n"),
        timeline: Array.from({ length: count }, (_, i) => ({
          eventId: `timeline-${i}`,
          kind: "observation",
          label: long("timeline", i),
          occurredAt: occurredAt(i),
        })),
      },
    },
  };
}

describe("Technician CoPilot model context is truly bounded", () => {
  it("keeps only the recent conversation and summarizes older turns", () => {
    const bounded = boundTechnicianCopilotModelInput(
      documentationHeavyContext(60),
    ) as {
      repairContext: { conversation: unknown[]; conversationSummary: string | null };
    };

    expect(bounded.repairContext.conversation).toHaveLength(
      TECHNICIAN_COPILOT_RECENT_TURN_LIMIT,
    );
    expect(bounded.repairContext.conversationSummary).toBeTruthy();
  });

  it("enforces a serialized ceiling for documentation-heavy 10/100/400/1000-turn sessions", () => {
    const sizes = [10, 100, 400, 1000].map((turns) => {
      const input = documentationHeavyContext(turns);
      const bounded = boundTechnicianCopilotModelInput(input);
      return {
        turns,
        bounded: JSON.stringify(bounded).length,
        unbounded: JSON.stringify(input).length,
      };
    });

    for (const sample of sizes) {
      expect(sample.bounded).toBeLessThanOrEqual(
        TECHNICIAN_COPILOT_MODEL_CONTEXT_MAX_CHARS,
      );
    }
    expect(sizes.at(-1)!.bounded).toBeLessThan(sizes.at(-1)!.unbounded / 20);
  });

  it("applies the bound to reasoning and silent documentation", () => {
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

describe("CoPilot governance covers every entry point", () => {
  it("routes both technician chat and Shop Assistant through the shared governed service", () => {
    const route = source("app/api/copilot/technician/chat/route.ts");
    const shopAssistant = source(
      "features/shop-assistant/server/tools/domains/technician.ts",
    );
    const governed = source(
      "features/copilot/technician/server/governedTurn.ts",
    );

    expect(route).toContain("runGovernedTechnicianCopilotTurn");
    expect(shopAssistant).toContain("runGovernedTechnicianCopilotTurn");
    expect(governed).toContain("claimDurableAIRouteQuota");
    expect(governed).toContain("completeDurableAIRouteQuota");
    expect(governed).toContain("withAITelemetryContext");
  });

  it("checks persisted replay state before reserving quota", () => {
    const governed = source(
      "features/copilot/technician/server/governedTurn.ts",
    );
    expect(governed.indexOf("turnMayCallProvider(turn)")).toBeGreaterThan(-1);
    expect(governed.indexOf("turnMayCallProvider(turn)")).toBeLessThan(
      governed.indexOf("claimDurableAIRouteQuota"),
    );
  });

  it("makes provider timeouts canonical for registered AI features", () => {
    const structured = source(
      "features/shared/lib/server/openai-structured.ts",
    );
    expect(structured).toContain("canonicalPolicyTimeoutMs(params.feature)");
    expect(structured).toContain("runWithProviderTimeout(timeoutMs");
    expect(getAIPolicy("technician_copilot_text").timeoutMs).toBe(30_000);
    expect(getAIPolicy("technician_copilot_documentation").timeoutMs).toBe(
      20_000,
    );
  });

  it("does not leave a monthly hard-budget turn retryable on the technician client", () => {
    const governed = source(
      "features/copilot/technician/server/governedTurn.ts",
    );
    const client = source(
      "features/copilot/technician/components/TechnicianTextCopilot.tsx",
    );
    expect(governed).toContain(
      'this.status = code === "hard_budget_exceeded" ? 402 : 429',
    );
    expect(client).toContain("RECOVERABLE_TURN_STATUSES");
    expect(client).not.toMatch(/RECOVERABLE_TURN_STATUSES[^;]*402/s);
  });

  it("keeps silent documentation as model/telemetry policy, not a second operational budget", () => {
    expect(getAIPolicy("technician_copilot_documentation").modelPurpose).toBe(
      "fast",
    );
    const ops = source("features/shared/lib/server/ai-ops-guard.ts");
    expect(ops).toContain(
      'Exclude<AIFeature, "technician_copilot_documentation">',
    );
    expect(ops).not.toContain("AI_BUDGET_HARD_USD_COPILOT_DOCUMENTATION");
  });
});

describe("durable quota features are backed by the database", () => {
  function latestQuotaWhitelist(): string {
    const dir = "supabase/migrations";
    const files = readdirSync(join(process.cwd(), dir))
      .filter((file) => file.endsWith(".sql"))
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

  it("includes technician_copilot_text while preserving existing features", () => {
    const whitelist = latestQuotaWhitelist();
    expect(whitelist).toContain("technician_copilot_text");
    expect(whitelist).toContain("dtc_suggest");
    expect(whitelist).toContain("inspection_interpret");
  });
});
