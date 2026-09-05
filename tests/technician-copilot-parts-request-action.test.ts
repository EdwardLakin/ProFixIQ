import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TechnicianWorkCandidate } from "@/features/copilot/technician/server/assignedWork";

const mocks = vi.hoisted(() => ({
  sendCopilotServerCommand: vi.fn(),
}));

vi.mock("@/features/copilot/technician/server/transport", () => ({
  sendCopilotServerCommand: mocks.sendCopilotServerCommand,
}));

import {
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
  lineIds: ["00000000-0000-4000-8000-000000000201"],
  lines: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      complaint: "Brake inspection",
      description: null,
      status: "in_progress",
      cause: null,
      correction: null,
      holdReason: null,
      priority: 2,
      createdAt: "2026-08-15T12:00:00Z",
      updatedAt: "2026-08-15T12:05:00Z",
    },
  ],
  lineComplaints: ["Brake inspection"],
};

const identity = {
  authUserId: "00000000-0000-4000-8000-000000000011",
  profileId: "00000000-0000-4000-8000-000000000010",
  shopId: "00000000-0000-4000-8000-000000000001",
};

describe("job.parts.request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for parts and quantities instead of requesting nothing", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.parts.request",
        workOrderLineId: workOrder.lines[0].id,
        items: [],
        notes: null,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });

    expect(prepared).toEqual({
      kind: "reply",
      reply: "What parts and quantities do you need for Brake inspection?",
    });
  });

  it("submits through the same atomic RPC the manual Request Parts screen uses, not the job-action command", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { requestId: "req-1" }, error: null });
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.parts.request",
        workOrderLineId: workOrder.lines[0].id,
        items: [
          { description: "front brake pads", qty: 2 },
          { description: "caliper", qty: 1 },
        ],
        notes: "Needed before road test",
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    const result = await executeTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000401",
    });

    expect(rpc).toHaveBeenCalledWith(
      "materialize_offline_parts_request_draft_atomic",
      expect.objectContaining({
        p_shop_id: identity.shopId,
        p_actor_user_id: identity.authUserId,
        p_work_order_id: workOrder.id,
        p_work_order_line_id: workOrder.lines[0].id,
        p_payload: {
          notes: "Needed before road test",
          items: [
            {
              description: "front brake pads",
              qty: 2,
              partNumber: null,
              manufacturer: null,
            },
            {
              description: "caliper",
              qty: 1,
              partNumber: null,
              manufacturer: null,
            },
          ],
        },
      }),
    );
    expect(result).toEqual({
      ok: true,
      reply: "Requested 2 front brake pads, 1 caliper for Brake inspection.",
      eventLabel: "Requested parts",
      eventDetail: "Brake inspection: 2 front brake pads, 1 caliper",
    });
    expect(mocks.sendCopilotServerCommand).not.toHaveBeenCalled();
  });

  it("returns a safe reply and never leaks the raw database error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Technician is not assigned to this work-order line." },
    });
    const prepared = await prepareTechnicianCopilotAction({
      action: {
        type: "job.parts.request",
        workOrderLineId: workOrder.lines[0].id,
        items: [{ description: "oil filter", qty: 1 }],
        notes: null,
      },
      activeWorkOrder: workOrder,
      assignedWork: [workOrder],
      activeWorkOrderLineId: workOrder.lines[0].id,
      supabase: {} as never,
    });
    if (prepared.kind !== "execute") throw new Error("Expected executable action");

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      prepared,
      operationId: "00000000-0000-5000-a000-000000000402",
    });
    errorLog.mockRestore();

    expect(result).toEqual({
      ok: false,
      reply: "You're not assigned to Brake inspection, so I can't request parts for it.",
    });
  });
});
