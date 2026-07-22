// features/inspections/lib/inspection/save.ts
"use client";

import type { InspectionSession } from "@inspections/lib/inspection/types";
import {
  dismissOfflineMutation,
  runMutationWithOfflineQueue,
} from "@/features/shared/lib/offline/mutations";
import { replayAllOfflineMutations } from "@/features/shared/lib/offline/replay";
import { stampInspectionSyncSource } from "@inspections/lib/inspection/conflictRecovery";

const ACTION_SAVE_INSPECTION = "inspection:save-session";

type InspectionSavePayload = {
  workOrderLineId: string;
  session: InspectionSession;
  operationKey: string;
};

type SaveInspectionOptions = {
  operationKey?: string;
  requireServer?: boolean;
  supersedesOperationKey?: string;
  deferSupersededDismissal?: boolean;
};

type InspectionSaveResponse = {
  inspection_id?: string;
  sync_revision?: number;
  saved_at?: string;
};

async function postInspectionSave(
  payload: InspectionSavePayload,
): Promise<InspectionSaveResponse> {
  const res = await fetch("/api/inspections/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": payload.operationKey,
    },
    credentials: "include",
    keepalive: true,
    body: JSON.stringify({
      ...payload,
      idempotencyKey: payload.operationKey,
    }),
  });

  const json = (await res.json().catch(() => null)) as
    | (InspectionSaveResponse & { error?: string })
    | null;
  if (!res.ok) {
    const error = new Error(json?.error || "Save failed") as Error & {
      status?: number;
    };
    error.status = res.status;
    throw error;
  }
  return json ?? {};
}

export async function replayQueuedInspectionSaves(): Promise<void> {
  await replayAllOfflineMutations();
}

export async function saveInspectionSession(
  session: InspectionSession,
  workOrderLineId: string,
  options: SaveInspectionOptions = {},
): Promise<{
  queued: boolean;
  conflicted: boolean;
  operationKey: string;
  inspectionId?: string;
  syncRevision?: number;
  savedAt?: string;
  savedSession?: InspectionSession;
}> {
  if (!workOrderLineId) {
    throw new Error("Missing workOrderLineId");
  }

  const operationKey =
    options.operationKey?.trim() ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${workOrderLineId}:${Date.now()}`);
  const authoredSession = stampInspectionSyncSource(session);
  const payload: InspectionSavePayload = {
    workOrderLineId,
    session: authoredSession,
    operationKey,
  };

  const supersededKey = options.supersedesOperationKey?.trim();
  if (
    supersededKey &&
    supersededKey !== operationKey &&
    !options.deferSupersededDismissal
  ) {
    // A distinct key prevents an in-flight replay from acknowledging a newer
    // payload. Queued (not syncing) snapshots are safely coalesced away.
    await dismissOfflineMutation(supersededKey);
  }

  const serverResponse: { current: InspectionSaveResponse | null } = {
    current: null,
  };
  const result = await runMutationWithOfflineQueue({
    clientMutationId: operationKey,
    actionType: ACTION_SAVE_INSPECTION,
    payload,
    orderKey: `${workOrderLineId}:inspection-progress`,
    queueOnOffline: options.requireServer !== true,
    runner: async () => {
      serverResponse.current = await postInspectionSave(payload);
    },
  });

  // A recovered operation may already be marked synced in IndexedDB even
  // though the page that originally sent it never captured the server's new
  // revision. Re-read that idempotent result online before treating the local
  // snapshot as durable; otherwise its next edit would reuse a stale revision
  // and conflict with the very save that just succeeded.
  if (!result.queued && !result.conflicted && !serverResponse.current) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return {
        queued: true,
        conflicted: false,
        operationKey,
      };
    }
    serverResponse.current = await postInspectionSave(payload);
  }

  if (
    supersededKey &&
    supersededKey !== operationKey &&
    options.deferSupersededDismissal &&
    !result.queued &&
    !result.conflicted &&
    serverResponse.current
  ) {
    // Conflict recovery keeps the rejected device snapshot until the reviewed
    // replacement has a server acknowledgement. A failed recovery therefore
    // cannot destroy the only remaining device copy.
    await dismissOfflineMutation(supersededKey);
  }

  if (typeof navigator !== "undefined" && navigator.onLine) {
    await replayQueuedInspectionSaves();
  }

  return {
    ...result,
    operationKey,
    inspectionId: serverResponse.current?.inspection_id,
    syncRevision: serverResponse.current?.sync_revision,
    savedAt: serverResponse.current?.saved_at,
    savedSession: authoredSession,
  };
}
