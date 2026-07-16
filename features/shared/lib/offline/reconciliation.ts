"use client";

import {
  getOfflineMutationScope,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import { fetchMobileShiftState } from "@/features/mobile/shifts/client";
import { saveCachedMobileShiftState } from "@/features/mobile/shifts/offline";
import { downloadAssignedTechnicianWork } from "@/features/work-orders/mobile/technicianOfflineDownload";

const WORK_ORDER_ACTIONS = new Set([
  "update_work_order_line_notes",
  "save_story_draft",
  "upload_job_photo",
  "job:punch-transition",
  "inspection:save-session",
  "inspection:upload-photo",
]);

export type OfflineReconciliationResult = {
  workOrders: "skipped" | "refreshed" | "failed";
  shift: "skipped" | "refreshed" | "failed";
};

/** Refreshes authoritative device snapshots after mutations reach the server. */
export async function reconcileOfflineTechnicianState(
  mutations: Array<Pick<PendingMutation, "actionType">>,
): Promise<OfflineReconciliationResult> {
  const scope = getOfflineMutationScope();
  const result: OfflineReconciliationResult = {
    workOrders: "skipped",
    shift: "skipped",
  };
  if (!scope || typeof navigator === "undefined" || !navigator.onLine) {
    return result;
  }

  if (
    mutations.some((mutation) => WORK_ORDER_ACTIONS.has(mutation.actionType))
  ) {
    try {
      await downloadAssignedTechnicianWork({ scope });
      result.workOrders = "refreshed";
    } catch {
      result.workOrders = "failed";
    }
  }

  if (
    mutations.some((mutation) => mutation.actionType === "shift:punch-event")
  ) {
    try {
      const state = await fetchMobileShiftState();
      await saveCachedMobileShiftState({ scope, state });
      result.shift = "refreshed";
    } catch {
      result.shift = "failed";
    }
  }

  return result;
}
