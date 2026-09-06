import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TechnicianWorkCandidate } from "@/features/copilot/technician/server/assignedWork";

const mocks = vi.hoisted(() => ({
  insertPrioritizedJobsFromInspection: vi.fn(),
  publishInspectionPdf: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock(
  "@/features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection",
  () => ({
    insertPrioritizedJobsFromInspection: mocks.insertPrioritizedJobsFromInspection,
  }),
);
vi.mock("@/features/inspections/server/publishInspectionPdf", () => ({
  publishInspectionPdf: mocks.publishInspectionPdf,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

import {
  executeBoundTechnicianCopilotAction,
  prepareTechnicianCopilotAction,
  type BoundTechnicianCopilotAction,
} from "@/features/copilot/technician/server/actions";

function inspectionsChain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn(() => obj);
  obj.eq = vi.fn(() => obj);
  obj.maybeSingle = vi.fn(async () => result);
  return obj;
}

function fakeSupabase(params: {
  inspection: {
    id: string;
    work_order_id: string | null;
    vehicle_id: string | null;
    summary: unknown;
  } | null;
  rpc?: ReturnType<typeof vi.fn>;
}) {
  const rpc = params.rpc ?? vi.fn(async () => ({ data: { ok: true }, error: null }));
  const from = vi.fn((table: string) => {
    if (table !== "inspections") throw new Error(`unexpected table ${table}`);
    return inspectionsChain({ data: params.inspection, error: null });
  });
  return { from, rpc } as never;
}

const cvipLine = {
  id: "00000000-0000-4000-8000-000000000201",
  complaint: "CVIP inspection",
  description: null,
  status: "in_progress",
  cause: null,
  correction: null,
  holdReason: null,
  priority: 1,
  createdAt: "2026-08-15T12:00:00Z",
  updatedAt: "2026-08-15T12:05:00Z",
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
  lineIds: [cvipLine.id],
  lines: [cvipLine],
  lineComplaints: ["CVIP inspection"],
};

const identity = {
  authUserId: "00000000-0000-4000-8000-000000000011",
  profileId: "00000000-0000-4000-8000-000000000010",
  shopId: "00000000-0000-4000-8000-000000000001",
};

const inspectionId = "00000000-0000-4000-8000-000000000700";

describe("inspection.complete: resolving the target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks which line when several are assigned and none was named", async () => {
    const otherLine = { ...cvipLine, id: "00000000-0000-4000-8000-000000000202", complaint: "Oil change" };
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.complete", workOrderLineId: null },
      activeWorkOrder: null,
      assignedWork: [{ ...workOrder, lines: [cvipLine, otherLine] }],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase({ inspection: null }),
    });
    expect(prepared).toEqual({
      kind: "reply",
      reply: "Which job line do you mean: CVIP inspection, Oil change?",
    });
  });

  it("says so when nothing is assigned at all", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.complete", workOrderLineId: null },
      activeWorkOrder: null,
      assignedWork: [],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase({ inspection: null }),
    });
    expect(prepared).toEqual({
      kind: "reply",
      reply: "You don't have an assigned job line to sign an inspection for right now.",
    });
  });

  it("declines when no inspection has been started for the line", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.complete", workOrderLineId: cvipLine.id },
      activeWorkOrder: null,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase({ inspection: null }),
    });
    expect(prepared).toEqual({
      kind: "reply",
      reply: "There's no inspection started for CVIP inspection yet. Ask me to start it first.",
    });
  });

  it("declines when the inspection has no saved progress yet", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.complete", workOrderLineId: cvipLine.id },
      activeWorkOrder: null,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase({
        inspection: {
          id: inspectionId,
          work_order_id: workOrder.id,
          vehicle_id: null,
          summary: { syncRevision: 0 },
        },
      }),
    });
    expect(prepared).toEqual({
      kind: "reply",
      reply:
        "There's no saved progress on CVIP inspection's inspection yet. Fill in at least one item before I can sign it.",
    });
  });

  it("declines when the inspection isn't attached to a work order", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.complete", workOrderLineId: cvipLine.id },
      activeWorkOrder: null,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase({
        inspection: {
          id: inspectionId,
          work_order_id: null,
          vehicle_id: null,
          summary: { syncRevision: 5 },
        },
      }),
    });
    expect(prepared).toEqual({
      kind: "reply",
      reply:
        "CVIP inspection's inspection isn't attached to a work order, so I can't submit its findings. Refresh and try again.",
    });
  });

  it("resolves to execute with the inspection context when everything checks out", async () => {
    const prepared = await prepareTechnicianCopilotAction({
      action: { type: "inspection.complete", workOrderLineId: cvipLine.id },
      activeWorkOrder: null,
      assignedWork: [workOrder],
      activeWorkOrderLineId: null,
      supabase: fakeSupabase({
        inspection: {
          id: inspectionId,
          work_order_id: workOrder.id,
          vehicle_id: "00000000-0000-4000-8000-000000000900",
          summary: { syncRevision: 7 },
        },
      }),
    });
    expect(prepared).toMatchObject({
      kind: "execute",
      action: { type: "inspection.complete", workOrderLineId: cvipLine.id },
      inspectionId,
      inspectionWorkOrderId: workOrder.id,
      inspectionVehicleId: "00000000-0000-4000-8000-000000000900",
      inspectionSyncRevision: 7,
    });
  });
});

