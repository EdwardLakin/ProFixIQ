// features/inspections/lib/inspection/save.ts
"use client";

import type { InspectionSession } from "@inspections/lib/inspection/types";
import { runMutationWithOfflineQueue } from "@/features/shared/lib/offline/mutations";
import { replayAllOfflineMutations } from "@/features/shared/lib/offline/replay";

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
    const json = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    const error = new Error(json?.error || "Save failed") as Error & {
      status?: number;
    };
    error.status = res.status;
    throw error;
  }
}

export async function replayQueuedInspectionSaves(): Promise<void> {
  await replayAllOfflineMutations();
}

export async function saveInspectionSession(
  session: InspectionSession,
  workOrderLineId: string,
): Promise<{ queued: boolean; conflicted: boolean; operationKey: string }> {
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

  return { ...result, operationKey };
}
