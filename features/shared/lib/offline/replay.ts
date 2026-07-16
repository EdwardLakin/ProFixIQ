"use client";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  getOfflineBlob,
  removeOfflineBlob,
} from "@/features/shared/lib/offline/database";
import {
  replayQueuedMutations,
  type OfflineMutationRunner,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";

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
  const json = (await response.json().catch(() => null)) as { error?: string } | null;
  const error = new Error(json?.error ?? "Offline update was rejected") as Error & {
    status?: number;
  };
  error.status = response.status;
  throw error;
}

async function lineConflict(
  mutation: PendingMutation,
  lineId: string,
  action: "notes" | "story",
): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("work_order_lines")
    .select("status, approval_state")
    .eq("id", lineId)
    .eq("shop_id", mutation.shopId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "The target job is no longer available in this shop.";
  if (data.status === "completed") return "The job is already completed.";
  if (action === "notes" && data.approval_state === "approved") {
    return "Approved job notes must be reviewed before they can be changed.";
  }
  return null;
}

const handlers: Record<string, OfflineMutationRunner> = {
  "inspection:save-session": async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const workOrderLineId = text(payload.workOrderLineId);
    const operationKey = text(payload.operationKey);
    if (!workOrderLineId || !operationKey || !payload.session) {
      return { conflicted: "Inspection save is missing required offline data." };
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
    await apiPost("/api/scheduling/punches", {
      shift_id: shiftId,
      event_type: eventType,
      timestamp,
    });
  },
  update_work_order_line_notes: async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const lineId = text(payload.workOrderLineId);
    if (!lineId) return { conflicted: "Notes update is missing its job." };
    const conflict = await lineConflict(mutation, lineId, "notes");
    if (conflict) return { conflicted: conflict };
    const { error } = await createBrowserSupabase()
      .from("work_order_lines")
      .update({ notes: text(payload.notes) })
      .eq("id", lineId)
      .eq("shop_id", mutation.shopId);
    if (error) throw error;
  },
  save_story_draft: async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const lineId = text(payload.lineId);
    if (!lineId) return { conflicted: "Story draft is missing its job." };
    const conflict = await lineConflict(mutation, lineId, "story");
    if (conflict) return { conflicted: conflict };
    const { error } = await createBrowserSupabase()
      .from("work_order_lines")
      .update({ cause: text(payload.cause), correction: text(payload.correction) })
      .eq("id", lineId)
      .eq("shop_id", mutation.shopId);
    if (error) throw error;
  },
  upload_job_photo: async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const path = text(payload.path);
    const blobId = text(payload.blobId);
    if (!path || !blobId) {
      return { conflicted: "Photo upload is missing its staged file." };
    }
    const record = await getOfflineBlob(blobId);
    if (!record || record.userId !== mutation.userId || record.shopId !== mutation.shopId) {
      return { conflicted: "The staged photo is no longer available on this device." };
    }
    const { error } = await createBrowserSupabase().storage
      .from("job-photos")
      .upload(path, record.blob, {
        contentType: record.mimeType || "image/jpeg",
        upsert: true,
      });
    if (error) throw error;
    await removeOfflineBlob(blobId);
  },
  "job:punch-transition": async (mutation) => {
    const payload = mutation.payload as ReplayPayload;
    const lineId = text(payload.lineId);
    const action = text(payload.action);
    const operationKey = text(payload.operationKey);
    if (!lineId || !["start", "pause", "resume", "finish"].includes(action) || !operationKey) {
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