describe("inspection.complete: execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertPrioritizedJobsFromInspection.mockResolvedValue({ ok: true });
  });

  const bound: BoundTechnicianCopilotAction = {
    action: { type: "inspection.complete", workOrderLineId: cvipLine.id },
    lineId: cvipLine.id,
    lineLabel: "CVIP inspection",
    lineCause: null,
    lineCorrection: null,
    lineUpdatedAt: cvipLine.updatedAt,
    workOrderId: workOrder.id,
    inspectionId,
    inspectionWorkOrderId: workOrder.id,
    inspectionVehicleId: null,
    inspectionSyncRevision: 7,
  };

  function adminWithPdfAlreadyPublished() {
    const admin = { from: vi.fn() };
    admin.from.mockImplementation(() =>
      inspectionsChain({
        data: {
          id: inspectionId,
          shop_id: identity.shopId,
          work_order_id: workOrder.id,
          work_order_line_id: cvipLine.id,
          summary: { syncRevision: 7 },
          sync_revision: 7,
          pdf_storage_path: "already/published.pdf",
        },
        error: null,
      }),
    );
    mocks.createAdminSupabase.mockReturnValue(admin);
  }

  it("signs off an inspection whose report is already published", async () => {
    adminWithPdfAlreadyPublished();
    const rpc = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000601",
    });

    expect(mocks.insertPrioritizedJobsFromInspection).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionId,
        workOrderId: workOrder.id,
        vehicleId: null,
        userId: identity.authUserId,
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "sign_inspection",
      expect.objectContaining({
        p_inspection_id: inspectionId,
        p_role: "technician",
        p_expected_sync_revision: 7,
      }),
    );
    expect(mocks.publishInspectionPdf).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      reply: "Signed off CVIP inspection's inspection.",
      eventLabel: "Signed inspection",
      eventDetail: "CVIP inspection",
    });
  });

  it("publishes and attaches the report when none exists yet", async () => {
    const admin = { from: vi.fn() };
    admin.from.mockImplementation(() =>
      inspectionsChain({
        data: {
          id: inspectionId,
          shop_id: identity.shopId,
          work_order_id: workOrder.id,
          work_order_line_id: cvipLine.id,
          summary: { syncRevision: 7 },
          sync_revision: 7,
          pdf_storage_path: null,
        },
        error: null,
      }),
    );
    mocks.createAdminSupabase.mockReturnValue(admin);
    mocks.publishInspectionPdf.mockResolvedValue({
      path: "shops/x/inspections/y.pdf",
      sha256: "abc123",
      reportUrl: "/api/inspections/x/report/pdf",
    });

    const rpc = vi.fn(async (name: string) => {
      if (name === "attach_signed_inspection_pdf_atomic") {
        return { data: { ok: true }, error: null };
      }
      return { data: { ok: true }, error: null };
    });

    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000602",
    });

    expect(mocks.publishInspectionPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        workOrderId: workOrder.id,
        workOrderLineId: cvipLine.id,
        inspectionId,
        syncRevision: 7,
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "attach_signed_inspection_pdf_atomic",
      expect.objectContaining({
        p_inspection_id: inspectionId,
        p_work_order_line_id: cvipLine.id,
        p_actor_user_id: identity.authUserId,
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.reply).toBe("Signed off CVIP inspection's inspection.");
  });

  it("declines when the technician has no saved signature on file", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "No valid saved technician signature exists in this profile." },
    }));
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000603",
    });
    expect(result).toEqual({
      ok: false,
      reply:
        "You don't have a saved signature on file yet. Add one in your tech settings, then ask me to sign CVIP inspection's inspection again.",
    });
    expect(mocks.publishInspectionPdf).not.toHaveBeenCalled();
  });

  it("asks to sign again when the inspection changed on another device", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        message:
          "Inspection changed on another device before signing. Review the latest version and sign again.",
      },
    }));
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000604",
    });
    expect(result).toEqual({
      ok: false,
      reply: "CVIP inspection's inspection changed since I last checked it. Ask me to sign it again.",
    });
  });

  it("treats 'already signed for that role' as a truthful success, not a failure", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "This inspection revision is already signed for that role." },
    }));
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000605",
    });
    expect(result).toEqual({
      ok: true,
      reply: "CVIP inspection's inspection is already signed off.",
      eventLabel: "Signed inspection",
      eventDetail: "CVIP inspection",
    });
  });

  it("still reports success but flags the report when publishing fails after a real sign", async () => {
    const admin = { from: vi.fn() };
    admin.from.mockImplementation(() =>
      inspectionsChain({ data: null, error: { message: "boom" } }),
    );
    mocks.createAdminSupabase.mockReturnValue(admin);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const rpc = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000606",
    });
    errorLog.mockRestore();

    expect(result).toEqual({
      ok: true,
      reply:
        "Signed CVIP inspection's inspection, but the report couldn't be published yet. Ask me to sign it again to retry that.",
      eventLabel: "Signed inspection",
      eventDetail: "CVIP inspection",
    });
  });

  it("declines when the finding import fails, before ever attempting to sign", async () => {
    mocks.insertPrioritizedJobsFromInspection.mockResolvedValue({
      ok: false,
      error: "Unable to submit findings.",
    });
    const rpc = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound,
      operationId: "00000000-0000-5000-a000-000000000607",
    });
    expect(result).toEqual({
      ok: false,
      reply: "I couldn't submit CVIP inspection's inspection findings. Refresh and try again.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails safely when the bound action is missing its resolved inspection context", async () => {
    const rpc = vi.fn();
    const result = await executeBoundTechnicianCopilotAction({
      identity: { ...identity, supabase: { rpc } as never },
      sessionId: "00000000-0000-4000-8000-000000000300",
      bound: { ...bound, inspectionId: null },
      operationId: "00000000-0000-5000-a000-000000000608",
    });
    expect(result.ok).toBe(false);
    expect(mocks.insertPrioritizedJobsFromInspection).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
