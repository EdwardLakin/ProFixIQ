import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertMenuRepairItemFromCompletedLine: vi.fn(),
}));

vi.mock(
  "@/features/menu-repair-items/server/upsertMenuRepairItemFromCompletedLine",
  () => ({
    upsertMenuRepairItemFromCompletedLine:
      mocks.upsertMenuRepairItemFromCompletedLine,
  }),
);

import { processCompletedRepairLearningQueue } from "@/features/work-orders/server/processCompletedRepairLearningQueue";

describe("completed repair learning queue", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("processes durable claims and releases failed work for retry", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_completed_repair_learning_batch") {
        return {
          data: [
            {
              shop_id: "shop-1",
              work_order_line_id: "line-1",
              actor_user_id: "user-1",
              lease_token: "lease-1",
            },
            {
              shop_id: "shop-1",
              work_order_line_id: "line-2",
              actor_user_id: null,
              lease_token: "lease-2",
            },
          ],
          error: null,
        };
      }
      return { data: { completed: true }, error: null };
    });
    const admin = { rpc } as never;
    mocks.upsertMenuRepairItemFromCompletedLine.mockImplementation(
      ({ workOrderLineId }: { workOrderLineId: string }) =>
        workOrderLineId === "line-2"
          ? Promise.reject(new Error("learning unavailable"))
          : Promise.resolve(),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processCompletedRepairLearningQueue(
      admin,
      10,
      "worker-1",
    );
    errorLog.mockRestore();

    expect(rpc).toHaveBeenCalledWith(
      "claim_completed_repair_learning_batch",
      {
        p_worker_id: "worker-1",
        p_limit: 10,
        p_lease_seconds: 600,
      },
    );
    expect(rpc).toHaveBeenCalledWith(
      "finish_completed_repair_learning_worker",
      expect.objectContaining({
        p_work_order_line_id: "line-1",
        p_lease_token: "lease-1",
        p_succeeded: true,
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "finish_completed_repair_learning_worker",
      expect.objectContaining({
        p_work_order_line_id: "line-2",
        p_lease_token: "lease-2",
        p_succeeded: false,
      }),
    );
    expect(result).toEqual({ claimed: 2, completed: 1, pending: 1 });
  });

  it("fails the tick when the trusted batch claim fails", async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "queue unavailable" },
      }),
    } as never;

    await expect(
      processCompletedRepairLearningQueue(admin, 10, "worker-1"),
    ).rejects.toThrow("queue unavailable");
  });

  it("retries an unknown finalizer response without rerunning learning", async () => {
    let finishCount = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_completed_repair_learning_batch") {
        return {
          data: [
            {
              shop_id: "shop-1",
              work_order_line_id: "line-1",
              actor_user_id: "user-1",
              lease_token: "lease-1",
            },
          ],
          error: null,
        };
      }
      finishCount += 1;
      return finishCount === 1
        ? { data: null, error: { message: "response lost" } }
        : { data: { completed: true }, error: null };
    });
    const admin = { rpc } as never;
    mocks.upsertMenuRepairItemFromCompletedLine.mockResolvedValue(undefined);

    const result = await processCompletedRepairLearningQueue(
      admin,
      10,
      "worker-1",
    );

    expect(mocks.upsertMenuRepairItemFromCompletedLine).toHaveBeenCalledTimes(1);
    expect(finishCount).toBe(2);
    expect(result).toEqual({ claimed: 1, completed: 1, pending: 0 });
  });
});
