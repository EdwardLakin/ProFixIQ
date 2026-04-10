// features/inspections/lib/inspection/save.ts
"use client";

import type { InspectionSession } from "@inspections/lib/inspection/types";
import {
  runMutationWithOfflineQueue,
  replayQueuedMutations,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";

const ACTION_SAVE_INSPECTION = "inspection:save-session";

async function postInspectionSave(payload: {
  workOrderLineId: string;
  session: InspectionSession;
}) {
  const res = await fetch("/api/inspections/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error || "Save failed");
  }
}

export async function replayQueuedInspectionSaves(): Promise<void> {
  await replayQueuedMutations({
    handlers: {
      [ACTION_SAVE_INSPECTION]: async (mutation: PendingMutation) => {
        const payload = mutation.payload as
          | { workOrderLineId?: string; session?: InspectionSession }
          | undefined;
        if (!payload?.workOrderLineId || !payload.session) {
          return { conflicted: "Inspection save mutation is missing payload data." };
        }
        await postInspectionSave({
          workOrderLineId: payload.workOrderLineId,
          session: payload.session,
        });
      },
    },
  });
}

export async function saveInspectionSession(
  session: InspectionSession,
  workOrderLineId: string
): Promise<void> {
  if (!workOrderLineId) {
    throw new Error("Missing workOrderLineId");
  }

  const payload = { workOrderLineId, session };
  const mutationId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${workOrderLineId}:${Date.now()}`;

  await runMutationWithOfflineQueue({
    clientMutationId: mutationId,
    actionType: ACTION_SAVE_INSPECTION,
    payload,
    runner: () => postInspectionSave(payload),
  });

  if (typeof navigator !== "undefined" && navigator.onLine) {
    await replayQueuedInspectionSaves();
  }
}
