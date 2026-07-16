"use client";

import {
  getOfflineMutationScope,
  retryOfflineMutation,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import { downloadAssignedTechnicianWork } from "@/features/work-orders/mobile/technicianOfflineDownload";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function offlineMutationTarget(
  mutation: PendingMutation,
): string | null {
  const payload = record(mutation.payload);
  const lineId =
    text(payload.workOrderLineId) ||
    text(payload.lineId) ||
    text(payload.work_order_line_id);
  if (lineId) return `/mobile/jobs/${encodeURIComponent(lineId)}`;
  if (mutation.actionType === "shift:punch-event") return "/mobile/tech/queue";
  return null;
}

export function offlineMutationDeviceValue(
  mutation: PendingMutation,
): string | null {
  const payload = record(mutation.payload);
  if (mutation.actionType === "update_work_order_line_notes") {
    return text(payload.notes) || "Empty notes";
  }
  if (mutation.actionType === "save_story_draft") {
    return (
      [text(payload.cause), text(payload.correction)]
        .filter(Boolean)
        .join(" · ") || "Empty cause and correction"
    );
  }
  if (mutation.actionType === "job:punch-transition") {
    return text(payload.action) || null;
  }
  return null;
}

export async function prepareOfflineMutationRetry(
  mutation: PendingMutation,
): Promise<void> {
  if (
    mutation.actionType !== "update_work_order_line_notes" &&
    mutation.actionType !== "save_story_draft"
  ) {
    await retryOfflineMutation(mutation.clientMutationId);
    return;
  }

  const scope = getOfflineMutationScope();
  if (!scope) throw new Error("Offline user and shop scope is unavailable.");
  const payload = record(mutation.payload);
  const lineId = text(payload.workOrderLineId) || text(payload.lineId);
  if (!lineId) throw new Error("This update is missing its job.");
  const bundle = await downloadAssignedTechnicianWork({ scope });
  const line = bundle.workOrders
    .flatMap((item) => item.lines)
    .find((item) => item.id === lineId);
  if (!line?.updated_at) {
    throw new Error("The latest server version of this job is unavailable.");
  }
  await retryOfflineMutation(mutation.clientMutationId, {
    baseUpdatedAt: line.updated_at,
  });
}
