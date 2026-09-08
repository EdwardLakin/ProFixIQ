import { beforeEach, describe, expect, it, vi } from "vitest";

const runOpenAIStructuredJson = vi.hoisted(() => vi.fn());

vi.mock("@/features/shared/lib/server/openai-structured", () => ({
  runOpenAIStructuredJson,
}));

import { extractTechnicianDocumentationTurn } from "@/features/copilot/technician/server/documentation";
import { decideTechnicianCopilotTurn } from "@/features/copilot/technician/server/model";

describe("Technician CoPilot model routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps technician reasoning on the reasoning model lane with stable cache affinity", async () => {
    runOpenAIStructuredJson.mockResolvedValue({
      mode: "ai",
      model: "gpt-5.5",
      output: {
        mode: "reply",
        workOrderId: null,
        workOrderLineId: null,
        action: { type: "none" },
        reply: "Okay.",
      },
      latencyMs: 1,
    });

    await decideTechnicianCopilotTurn({ message: "Rear U-joint has play." });

    expect(runOpenAIStructuredJson).toHaveBeenCalledTimes(1);
    expect(runOpenAIStructuredJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "reasoning",
        feature: "technician_copilot_text",
        promptCacheKey: "technician_copilot_reasoning_v1",
      }),
    );
  });

  it("routes silent documentation extraction to the fast model lane", async () => {
    runOpenAIStructuredJson.mockResolvedValue({
      mode: "ai",
      model: "gpt-5.4-mini",
      output: { events: [] },
      latencyMs: 1,
    });

    const result = await extractTechnicianDocumentationTurn({
      message: "Rear U-joint has play.",
    });

    expect(runOpenAIStructuredJson).toHaveBeenCalledTimes(1);
    expect(runOpenAIStructuredJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "fast",
        feature: "technician_copilot_documentation",
        promptCacheKey: "technician_copilot_documentation_v1",
      }),
    );
    expect(result.model).toBe("gpt-5.4-mini");
  });
});
