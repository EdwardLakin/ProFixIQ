import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepairSessionEvent } from "@/features/copilot/technician/session/types";

const mocks = vi.hoisted(() => ({
  listTechnicianWorkCandidates: vi.fn(),
  loadTechnicianWorkCandidateForWorkOrder: vi.fn(),
  decideTechnicianCopilotTurn: vi.fn(),
  extractTechnicianDocumentationTurn: vi.fn(),
  sendCopilotServerCommand: vi.fn(),
}));

vi.mock("@/features/copilot/technician/server/assignedWork", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/copilot/technician/server/assignedWork")
  >("@/features/copilot/technician/server/assignedWork");
  return {
    ...actual,
    listTechnicianWorkCandidates: mocks.listTechnicianWorkCandidates,
    loadTechnicianWorkCandidateForWorkOrder:
      mocks.loadTechnicianWorkCandidateForWorkOrder,
  };
});

vi.mock("@/features/copilot/technician/server/model", () => ({
  decideTechnicianCopilotTurn: mocks.decideTechnicianCopilotTurn,
}));

vi.mock("@/features/copilot/technician/server/documentation", () => ({
  extractTechnicianDocumentationTurn:
    mocks.extractTechnicianDocumentationTurn,
}));

vi.mock("@/features/copilot/technician/server/transport", () => ({
  sendCopilotServerCommand: mocks.sendCopilotServerCommand,
}));

import { runTechnicianCopilotTurn } from "@/features/copilot/technician/server/chat";

const candidate = {
  id: "wo-ford",
  customId: "WO-FORD",
  status: "in_progress",
  concern: "Vibration at highway speed",
  description: null,
  vehicleYear: 2021,
  vehicleMake: "Ford",
  vehicleModel: "F-350",
  vehicleVin: null,
  vehicleUnitNumber: "214",
  lineIds: ["line-driveline"],
  lineComplaints: ["Driveline vibration at 80 km/h"],
};

type RuntimeSession = {
  id: string;
  workOrderId: string;
  activeWorkOrderLineId: string | null;
  mode: "shop";
  status: "active";
};

