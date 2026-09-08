import { describe, expect, it } from "vitest";

import type { TechnicianContext } from "@/features/copilot/technician/session/projectTechnicianContext";
import {
  boundTechnicianCopilotModelInput,
  boundTechnicianReasoningContext,
  TECHNICIAN_COPILOT_RECENT_TURN_LIMIT,
} from "@/features/copilot/technician/server/reasoningContext";

function contextWithTurns(turnCount: number): TechnicianContext {
  return {
    repairSessionId: "session-1",
    mode: "shop",
    status: "active",
    currentTask: "driveline",
    complaint: "Vibration",
    conversation: Array.from({ length: turnCount }).flatMap((_, index) => {
      const turn = index + 1;
      return [
        {
          eventId: `user-${turn}`,
          role: "user" as const,
          text: `Technician message ${turn}`,
          turnId: `turn-${turn}`,
          occurredAt: `2026-09-07T12:${String(turn).padStart(2, "0")}:00Z`,
        },
        {
          eventId: `assistant-${turn}`,
          role: "assistant" as const,
          text: `Assistant reply ${turn}`,
          turnId: `turn-${turn}`,
          occurredAt: `2026-09-07T12:${String(turn).padStart(2, "0")}:30Z`,
        },
      ];
    }),
    observations: [],
    measurements: [],
    dtcs: [],
    findings: [],
    componentStates: {},
    fluidStates: {},
    pendingActions: {},
    documentation: {
      capturedEventCount: 0,
      lastCapturedAt: null,
      repairNoteDraft: "No structured repair documentation captured yet.",
      timeline: [],
    },
    lastEventSeq: turnCount * 2,
    contextVersion: turnCount * 2,
  };
}

describe("technician CoPilot reasoning context", () => {
  it("keeps only the latest eight logical turns while summarizing older dialogue", () => {
    const source = contextWithTurns(10);
    const bounded = boundTechnicianReasoningContext(source);

    expect(TECHNICIAN_COPILOT_RECENT_TURN_LIMIT).toBe(8);
    expect(bounded.conversation).toHaveLength(16);
    expect(bounded.conversation[0]?.turnId).toBe("turn-3");
    expect(bounded.conversation.at(-1)?.turnId).toBe("turn-10");
    expect(bounded.conversationSummary).toContain("Technician message 1");
    expect(bounded.conversationSummary).toContain("Assistant reply 2");

    expect(source.conversation).toHaveLength(20);
    expect(source).not.toHaveProperty("conversationSummary");
  });

  it("caps the older-conversation summary instead of allowing history growth to continue", () => {
    const source = contextWithTurns(30);
    source.conversation = source.conversation.map((turn) => ({
      ...turn,
      text: `${turn.text} ${"x".repeat(500)}`,
    }));

    const bounded = boundTechnicianReasoningContext(source);

    expect(bounded.conversation).toHaveLength(16);
    expect(bounded.conversationSummary?.length ?? 0).toBeLessThanOrEqual(2400);
  });

  it("bounds only repairContext and leaves non-session model inputs unchanged", () => {
    const source = contextWithTurns(10);
    const input = { message: "What have we figured out?", repairContext: source };
    const bounded = boundTechnicianCopilotModelInput(input) as {
      message: string;
      repairContext: ReturnType<typeof boundTechnicianReasoningContext>;
    };

    expect(bounded.message).toBe(input.message);
    expect(bounded.repairContext.conversation[0]?.turnId).toBe("turn-3");

    const noContext = { message: "What do I have?", activeSession: null };
    expect(boundTechnicianCopilotModelInput(noContext)).toBe(noContext);
  });
});
