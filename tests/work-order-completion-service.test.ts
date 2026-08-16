import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyJobPunchTransition: vi.fn(),
}));

vi.mock("@/features/work-orders/server/applyJobPunchTransition", () => ({
  applyJobPunchTransition: mocks.applyJobPunchTransition,
}));

import { completeWorkOrderLine } from "@/features/work-orders/server/completeWorkOrderLine";

describe("canonical work-order line completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyJobPunchTransition.mockResolvedValue({
      ok: true,
      payload: { action: "finish", shop_id: "shop-1" },
    });
  });

  it("returns after canonical finish while durable repair learning stays pending", async () => {
    const client = {} as never;
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
    expect(result).toMatchObject({
      ok: true,
      menuRepairLearning: { ok: false, state: "pending" },
    });
  });

  it("does not report queued learning when canonical completion fails", async () => {
    mocks.applyJobPunchTransition.mockResolvedValue({
      ok: false,
      status: 409,
      error: "INSPECTION_COMPLETION_REQUIRED",
    });

    const result = await completeWorkOrderLine({
      supabase: {} as never,
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
  });
});
