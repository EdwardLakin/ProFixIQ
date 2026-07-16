"use client";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  getOfflineBlob,
  removeOfflineBlob,
} from "@/features/shared/lib/offline/database";
import {
  replayQueuedMutations,
  type OfflineMutationRunner,
} from "@/features/shared/lib/offline/mutations";
import { postOfflineServerMutation } from "@/features/shared/lib/offline/server-mutations";
import { replayInspectionPhotoMutation } from "@inspections/lib/inspection/inspectionPhotoStaging";

type ReplayPayload = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function apiPost(path: string, body: unknown, operationKey?: string) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(operationKey ? { "Idempotency-Key": operationKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (response.ok) return;
  const json = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  const error = new Error(
    json?.error ?? "Offline update was rejected",
  ) as Error & {
    status?: number;
  };
  error.status = response.status;
  throw error;
}

const handlers: Record<string, OfflineMutationRunner> = {
  "inspection:upload-photo": replayInspectionPhotoMutation,
  "inspection:save-session": async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const workOrderLineId = text(payload.workOrderLineId);
    const operationKey = text(payload.operationKey);
    if (!workOrderLineId || !operationKey || !payload.session) {
      return {
        conflicted: "Inspection save is missing required offline data.",
      };
    }
    await apiPost(
      "/api/inspections/save",
      { ...payload, idempotencyKey: operationKey },
      operationKey,
    );
  },
  "shift:punch-event": async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const shiftId = text(payload.shift_id);
    const eventType = text(payload.event_type);
    const timestamp = text(payload.timestamp);
    if (!shiftId || !eventType || !timestamp) {
      return { conflicted: "Shift punch is missing required offline data." };
    }
    await apiPost(
      "/api/scheduling/punches",
      {
        shift_id: shiftId,
        event_type: eventType,
        timestamp,
        note: text(payload.note) || undefined,
      },
      mutation.clientMutationId,
    );
  },
  update_work_order_line_notes: async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const lineId = text(payload.workOrderLineId);
    if (!lineId) return { conflicted: "Notes update is missing its job." };
    await postOfflineServerMutation({
      actionType: "update_work_order_line_notes",
      operationKey: mutation.clientMutationId,
      payload,
    });
  },
  save_story_draft: async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const lineId = text(payload.lineId);
    if (!lineId) return { conflicted: "Story draft is missing its job." };
    await postOfflineServerMutation({
      actionType: "save_story_draft",
      operationKey: mutation.clientMutationId,
      payload,
    });
  },
  upload_job_photo: async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const path = text(payload.path);
    const blobId = text(payload.blobId);
    if (!path || !blobId) {
      return { conflicted: "Photo upload is missing its staged file." };
    }
    const record = await getOfflineBlob(blobId);
    if (
      !record ||
      record.userId !== mutation.userId ||
      record.shopId !== mutation.shopId
    ) {
      return {
        conflicted: "The staged photo is no longer available on this device.",
      };
    }
    const { error } = await createBrowserSupabase()
      .storage.from("job-photos")
      .upload(path, record.blob, {
        contentType: record.mimeType || "image/jpeg",
        upsert: true,
      });
    if (error) throw error;
    await postOfflineServerMutation({
      actionType: "upload_job_photo",
      operationKey: mutation.clientMutationId,
      payload,
    });
    await removeOfflineBlob(blobId);
  },
  "job:punch-transition": async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const lineId = text(payload.lineId);
    const action = text(payload.action);
    const operationKey = text(payload.operationKey);
    if (
      !lineId ||
      !["start", "pause", "resume", "finish"].includes(action) ||
      !operationKey
    ) {
      return { conflicted: "Job transition is missing required offline data." };
    }
    await apiPost(
      `/api/work-orders/lines/${lineId}/${action}`,
      payload.body ?? {},
      operationKey,
    );
  },
};

let replayPromise: ReturnType<typeof replayQueuedMutations> | null = null;

export function replayAllOfflineMutations() {
  replayPromise ??= replayQueuedMutations({ handlers }).finally(() => {
    replayPromise = null;
  });
  return replayPromise;
}
