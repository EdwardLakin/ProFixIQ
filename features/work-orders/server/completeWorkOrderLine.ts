import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertMenuRepairItemFromCompletedLine } from "@/features/menu-repair-items/server/upsertMenuRepairItemFromCompletedLine";
import type { Database } from "@/features/shared/types/types/supabase";
import { applyJobPunchTransition } from "./applyJobPunchTransition";

type DB = Database;

type CompletionInput = {
  supabase: SupabaseClient<DB>;
  lineId: string;
  technicianId: string;
  actorUserId: string;
  operationKey: string;
  cause?: string | null;
  correction?: string | null;
};

type RepairLearningClaim = {
  claimed?: boolean;
  completed?: boolean;
  inProgress?: boolean;
};

type RepairLearningRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: RepairLearningClaim | null;
    error: { message: string } | null;
  }>;
};

export async function learnFromCompletedWorkOrderLine(input: {
  supabase: SupabaseClient<DB>;
  lineId: string;
  actorUserId: string;
  operationKey: string;
}): Promise<{ ok: boolean }> {
  const { data: completedLine, error } = await input.supabase
    .from("work_order_lines")
    .select("id, shop_id")
    .eq("id", input.lineId)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  if (error || !completedLine?.shop_id) {
    console.error("[work-orders] completed repair memory update failed", {
      workOrderLineId: input.lineId,
      error: error?.message ?? "Completed line is missing shop context",
    });
    return { ok: false };
  }

  const leaseToken = randomUUID();
  const rpc = input.supabase as unknown as RepairLearningRpcClient;
  let claim: RepairLearningClaim | null = null;
  let claimError: { message: string } | null = null;
  try {
    const response = await rpc.rpc(
      "claim_completed_repair_learning_atomic",
      {
        p_shop_id: completedLine.shop_id,
        p_work_order_line_id: completedLine.id,
        p_actor_user_id: input.actorUserId,
        p_operation_key: input.operationKey,
        p_lease_token: leaseToken,
      },
    );
    claim = response.data;
    claimError = response.error;
  } catch (error) {
    claimError = {
      message: error instanceof Error ? error.message : "Learning claim failed",
    };
  }
  if (claimError) {
    console.error("[work-orders] completed repair memory claim failed", {
      workOrderLineId: input.lineId,
      error: claimError.message,
    });
    return { ok: false };
  }
  if (!claim) {
    console.error("[work-orders] completed repair memory claim failed", {
      workOrderLineId: input.lineId,
      error: "Learning claim returned no result",
    });
    return { ok: false };
  }
  if (claim.completed || claim.inProgress) {
    return { ok: true };
  }
  if (!claim.claimed) return { ok: false };

  try {
    await upsertMenuRepairItemFromCompletedLine({
      supabase: input.supabase,
      shopId: completedLine.shop_id,
      workOrderLineId: completedLine.id,
      actorUserId: input.actorUserId,
    });
    const { error: finishError } = await rpc.rpc(
      "finish_completed_repair_learning_atomic",
      {
        p_shop_id: completedLine.shop_id,
        p_work_order_line_id: completedLine.id,
        p_actor_user_id: input.actorUserId,
        p_lease_token: leaseToken,
        p_succeeded: true,
        p_result: { ok: true },
      },
    );
    if (finishError) throw new Error(finishError.message);
    return { ok: true };
  } catch (learningError) {
    try {
      await rpc.rpc("finish_completed_repair_learning_atomic", {
        p_shop_id: completedLine.shop_id,
        p_work_order_line_id: completedLine.id,
        p_actor_user_id: input.actorUserId,
        p_lease_token: leaseToken,
        p_succeeded: false,
        p_result: { ok: false, code: "repair_learning_failed" },
      });
    } catch {
      // The lease expires and permits a later completion replay to recover.
    }
    console.error("[work-orders] completed repair memory update failed", {
      workOrderLineId: input.lineId,
      error:
        learningError instanceof Error
          ? learningError.message
          : "Completed repair memory update failed",
    });
    return { ok: false };
  }
}

export async function completeWorkOrderLine(input: CompletionInput) {
  const result = await applyJobPunchTransition({
    supabase: input.supabase,
    lineId: input.lineId,
    action: "finish",
    technicianId: input.technicianId,
    options: {
      operationKey: input.operationKey,
      finish: {
        cause: input.cause,
        correction: input.correction,
      },
    },
  });

  if (!result.ok) return result;

  const menuRepairLearning = await learnFromCompletedWorkOrderLine({
    supabase: input.supabase,
    lineId: input.lineId,
    actorUserId: input.actorUserId,
    operationKey: input.operationKey,
  });

  return {
    ...result,
    menuRepairLearning,
  };
}
