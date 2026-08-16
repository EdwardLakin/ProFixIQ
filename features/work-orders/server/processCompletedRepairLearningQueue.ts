import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertMenuRepairItemFromCompletedLine } from "@/features/menu-repair-items/server/upsertMenuRepairItemFromCompletedLine";
import type { Database } from "@/features/shared/types/types/supabase";

type DB = Database;

type RepairLearningQueueRow = {
  shop_id: string;
  work_order_line_id: string;
  actor_user_id: string | null;
  lease_token: string;
};

type RepairLearningQueueRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

async function finishLease(input: {
  admin: SupabaseClient<DB>;
  row: RepairLearningQueueRow;
  succeeded: boolean;
}) {
  const rpc = input.admin as unknown as RepairLearningQueueRpcClient;
  const { error } = await rpc.rpc(
    "finish_completed_repair_learning_worker",
    {
      p_shop_id: input.row.shop_id,
      p_work_order_line_id: input.row.work_order_line_id,
      p_actor_user_id: input.row.actor_user_id,
      p_lease_token: input.row.lease_token,
      p_succeeded: input.succeeded,
      p_result: input.succeeded
        ? { ok: true }
        : { ok: false, code: "repair_learning_failed" },
    },
  );
  if (error) throw new Error(error.message);
}

async function processQueueRow(
  admin: SupabaseClient<DB>,
  row: RepairLearningQueueRow,
): Promise<boolean> {
  try {
    await upsertMenuRepairItemFromCompletedLine({
      supabase: admin,
      shopId: row.shop_id,
      workOrderLineId: row.work_order_line_id,
      actorUserId: row.actor_user_id,
    });
  } catch (error) {
    try {
      await finishLease({ admin, row, succeeded: false });
    } catch {
      // An expired lease is reclaimed by a later worker tick.
    }
    console.error("[work-orders] completed repair memory update failed", {
      workOrderLineId: row.work_order_line_id,
      error:
        error instanceof Error
          ? error.message
          : "Completed repair memory update failed",
    });
    return false;
  }

  try {
    try {
      await finishLease({ admin, row, succeeded: true });
    } catch {
      // The finalizer is idempotent. Retry once to resolve an unknown response
      // without rerunning the repair-learning writes.
      await finishLease({ admin, row, succeeded: true });
    }
    return true;
  } catch (error) {
    // Leave the running receipt leased. A later tick safely reclaims it after
    // expiry and reruns the idempotent repair-learning projection.
    console.error("[work-orders] completed repair memory finalization failed", {
      workOrderLineId: row.work_order_line_id,
      error:
        error instanceof Error
          ? error.message
          : "Completed repair memory finalization failed",
    });
    return false;
  }
}

export async function processCompletedRepairLearningQueue(
  admin: SupabaseClient<DB>,
  limit = 10,
  workerId = randomUUID(),
): Promise<{ claimed: number; completed: number; pending: number }> {
  const rpc = admin as unknown as RepairLearningQueueRpcClient;
  const { data, error } = await rpc.rpc(
    "claim_completed_repair_learning_batch",
    {
      p_worker_id: workerId,
      p_limit: Math.max(1, Math.min(limit, 50)),
      p_lease_seconds: 600,
    },
  );
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RepairLearningQueueRow[];

  let completed = 0;
  for (const row of rows) {
    if (await processQueueRow(admin, row)) completed += 1;
  }

  return {
    claimed: rows.length,
    completed,
    pending: rows.length - completed,
  };
}
