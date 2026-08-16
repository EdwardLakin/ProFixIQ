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

import {
  completeWorkOrderLine,
  learnFromCompletedWorkOrderLine,
} from "@/features/work-orders/server/completeWorkOrderLine";

function completionClient() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: "line-1", shop_id: "shop-1" },
    error: null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_completed_repair_learning_atomic") {
      return {
        data: { claimed: true, completed: false, inProgress: false },
        error: null,
      };
    }
    if (name === "finish_completed_repair_learning_atomic") {
      return { data: { completed: true }, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  return {
    client: { from, rpc } as never,
    from,
    select,
    eq,
    maybeSingle,
    rpc,
  };
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
    const { client, rpc } = completionClient();
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
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "claim_completed_repair_learning_atomic",
      expect.objectContaining({
        p_shop_id: "shop-1",
        p_work_order_line_id: "line-1",
        p_actor_user_id: "auth-tech",
        p_operation_key: "finish-key",
        p_lease_token: expect.any(String),
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finish_completed_repair_learning_atomic",
      expect.objectContaining({
        p_succeeded: true,
        p_lease_token: expect.any(String),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      menuRepairLearning: { ok: true },
    });
  });

  it("keeps completion successful when repair learning fails", async () => {
    const { client, rpc } = completionClient();
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
    expect(rpc).toHaveBeenLastCalledWith(
      "finish_completed_repair_learning_atomic",
      expect.objectContaining({ p_succeeded: false }),
    );
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

  it("lets only one concurrent replay perform repair learning", async () => {
    const { client, rpc } = completionClient();
    let claimCount = 0;
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_completed_repair_learning_atomic") {
        claimCount += 1;
        return claimCount === 1
          ? {
              data: { claimed: true, completed: false, inProgress: false },
              error: null,
            }
          : {
              data: { claimed: false, completed: false, inProgress: true },
              error: null,
            };
      }
      return { data: { completed: true }, error: null };
    });

    let releaseLearning!: () => void;
    mocks.upsertMenuRepairItemFromCompletedLine.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseLearning = resolve;
        }),
    );

    const first = learnFromCompletedWorkOrderLine({
      supabase: client,
      lineId: "line-1",
      actorUserId: "auth-tech",
      operationKey: "finish-key",
    });
    await vi.waitFor(() => {
      expect(mocks.upsertMenuRepairItemFromCompletedLine).toHaveBeenCalledTimes(1);
    });
    const replay = await learnFromCompletedWorkOrderLine({
      supabase: client,
      lineId: "line-1",
      actorUserId: "auth-tech",
      operationKey: "finish-key",
    });
    releaseLearning();
    const completed = await first;

    expect(replay).toEqual({ ok: true });
    expect(completed).toEqual({ ok: true });
    expect(mocks.upsertMenuRepairItemFromCompletedLine).toHaveBeenCalledTimes(1);
  });
});
