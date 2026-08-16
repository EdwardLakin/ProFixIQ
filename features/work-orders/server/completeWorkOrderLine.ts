import type { SupabaseClient } from "@supabase/supabase-js";

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

  // The canonical finish receipt atomically enqueues repair learning in the
  // database. Completion never waits for, retries, or finalizes that worker job.
  return {
    ...result,
    menuRepairLearning: { ok: false, state: "pending" as const },
  };
}
