import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TechnicianWorkCandidate } from "@/features/copilot/technician/server/assignedWork";

const mocks = vi.hoisted(() => ({
  sendCopilotServerCommand: vi.fn(),
}));

vi.mock("@/features/copilot/technician/server/transport", () => ({
  sendCopilotServerCommand: mocks.sendCopilotServerCommand,
}));

import {
  executeBoundTechnicianCopilotAction,
  prepareTechnicianCopilotAction,
  type BoundTechnicianCopilotAction,
} from "@/features/copilot/technician/server/actions";

function fakeSupabase(templateId: string | null) {
  return {
    from: (table: string) => {
      if (table !== "work_order_lines") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { inspection_template_id: templateId },
              error: null,
            }),
          }),
        }),
      };
    },
  } as never;
}

const cvipLine = {
  id: "00000000-0000-4000-8000-000000000201",
  complaint: "CVIP inspection",
  description: null,
  status: "awaiting",
  cause: null,
  correction: null,
  holdReason: null,
  priority: 1,
  createdAt: "2026-08-15T12:00:00Z",
  updatedAt: "2026-08-15T12:05:00Z",
};

const oilChangeLine = {
  id: "00000000-0000-4000-8000-000000000202",
  complaint: "Oil change and inspection",
  description: null,
  status: "in_progress",
  cause: null,
  correction: null,
  holdReason: null,
  priority: 2,
  createdAt: "2026-08-15T12:01:00Z",
  updatedAt: "2026-08-15T12:06:00Z",
};

const workOrder: TechnicianWorkCandidate = {
  id: "00000000-0000-4000-8000-000000000100",
  customId: "EL000005",
  status: "in_progress",
  concern: "Annual service",
  description: null,
  vehicleYear: 2019,
  vehicleMake: "Freightliner",
  vehicleModel: "Cascadia",
  vehicleVin: null,
  vehicleUnitNumber: null,
  lineIds: [cvipLine.id, oilChangeLine.id],
  lines: [cvipLine, oilChangeLine],
  lineComplaints: ["CVIP inspection", "Oil change and inspection"],
};

const identity = {
  authUserId: "00000000-0000-4000-8000-000000000011",
  profileId: "00000000-0000-4000-8000-000000000010",
  shopId: "00000000-0000-4000-8000-000000000001",
};

describe("inspection.start: resolving the target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks which line when no workOrderLineId is given and several are assigned", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.start", workOrderLineId: null },
      activeWorkOrder: null,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase("template-1"),
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "Which job line do you mean: CVIP inspection, Oil change and inspection?",
    });
  });

  it("says so when nothing is assigned at all", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.start", workOrderLineId: null },
      activeWorkOrder: null,
      assignedWork: [],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase("template-1"),
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "You don't have an assigned job line to inspect right now.",
    });
  });

  it("declines when the line has no inspection template attached", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.start", workOrderLineId: cvipLine.id },
      activeWorkOrder: null,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase(null),
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply:
        "CVIP inspection doesn't have an inspection template attached yet. Build or attach a custom inspection first.",
    });
  });

  it("resolves to execute when the line is already in progress", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.start", workOrderLineId: oilChangeLine.id },
      activeWorkOrder: null,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase("template-1"),
    });

    expect(prepared).toMatchObject({
      kind: "execute",
      action: { type: "inspection.start", workOrderLineId: oilChangeLine.id },
      templateId: "template-1",
    });
  });

  it("resolves to execute when nothing else is in progress", async () => {
    const idleWorkOrder: TechnicianWorkCandidate = {
      ...workOrder,
      lines: [cvipLine, { ...oilChangeLine, status: "awaiting" }],
    };
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.start", workOrderLineId: cvipLine.id },
      activeWorkOrder: null,
      assignedWork: [idleWorkOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase("template-1"),
    });

    expect(prepared).toMatchObject({
      kind: "execute",
      templateId: "template-1",
      line: { id: cvipLine.id },
    });
  });

  it("asks the technician to hold or finish their current job instead of silently switching", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.start", workOrderLineId: cvipLine.id },
      activeWorkOrder: null,
      assignedWork: [workOrder], // oilChangeLine is in_progress
      activeWorkOrderLineId: null,
      supabase: fakeSupabase("template-1"),
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply:
        "You're currently working on Oil change and inspection. Put that on hold or finish it, then ask me to start CVIP inspection.",
    });
  });

  it("finds the target line even when it isn't on the currently active work order", async () => {
    const otherWorkOrder: TechnicianWorkCandidate = {
      ...workOrder,
      id: "00000000-0000-4000-8000-000000000900",
      lines: [{ ...cvipLine, id: "00000000-0000-4000-8000-000000000900" }],
      lineIds: ["00000000-0000-4000-8000-000000000900"],
    };
    const idleWorkOrder: TechnicianWorkCandidate = {
      ...workOrder,
      lines: [{ ...oilChangeLine, status: "awaiting" }],
    };
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "inspection.start",
        workOrderLineId: "00000000-0000-4000-8000-000000000900",
      },
      activeWorkOrder: idleWorkOrder,
      assignedWork: [idleWorkOrder, otherWorkOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase("template-1"),
    });

    expect(prepared).toMatchObject({
      kind: "execute",
      workOrder: { id: otherWorkOrder.id },
    });
  });
});

describe("inspection.start: execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendCopilotServerCommand.mockResolvedValue({ ok: true });
  });

  const bound: BoundTechnicianCopilotAction = {
    action: { type: "inspection.start", workOrderLineId: cvipLine.id },
    lineId: cvipLine.id,
    lineLabel: "CVIP inspection",
    lineCause: null,
    lineCorrection: null,
    lineUpdatedAt: cvipLine.updatedAt,
    workOrderId: workOrder.id,
    templateId: "template-1",
  };

  it("punches in through the same job.action command as job.start, then hands back the navigation target", async () => {
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: {} as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000501",
    });

    expect(mocks.sendCopilotServerCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "job.action",
        args: expect.objectContaining({
          jobAction: "job.start",
          workOrderLineId: cvipLine.id,
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      reply: "Opening the inspection for CVIP inspection.",
      eventLabel: "Started inspection",
      eventDetail: "CVIP inspection",
      clientAction: {
        workOrderId: workOrder.id,
        workOrderLineId: cvipLine.id,
        templateId: "template-1",
      },
    });
  });

  it("treats 'already has active labor on this line' as success, not a conflict", async () => {
    mocks.sendCopilotServerCommand.mockRejectedValue(
      new Error("Technician already has active labor on this line."),
    );

    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: {} as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000502",
    });

    expect(result.ok).toBe(true);
    expect(result.clientAction).toEqual({
      workOrderId: workOrder.id,
      workOrderLineId: cvipLine.id,
      templateId: "template-1",
    });
  });

  it("still fails for a real conflict on a different line", async () => {
    mocks.sendCopilotServerCommand.mockRejectedValue(
      new Error("Technician already has an active job punch."),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: {} as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000503",
    });
    errorLog.mockRestore();

    expect(result.ok).toBe(false);
    expect(result.clientAction).toBeUndefined();
  });

  it("fails safely when the bound action is missing its resolved template or work order", async () => {
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: {} as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound: { ...bound, templateId: null },
      operationId: "00000000-0000-5000-a000-000000000504",
    });

    expect(result.ok).toBe(false);
    expect(mocks.sendCopilotServerCommand).not.toHaveBeenCalled();
  });
});