describe("Technician CoPilot persistent text runtime", () => {
  let session: RuntimeSession | null;
  let events: RepairSessionEvent[];
  let documentationTurns: string[];
  let eventCounter: number;
  let finalReasoningContext: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    session = null;
    events = [];
    documentationTurns = [];
    eventCounter = 0;
    finalReasoningContext = null;

    mocks.listTechnicianWorkCandidates.mockResolvedValue([candidate]);
    mocks.loadTechnicianWorkCandidateForWorkOrder.mockResolvedValue(candidate);

    mocks.decideTechnicianCopilotTurn.mockImplementation(
      async (input: Record<string, unknown>) => {
        const message = String(input.message ?? "");
        const activeSession = input.activeSession as Record<string, unknown> | null;

        if (message === "Start the Ford." && !activeSession) {
          return {
            mode: "start",
            workOrderId: candidate.id,
            workOrderLineId: "line-driveline",
            reply: "Starting the Ford.",
          };
        }

        if (message === "What have we figured out so far?") {
          finalReasoningContext = input.repairContext as Record<string, unknown>;
          const context = input.repairContext as {
            currentTask: string | null;
            observations: Array<{
              text: string;
              assessment: string | null;
            }>;
          };
          const uJoint = context.observations.find((item) =>
            item.text.includes("U-joint"),
          );
          const carrier = context.observations.find((item) =>
            item.text.includes("Carrier bearing"),
          );
          return {
            mode: "reply",
            workOrderId: null,
            workOrderLineId: null,
            reply: `We're on the ${context.currentTask}. The rear U-joint is ${uJoint?.assessment}; the carrier bearing is ${carrier?.assessment}.`,
          };
        }

        const replies: Record<string, string> = {
          "Start the Ford.": "Ford session is active.",
          "Read me the complaint.":
            "Complaint is a driveline vibration at highway speed.",
          "I'm checking the driveline.": "Okay, I'm with you on the driveline.",
          "Rear U-joint has play.": "Rear U-joint play noted.",
          "Carrier bearing looks okay.": "Carrier bearing looks normal.",
        };

        return {
          mode: "reply",
          workOrderId: null,
          workOrderLineId: null,
          reply: replies[message] ?? "I'm with you.",
        };
      },
    );

    mocks.extractTechnicianDocumentationTurn.mockImplementation(
      async (input: { message: string }) => {
        const byMessage: Record<
          string,
          Array<{ type: string; details: Record<string, unknown> }>
        > = {
          "I'm checking the driveline.": [
            { type: "task.changed", details: { task: "driveline" } },
          ],
          "Rear U-joint has play.": [
            {
              type: "observation.recorded",
              details: {
                text: "Rear U-joint has play",
                assessment: "abnormal",
                component: "U-joint",
                location: "rear",
              },
            },
          ],
          "Carrier bearing looks okay.": [
            {
              type: "observation.recorded",
              details: {
                text: "Carrier bearing looks okay",
                assessment: "normal",
                component: "carrier bearing",
              },
            },
          ],
        };
        return {
          events: byMessage[input.message] ?? [],
          model: "test-model",
          providerMode: "ai" as const,
          promptVersion: "technician_copilot_documentation_v1" as const,
        };
      },
    );

    const appendEvent = (
      eventType: string,
      source: RepairSessionEvent["source"],
      payload: Record<string, unknown>,
      occurredAt?: string,
    ) => {
      if (!session) throw new Error("Test session is not active");
      eventCounter += 1;
      events.push({
        id: `event-${eventCounter}`,
        repairSessionId: session.id,
        eventSeq: eventCounter,
        eventType,
        source,
        payload,
        occurredAt:
          occurredAt ?? `2026-08-14T14:${String(eventCounter).padStart(2, "0")}:00Z`,
      });
      return {
        eventId: `event-${eventCounter}`,
        eventSeq: eventCounter,
        replayed: false,
      };
    };

    mocks.sendCopilotServerCommand.mockImplementation(
      async (input: {
        action: string;
        args: Record<string, unknown>;
      }) => {
        if (input.action === "session.read") {
          return {
            session,
            events: [...events],
            documentationTurns: [...documentationTurns],
          };
        }

        if (input.action === "session.start") {
          if (!session) {
            session = {
              id: "session-ford",
              workOrderId: String(input.args.workOrderId),
              activeWorkOrderLineId:
                typeof input.args.workOrderLineId === "string"
                  ? input.args.workOrderLineId
                  : null,
              mode: "shop",
              status: "active",
            };
            appendEvent("session.started", "system", {
              workOrderId: session.workOrderId,
              workOrderLineId: session.activeWorkOrderLineId,
            });
          }
          return { sessionId: session.id, replayed: false };
        }

        if (input.action === "event.append") {
          return appendEvent(
            String(input.args.eventType),
            String(input.args.origin) as RepairSessionEvent["source"],
            (input.args.details ?? {}) as Record<string, unknown>,
            typeof input.args.occurredAt === "string"
              ? input.args.occurredAt
              : undefined,
          );
        }

        if (input.action === "documentation.append") {
          const sourceTurnId = String(input.args.sourceTurnId);
          if (documentationTurns.includes(sourceTurnId)) {
            return {
              turnId: sourceTurnId,
              sourceTurnId,
              eventCount: 0,
              replayed: true,
            };
          }
          const documentationEvents = (input.args.events ?? []) as Array<{
            type: string;
            details: Record<string, unknown>;
          }>;
          for (const event of documentationEvents) {
            appendEvent(event.type, "copilot", event.details);
          }
          documentationTurns.push(sourceTurnId);
          return {
            turnId: sourceTurnId,
            sourceTurnId,
            eventCount: documentationEvents.length,
            replayed: false,
          };
        }

        throw new Error(`Unexpected command: ${input.action}`);
      },
    );
  });

  it("keeps the same assigned Ford repair context across the six-turn acceptance conversation", async () => {
    const messages = [
      "Start the Ford.",
      "Read me the complaint.",
      "I'm checking the driveline.",
      "Rear U-joint has play.",
      "Carrier bearing looks okay.",
      "What have we figured out so far?",
    ];

    let sessionId: string | null = null;
    let finalResult: Awaited<ReturnType<typeof runTechnicianCopilotTurn>> | null =
      null;

    for (const [index, message] of messages.entries()) {
      const result = await runTechnicianCopilotTurn({
        identity: {
          authUserId: "auth-tech",
          profileId: "profile-tech",
          shopId: "shop-1",
          documentationEnabled: true,
          voiceEnabled: false,
          supabase: {} as never,
        },
        message,
        turnId: `turn-${index + 1}`,
        sessionId,
      });
      sessionId = result.sessionId;
      finalResult = result;
      expect(result.sessionId).toBe("session-ford");
    }

    expect(finalResult).not.toBeNull();
    expect(finalResult?.workOrder?.id).toBe("wo-ford");
    expect(finalResult?.context?.currentTask).toBe("driveline");
    expect(finalResult?.context?.conversation).toHaveLength(12);

    expect(finalResult?.context?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Rear U-joint has play",
          assessment: "abnormal",
          component: "U-joint",
          location: "rear",
        }),
        expect.objectContaining({
          text: "Carrier bearing looks okay",
          assessment: "normal",
          component: "carrier bearing",
        }),
      ]),
    );
    expect(finalResult?.context?.complaint).toContain(
      "Vibration at highway speed",
    );
    expect(finalResult?.reply).toContain("rear U-joint is abnormal");
    expect(finalResult?.reply).toContain("carrier bearing is normal");

    expect(finalReasoningContext).toMatchObject({
      repairSessionId: "session-ford",
      currentTask: "driveline",
    });
    expect(
      (finalReasoningContext?.observations as Array<{ text: string }>).map(
        (item) => item.text,
      ),
    ).toEqual(
      expect.arrayContaining([
        "Rear U-joint has play",
        "Carrier bearing looks okay",
      ]),
    );

    // Candidate discovery is needed only for the first start turn. The five
    // established-session turns use the bounded one-WO loader instead.
    expect(mocks.listTechnicianWorkCandidates).toHaveBeenCalledTimes(1);
    expect(mocks.listTechnicianWorkCandidates).toHaveBeenCalledWith({
      supabase: expect.anything(),
      shopId: "shop-1",
      technicianIds: ["auth-tech", "profile-tech"],
    });
    expect(mocks.loadTechnicianWorkCandidateForWorkOrder).toHaveBeenCalledTimes(5);
    expect(mocks.loadTechnicianWorkCandidateForWorkOrder).toHaveBeenLastCalledWith({
      supabase: expect.anything(),
      shopId: "shop-1",
      technicianIds: ["auth-tech", "profile-tech"],
      workOrderId: "wo-ford",
    });

    const actions = mocks.sendCopilotServerCommand.mock.calls.map(
      ([call]) => call.action,
    );
    expect(new Set(actions)).toEqual(
      new Set([
        "session.read",
        "session.start",
        "event.append",
        "documentation.append",
      ]),
    );
  });
});
