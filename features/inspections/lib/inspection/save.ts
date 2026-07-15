// features/inspections/lib/inspection/save.ts
"use client";

import type { InspectionSession } from "@inspections/lib/inspection/types";
import {
  runMutationWithOfflineQueue,
  replayQueuedMutations,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";

const ACTION_SAVE_INSPECTION = "inspection:save-session";

type InspectionSavePayload = {
  workOrderLineId: string;
  session: InspectionSession;
  operationKey: string;
};

async function postInspectionSave(payload: InspectionSavePayload) {
  const res = await fetch("/api/inspections/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": payload.operationKey,
    },
    credentials: "include",
    body: JSON.stringify({
      ...payload,
      idempotencyKey: payload.operationKey,
    }),
  });

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    const error = new Error(json?.error || "Save failed") as Error & {
      status?: number;
    };
    error.status = res.status;
    throw error;
  }
}

export async function replayQueuedInspectionSaves(): Promise<void> {
  await replayQueuedMutations({
    handlers: {
      [ACTION_SAVE_INSPECTION]: async (mutation: PendingMutation) => {
        const payload = mutation.payload as Partial<InspectionSavePayload> | undefined;
        if (
          !payload?.workOrderLineId ||
          !payload.session ||
          !payload.operationKey
        ) {
          return {
            conflicted:
              "Inspection save mutation is missing its target, session, or operation key.",
          };
        }
        await postInspectionSave(payload as InspectionSavePayload);
      },
    },
  });
}

export async function saveInspectionSession(
  session: InspectionSession,
  workOrderLineId: string,
): Promise<{ queued: boolean; conflicted: boolean }> {
  if (!workOrderLineId) {
    throw new Error("Missing workOrderLineId");
  }

  const operationKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${workOrderLineId}:${Date.now()}`;
  const payload: InspectionSavePayload = {
    workOrderLineId,
    session,
    operationKey,
  };

  const result = await runMutationWithOfflineQueue({
    clientMutationId: operationKey,
    actionType: ACTION_SAVE_INSPECTION,
    payload,
    orderKey: `${workOrderLineId}:inspection-progress:${operationKey}`,
    runner: () => postInspectionSave(payload),
  });

  if (typeof navigator !== "undefined" && navigator.onLine) {
    await replayQueuedInspectionSaves();
  }

  return result;
}
