import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyJobPunchTransition: vi.fn(),
  upsertMenuRepairItemFromCompletedLine: vi.fn(),
}));

vi.mock("@/features/work-orders/server/applyJobPunchTransition", () => ({
  applyJobPunchTransition: mocks.applyJobPunchTransition,
}));

vi.mock(
  "@/features/menu-repair-items/server/upsertMenuRepairItemFromCompletedLine",
  () => ({
    upsertMenuRepairItemFromCompletedLine:
      mocks.upsertMenuRepairItemFromCompletedLine,
  }),
);

import { completeWorkOrderLine } from "@/features/work-orders/server/completeWorkOrderLine";

function completionClient() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: "line-1", shop_id: "shop-1" },
    error: null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, eq, maybeSingle };
}

describe("canonical work-order line completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyJobPunchTransition.mockResolvedValue({
      ok: true,
      payload: { action: "finish" },
    });
    mocks.upsertMenuRepairItemFromCompletedLine.mockResolvedValue(undefined);
  });

  it("runs idempotent repair learning after the canonical finish succeeds", async () => {
    const { client } = completionClient();
    const result = await completeWorkOrderLine({
      supabase: client,
      lineId: "line-1",
      technicianId: "profile-tech",
      actorUserId: "auth-tech",
      operationKey: "finish-key",
      cause: "Failed bearing",
      correction: "Replaced bearing",
    });

    expect(mocks.applyJobPunchTransition).toHaveBeenCalledWith({
      supabase: client,
      lineId: "line-1",
      action: "finish",
      technicianId: "profile-tech",
      options: {
        operationKey: "finish-key",
        finish: {
          cause: "Failed bearing",
          correction: "Replaced bearing",
        },
      },
    });
    expect(mocks.upsertMenuRepairItemFromCompletedLine).toHaveBeenCalledWith({
      supabase: client,
      shopId: "shop-1",
      workOrderLineId: "line-1",
      actorUserId: "auth-tech",
    });
    expect(result).toMatchObject({
      ok: true,
      menuRepairLearning: { ok: true },
    });
  });

  it("keeps completion successful when repair learning fails", async () => {
    const { client } = completionClient();
    mocks.upsertMenuRepairItemFromCompletedLine.mockRejectedValue(
      new Error("learning unavailable"),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await completeWorkOrderLine({
      supabase: client,
      lineId: "line-1",
      technicianId: "profile-tech",
      actorUserId: "auth-tech",
      operationKey: "finish-key",
    });
    errorLog.mockRestore();

    expect(result).toMatchObject({
      ok: true,
      menuRepairLearning: { ok: false },
    });
  });

  it("does not learn from a completion that did not commit", async () => {
    const { client } = completionClient();
    mocks.applyJobPunchTransition.mockResolvedValue({
      ok: false,
      status: 409,
      error: "INSPECTION_COMPLETION_REQUIRED",
    });

    const result = await completeWorkOrderLine({
      supabase: client,
      lineId: "line-1",
      technicianId: "profile-tech",
      actorUserId: "auth-tech",
      operationKey: "finish-key",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "INSPECTION_COMPLETION_REQUIRED",
    });
    expect(mocks.upsertMenuRepairItemFromCompletedLine).not.toHaveBeenCalled();
  });
});
