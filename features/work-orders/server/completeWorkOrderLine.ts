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

export async function learnFromCompletedWorkOrderLine(input: {
  supabase: SupabaseClient<DB>;
  lineId: string;
  actorUserId: string;
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

  try {
    await upsertMenuRepairItemFromCompletedLine({
      supabase: input.supabase,
      shopId: completedLine.shop_id,
      workOrderLineId: completedLine.id,
      actorUserId: input.actorUserId,
    });
    return { ok: true };
  } catch (learningError) {
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
  });

  return {
    ...result,
    menuRepairLearning,
  };
}
