import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TechnicianWorkCandidate } from "@/features/copilot/technician/server/assignedWork";

const mocks = vi.hoisted(() => ({
  sendCopilotServerCommand: vi.fn(),
}));

vi.mock("@/features/copilot/technician/server/transport", () => ({
  sendCopilotServerCommand: mocks.sendCopilotServerCommand,
}));

import {
  describeNextTechnicianWork,
  executeTechnicianCopilotAction,
  prepareTechnicianCopilotAction,
} from "@/features/copilot/technician/server/actions";

const workOrder: TechnicianWorkCandidate = {
  id: "00000000-0000-4000-8000-000000000100",
  customId: "EL000005",
  status: "in_progress",
  concern: "Brake vibration",
  description: null,
  vehicleYear: 2017,
  vehicleMake: "Ford",
  vehicleModel: "Expedition",
  vehicleVin: null,
  vehicleUnitNumber: null,
  lineIds: [
    "00000000-0000-4000-8000-000000000201",
    "00000000-0000-4000-8000-000000000202",
  ],
  lines: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      complaint: "Brake inspection",
      description: null,
      status: "awaiting",
      cause: "Front pads below specification",
      correction: "Replace front brake pads",
      holdReason: null,
      priority: 2,
      createdAt: "2026-08-15T12:00:00Z",
      updatedAt: "2026-08-15T12:05:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      complaint: "Road test",
      description: null,
      status: "in_progress",
      cause: null,
      correction: null,
      holdReason: null,
      priority: 3,
      createdAt: "2026-08-15T12:01:00Z",
      updatedAt: "2026-08-15T12:06:00Z",
    },
  ],
  lineComplaints: ["Brake inspection", "Road test"],
};

describe("Technician CoPilot canonical job actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendCopilotServerCommand.mockResolvedValue({ ok: true });
  });

  it("answers what's next from assigned line state without claiming or mutating work", () => {
    const reply = describeNextTechnicianWork([workOrder]);

    expect(reply).toContain("already punched into Road test");
    expect(reply).toContain("WO #EL000005");
    expect(mocks.sendCopilotServerCommand).not.toHaveBeenCalled();
  });

  it("uses the repair session's active line when natural language omits an ID", () => {
    const prepared = prepareTechnicianCopilotAction({
      action: { type: "job.start", workOrderLineId: null },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
    });

    expect(prepared).toMatchObject({
      kind: "execute",
      line: { id: workOrder.lines[0].id },
    });
  });

  it("asks which line instead of guessing when multiple assigned lines are possible", () => {
    const prepared = prepareTechnicianCopilotAction({
      action: { type: "job.hold", workOrderLineId: null, reason: "Awaiting parts" },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "Which job line do you mean: Brake inspection, Road test?",
    });
  });

  it("rejects a model-selected line outside the technician's assigned work", () => {
    const prepared = prepareTechnicianCopilotAction({
      action: {
        type: "job.start",
        workOrderLineId: "00000000-0000-4000-8000-000000009999",
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
    });

    expect(prepared).toMatchObject({
      kind: "reply",
      reply: expect.stringContaining("no longer assigned"),
    });
  });

  it("does not release a line that is no longer on hold", () => {
    const prepared = prepareTechnicianCopilotAction({
      action: {
        type: "job.release_hold",
        workOrderLineId: workOrder.lines[0].id,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "Brake inspection is not currently on hold.",
    });
  });

  it("starts through the canonical atomic job-labor service with a stable replay key", async () => {
    const prepared = prepareTechnicianCopilotAction({
      action: { type: "job.start", workOrderLineId: workOrder.lines[0].id },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    const identity = {
      authUserId: "00000000-0000-4000-8000-000000000011",
      profileId: "00000000-0000-4000-8000-000000000010",
      shopId: "00000000-0000-4000-8000-000000000001",
    };
    await executeTechnicianCopilotAction({
      identity,
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000301",
    });
    await executeTechnicianCopilotAction({
      identity,
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000301",
    });

    const first = mocks.sendCopilotServerCommand.mock.calls[0][0];
    const replay = mocks.sendCopilotServerCommand.mock.calls[1][0];
    expect(first).toMatchObject({
      ...identity,
      action: "job.action",
      args: {
        sessionId: "00000000-0000-4000-8000-000000000300",
        workOrderLineId: workOrder.lines[0].id,
        jobAction: "job.start",
      },
    });
    expect(first.args.operationId).toBe(replay.args.operationId);
    expect(first.args.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("preserves the existing correction when voice updates only the cause", async () => {
    const prepared = prepareTechnicianCopilotAction({
      action: {
        type: "job.story.save",
        workOrderLineId: workOrder.lines[0].id,
        cause: "Inner pad seized in the bracket",
        correction: null,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    const result = await executeTechnicianCopilotAction({
      identity: {
        authUserId: "00000000-0000-4000-8000-000000000011",
        profileId: "00000000-0000-4000-8000-000000000010",
        shopId: "00000000-0000-4000-8000-000000000001",
      },
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000302",
    });

    expect(mocks.sendCopilotServerCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "job.action",
        args: expect.objectContaining({
          jobAction: "job.story.save",
          workOrderLineId: workOrder.lines[0].id,
          cause: "Inner pad seized in the bracket",
          correction: "Replace front brake pads",
          expectedLineUpdatedAt: workOrder.lines[0].updatedAt,
        }),
      }),
    );
    expect(result.reply).toBe("Saved the cause for Brake inspection.");
  });

  it("replays the same durable operation after an unknown transport outcome", async () => {
    const prepared = prepareTechnicianCopilotAction({
      action: { type: "job.start", workOrderLineId: workOrder.lines[0].id },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    mocks.sendCopilotServerCommand
      .mockRejectedValueOnce(new Error("Network response was lost"))
      .mockResolvedValueOnce({ ok: true, idempotent: true });

    const result = await executeTechnicianCopilotAction({
      identity: {
        authUserId: "00000000-0000-4000-8000-000000000011",
        profileId: "00000000-0000-4000-8000-000000000010",
        shopId: "00000000-0000-4000-8000-000000000001",
      },
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000309",
    });

    expect(result.ok).toBe(true);
    expect(mocks.sendCopilotServerCommand).toHaveBeenCalledTimes(2);
    expect(mocks.sendCopilotServerCommand.mock.calls[0][0]).toEqual(
      mocks.sendCopilotServerCommand.mock.calls[1][0],
    );
  });

  it("returns a safe retry response when another device changed the story", async () => {
    const prepared = prepareTechnicianCopilotAction({
      action: {
        type: "job.story.save",
        workOrderLineId: workOrder.lines[0].id,
        cause: "Inner pad seized in the bracket",
        correction: null,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    mocks.sendCopilotServerCommand.mockRejectedValue(
      new Error("OFFLINE_VERSION_CONFLICT: server-only details"),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeTechnicianCopilotAction({
      identity: {
        authUserId: "00000000-0000-4000-8000-000000000011",
        profileId: "00000000-0000-4000-8000-000000000010",
        shopId: "00000000-0000-4000-8000-000000000001",
      },
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000303",
    });
    errorLog.mockRestore();

    expect(result).toEqual({
      ok: false,
      reply:
        "That job story changed on another device. Review the latest cause and correction, then try again.",
    });
    expect(result.reply).not.toContain("server-only details");
  });
});
