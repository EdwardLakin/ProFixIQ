import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const planner = readFileSync(
  "features/shop-assistant/server/orchestrator/planner.ts",
  "utf8",
);
const orchestrator = readFileSync(
  "features/shop-assistant/server/orchestrator/orchestrateShopAssistantTurn.ts",
  "utf8",
);
const registry = readFileSync(
  "features/shop-assistant/server/tools/registry.ts",
  "utf8",
);

describe("shop assistant record resolution", () => {
  it("carries bounded prior tool records into subsequent planning", () => {
    expect(planner).toContain("boundedToolData");
    expect(planner).toContain("toolData: boundedToolData(message)");
    expect(planner).toContain(".slice(0, 8000)");
    expect(planner).toContain("prior server tool results");
  });

  it("allows one read-only resolution phase before one confirmed write", () => {
    expect(planner).toContain('"prepare_write"');
    expect(planner).toContain("resolutionResults");
    expect(orchestrator).toContain('phase: "resolve"');
    expect(orchestrator).toContain("resolutionOutputs");
    expect(orchestrator).toContain("previewShopAssistantWriteTool");
    expect(orchestrator).toContain("createPendingAction");
  });

  it("never permits the planner to mix reads with a write or select two writes", () => {
    expect(planner).toContain("writes.length > 1");
    expect(planner).toContain("calls.length > 1");
    expect(planner).toContain(
      "A turn may stage exactly one write and cannot mix reads with writes.",
    );
  });

  it("fails closed instead of turning a failed write plan into a read", () => {
    expect(planner).toContain("WRITE_INTENT_PATTERN");
    expect(planner).toContain("no records were changed");
  });

  it("validates role, schema, authorization, preview, and output at the registry", () => {
    expect(registry).toContain("assertToolCapability");
    expect(registry).toContain("inputSchema.parse");
    expect(registry).toContain("await tool.authorize?.(input, params.context)");
    expect(registry).toContain("outputSchema.parse");
  });
});
