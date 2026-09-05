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
  selectNextTechnicianWorkLine,
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

  it("selects in-progress work before awaiting, held, or waiting-parts lines", () => {
    const selected = selectNextTechnicianWorkLine([
      { ...workOrder.lines[0], status: "waiting_parts", priority: 1 },
      { ...workOrder.lines[0], id: "line-awaiting", status: "awaiting", priority: 1 },
      { ...workOrder.lines[1], id: "line-running", status: "in_progress", priority: 9 },
      { ...workOrder.lines[0], id: "line-held", status: "on_hold", priority: 0 },
    ]);

    expect(selected?.id).toBe("line-running");
  });

  it("uses the repair session's active line when natural language omits an ID", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "job.start", workOrderLineId: null },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });

    expect(prepared).toMatchObject({
      kind: "execute",
      line: { id: workOrder.lines[0].id },
    });
  });

  it("asks which line instead of guessing when multiple assigned lines are possible", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "job.hold", workOrderLineId: null, reason: "Awaiting parts" },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
      supabase: {} as never,
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "Which job line do you mean: Brake inspection, Road test?",
    });
  });

  it("rejects a model-selected line outside the technician's assigned work", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.start",
        workOrderLineId: "00000000-0000-4000-8000-000000009999",
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });

    expect(prepared).toMatchObject({
      kind: "reply",
      reply: expect.stringContaining("no longer assigned"),
    });
  });

  it("does not release a line that is no longer on hold", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.release_hold",
        workOrderLineId: workOrder.lines[0].id,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "Brake inspection is not currently on hold.",
    });
  });

  it("requires the technician to be punched into a job before completing it", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.complete",
        workOrderLineId: workOrder.lines[0].id,
        cause: null,
        correction: null,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "Start Brake inspection before completing it.",
    });
  });

  it("asks only for the missing story facts before completing an active job", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.complete",
        workOrderLineId: workOrder.lines[1].id,
        cause: "Loose rear U-joint",
        correction: null,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[1].id,
      supabase: {} as never,
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "What correction should I record before completing Road test?",
    });
  });

  it("starts through the canonical atomic job-labor service with a stable replay key", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "job.start", workOrderLineId: workOrder.lines[0].id },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    const identity = {
      authUserId: "00000000-0000-4000-8000-000000000011",
      profileId: "00000000-0000-4000-8000-000000000010",
      shopId: "00000000-0000-4000-8000-000000000001",
      supabase: {} as never,
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
      authUserId: identity.authUserId,
      profileId: identity.profileId,
      shopId: identity.shopId,
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
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.story.save",
        workOrderLineId: workOrder.lines[0].id,
        cause: "Inner pad seized in the bracket",
        correction: null,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    const result = await executeTechnicianCopilotAction({
      identity: {
        authUserId: "00000000-0000-4000-8000-000000000011",
        profileId: "00000000-0000-4000-8000-000000000010",
        shopId: "00000000-0000-4000-8000-000000000001",
        supabase: {} as never,
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

  it("completes through the canonical finish transition with the current story and version", async () => {
    const activeWorkOrder: TechnicianWorkCandidate = {
      ...workOrder,
      lines: workOrder.lines.map((line, index) =>
        index === 0 ? { ...line, status: "in_progress" } : line,
      ),
    };
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.complete",
        workOrderLineId: activeWorkOrder.lines[0].id,
        cause: null,
        correction: null,
      },
      activeWorkOrder,
      assignedWork: [activeWorkOrder],
      activeWorkOrderLineId: activeWorkOrder.lines[0].id,
      supabase: {} as never,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    const result = await executeTechnicianCopilotAction({
      identity: {
        authUserId: "00000000-0000-4000-8000-000000000011",
        profileId: "00000000-0000-4000-8000-000000000010",
        shopId: "00000000-0000-4000-8000-000000000001",
        supabase: {} as never,
      },
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000310",
    });

    expect(mocks.sendCopilotServerCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "job.action",
        args: expect.objectContaining({
          jobAction: "job.complete",
          workOrderLineId: activeWorkOrder.lines[0].id,
          cause: "Front pads below specification",
          correction: "Replace front brake pads",
          expectedLineUpdatedAt: activeWorkOrder.lines[0].updatedAt,
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      reply: "Completed Brake inspection and stopped your job timer.",
      eventLabel: "Completed job",
      eventDetail: "Brake inspection",
    });
  });

  it("replays the same durable operation after an unknown transport outcome", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "job.start", workOrderLineId: workOrder.lines[0].id },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
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
        supabase: {} as never,
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
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.story.save",
        workOrderLineId: workOrder.lines[0].id,
        cause: "Inner pad seized in the bracket",
        correction: null,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
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
        supabase: {} as never,
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

  it("requires explicit inspection signing without exposing database details", async () => {
    const activeWorkOrder: TechnicianWorkCandidate = {
      ...workOrder,
      lines: workOrder.lines.map((line, index) =>
        index === 0 ? { ...line, status: "in_progress" } : line,
      ),
    };
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.complete",
        workOrderLineId: activeWorkOrder.lines[0].id,
        cause: null,
        correction: null,
      },
      activeWorkOrder,
      assignedWork: [activeWorkOrder],
      activeWorkOrderLineId: activeWorkOrder.lines[0].id,
      supabase: {} as never,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    mocks.sendCopilotServerCommand.mockRejectedValue(
      new Error(
        "INSPECTION_COMPLETION_REQUIRED: internal inspection identifier 123",
      ),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeTechnicianCopilotAction({
      identity: {
        authUserId: "00000000-0000-4000-8000-000000000011",
        profileId: "00000000-0000-4000-8000-000000000010",
        shopId: "00000000-0000-4000-8000-000000000001",
        supabase: {} as never,
      },
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000311",
    });
    errorLog.mockRestore();

    expect(result).toEqual({
      ok: false,
      reply: "Complete and sign the inspection before I can finish that job.",
    });
    expect(result.reply).not.toContain("123");
  });
});
