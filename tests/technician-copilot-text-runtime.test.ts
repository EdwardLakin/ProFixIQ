import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepairSessionEvent } from "@/features/copilot/technician/session/types";

const mocks = vi.hoisted(() => ({
  listTechnicianWorkCandidates: vi.fn(),
  loadTechnicianWorkCandidateForWorkOrder: vi.fn(),
  decideTechnicianCopilotTurn: vi.fn(),
  extractTechnicianDocumentationTurn: vi.fn(),
  sendCopilotServerCommand: vi.fn(),
  learnFromCompletedWorkOrderLine: vi.fn(),
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

vi.mock("@/features/work-orders/server/completeWorkOrderLine", () => ({
  learnFromCompletedWorkOrderLine: mocks.learnFromCompletedWorkOrderLine,
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
  lines: [
    {
      id: "line-driveline",
      complaint: "Driveline vibration at 80 km/h",
      description: null,
      status: "awaiting",
      cause: null,
      correction: null,
      holdReason: null,
      priority: 1,
      createdAt: "2026-08-14T13:00:00Z",
      updatedAt: "2026-08-14T13:30:00Z",
    },
  ],
  lineComplaints: ["Driveline vibration at 80 km/h"],
};

type RuntimeSession = {
  id: string;
  workOrderId: string;
  activeWorkOrderLineId: string | null;
  mode: "shop";
  status: "active" | "closed";
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
    mocks.learnFromCompletedWorkOrderLine.mockResolvedValue({ ok: true });

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
            action: { type: "job.start", workOrderLineId: "line-driveline" },
            reply: "Starting the Ford.",
          };
        }

        if (message === "Start the Ford." && activeSession) {
          return {
            mode: "reply",
            workOrderId: null,
            workOrderLineId: "line-driveline",
            action: { type: "job.start", workOrderLineId: "line-driveline" },
            reply: "Starting the Ford.",
          };
        }

        if (message === "Complete the Ford." && activeSession) {
          return {
            mode: "reply",
            workOrderId: null,
            workOrderLineId: "line-driveline",
            action: {
              type: "job.complete",
              workOrderLineId: "line-driveline",
              cause: "Failed rear U-joint",
              correction: "Replaced rear U-joint",
            },
            reply: "Completing the Ford.",
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
            action: { type: "none" },
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
          action: { type: "none" },
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
          } else if (typeof input.args.workOrderLineId === "string") {
            session.activeWorkOrderLineId = input.args.workOrderLineId;
          }
          return { sessionId: session.id, replayed: false };
        }

        if (input.action === "session.close") {
          if (!session) throw new Error("Test session is not active");
          appendEvent("session.closed", "system", {
            reason: input.args.reason,
          });
          session.status = "closed";
          session.activeWorkOrderLineId = null;
          return { sessionId: session.id, status: "closed", replayed: false };
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

        if (input.action === "job.action") {
          return {
            ok: true,
            copilotAction: input.args.jobAction,
            workOrderLineId: input.args.workOrderLineId,
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

    expect(mocks.listTechnicianWorkCandidates).toHaveBeenCalledWith({
      supabase: expect.anything(),
      shopId: "shop-1",
      technicianIds: ["auth-tech", "profile-tech"],
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
        "job.action",
      ]),
    );
  });

  it("does not execute a completed spoken action twice when the turn is replayed", async () => {
    const first = await runTechnicianCopilotTurn({
      identity: {
        authUserId: "auth-tech",
        profileId: "profile-tech",
        shopId: "shop-1",
        documentationEnabled: true,
        voiceEnabled: true,
        supabase: {} as never,
      },
      message: "Start the Ford.",
      turnId: "turn-start-replay",
      inputSource: "voice",
    });
    const replay = await runTechnicianCopilotTurn({
      identity: {
        authUserId: "auth-tech",
        profileId: "profile-tech",
        shopId: "shop-1",
        documentationEnabled: true,
        voiceEnabled: true,
        supabase: {} as never,
      },
      message: "Start the Ford.",
      turnId: "turn-start-replay",
      sessionId: first.sessionId,
      inputSource: "voice",
    });

    const jobActions = mocks.sendCopilotServerCommand.mock.calls.filter(
      ([call]) => call.action === "job.action",
    );
    expect(jobActions).toHaveLength(1);
    expect(first.reply).toContain("Started Driveline vibration");
    expect(replay.reply).toBe(first.reply);
    expect(replay.replayed).toBe(true);
  });

  it("recovers a persisted completion turn after the line leaves the actionable queue", async () => {
    const started = await runTechnicianCopilotTurn({
      identity: {
        authUserId: "auth-tech",
        profileId: "profile-tech",
        shopId: "shop-1",
        documentationEnabled: true,
        voiceEnabled: true,
        supabase: {} as never,
      },
      message: "Start the Ford.",
      turnId: "turn-start-before-completion",
      inputSource: "voice",
    });

    const completionCandidate = {
      ...candidate,
      lines: [
        {
          ...candidate.lines[0],
          status: "in_progress",
          cause: "Failed rear U-joint",
          correction: "Replaced rear U-joint",
        },
      ],
    };
    let completionCommitted = false;
    let dropFirstActionResult = true;
    mocks.listTechnicianWorkCandidates.mockImplementation(async () =>
      completionCommitted ? [] : [completionCandidate],
    );
    mocks.loadTechnicianWorkCandidateForWorkOrder.mockImplementation(
      async () => (completionCommitted ? null : completionCandidate),
    );

    const baseCommand = mocks.sendCopilotServerCommand.getMockImplementation();
    if (!baseCommand) throw new Error("Missing command test harness");
    mocks.sendCopilotServerCommand.mockImplementation(async (input: {
      action: string;
      args: Record<string, unknown>;
    }) => {
      if (
        input.action === "job.action" &&
        input.args.jobAction === "job.complete"
      ) {
        completionCommitted = true;
      }
      if (
        input.action === "event.append" &&
        input.args.eventType === "action.completed" &&
        dropFirstActionResult
      ) {
        dropFirstActionResult = false;
        throw new Error("Response connection dropped after completion commit");
      }
      return baseCommand(input);
    });

    await expect(
      runTechnicianCopilotTurn({
        identity: {
          authUserId: "auth-tech",
          profileId: "profile-tech",
          shopId: "shop-1",
          documentationEnabled: true,
          voiceEnabled: true,
          supabase: {} as never,
        },
        message: "Complete the Ford.",
        turnId: "turn-complete-retry",
        sessionId: started.sessionId,
        inputSource: "voice",
      }),
    ).rejects.toThrow("Response connection dropped");

    const recovered = await runTechnicianCopilotTurn({
      identity: {
        authUserId: "auth-tech",
        profileId: "profile-tech",
        shopId: "shop-1",
        documentationEnabled: true,
        voiceEnabled: true,
        supabase: {} as never,
      },
      message: "Complete the Ford.",
      turnId: "turn-complete-retry",
      sessionId: started.sessionId,
      inputSource: "voice",
    });

    expect(recovered.reply).toContain("Completed Driveline vibration");
    expect(recovered.sessionId).toBeNull();
    expect(recovered.session).toBeNull();
    expect(
      mocks.sendCopilotServerCommand.mock.calls.filter(
        ([call]) =>
          call.action === "job.action" &&
          call.args.jobAction === "job.complete",
      ),
    ).toHaveLength(2);
    expect(
      mocks.sendCopilotServerCommand.mock.calls.some(
        ([call]) => call.action === "session.close",
      ),
    ).toBe(true);
  });

  it("re-anchors the repair session when another assigned line remains", async () => {
    const started = await runTechnicianCopilotTurn({
      identity: {
        authUserId: "auth-tech",
        profileId: "profile-tech",
        shopId: "shop-1",
        documentationEnabled: true,
        voiceEnabled: true,
        supabase: {} as never,
      },
      message: "Start the Ford.",
      turnId: "turn-start-before-reanchor",
      inputSource: "voice",
    });
    const remainingLine = {
      ...candidate.lines[0],
      id: "line-road-test",
      complaint: "Final road test",
      status: "awaiting",
      cause: null,
      correction: null,
    };
    const beforeCompletion = {
      ...candidate,
      lineIds: ["line-driveline", remainingLine.id],
      lines: [
        {
          ...candidate.lines[0],
          status: "in_progress",
          cause: "Failed rear U-joint",
          correction: "Replaced rear U-joint",
        },
        remainingLine,
      ],
    };
    const afterCompletion = {
      ...beforeCompletion,
      lineIds: [remainingLine.id],
      lines: [remainingLine],
    };
    let completionCommitted = false;
    mocks.listTechnicianWorkCandidates.mockResolvedValue([beforeCompletion]);
    mocks.loadTechnicianWorkCandidateForWorkOrder.mockImplementation(
      async () => (completionCommitted ? afterCompletion : beforeCompletion),
    );
    const baseCommand = mocks.sendCopilotServerCommand.getMockImplementation();
    if (!baseCommand) throw new Error("Missing command test harness");
    mocks.sendCopilotServerCommand.mockImplementation(async (input: {
      action: string;
      args: Record<string, unknown>;
    }) => {
      if (
        input.action === "job.action" &&
        input.args.jobAction === "job.complete"
      ) {
        completionCommitted = true;
      }
      return baseCommand(input);
    });

    const completed = await runTechnicianCopilotTurn({
      identity: {
        authUserId: "auth-tech",
        profileId: "profile-tech",
        shopId: "shop-1",
        documentationEnabled: true,
        voiceEnabled: true,
        supabase: {} as never,
      },
      message: "Complete the Ford.",
      turnId: "turn-complete-reanchor",
      sessionId: started.sessionId,
      inputSource: "voice",
    });

    expect(completed.sessionId).toBe("session-ford");
    expect(completed.session).toMatchObject({
      status: "active",
      activeWorkOrderLineId: remainingLine.id,
    });
    expect(
      mocks.sendCopilotServerCommand.mock.calls.some(
        ([call]) =>
          call.action === "session.start" &&
          call.args.workOrderLineId === remainingLine.id,
      ),
    ).toBe(true);
    expect(
      mocks.sendCopilotServerCommand.mock.calls.some(
        ([call]) => call.action === "session.close",
      ),
    ).toBe(false);
  });
});
