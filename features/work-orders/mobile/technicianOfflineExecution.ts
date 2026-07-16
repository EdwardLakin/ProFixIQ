"use client";

import {
  getOfflineSnapshot,
  listOfflineSnapshots,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import {
  hydrateOfflineMutationQueue,
  listPendingMutations,
  type OfflineMutationScope,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

export type MobileWorkOrderSnapshot = {
  workOrder: WorkOrder;
  lines: WorkOrderLine[];
  quoteLines: QuoteLine[];
  vehicle: Vehicle | null;
  customer: Customer | null;
  techNamesById: Record<string, string>;
};

export type TechnicianJobEditorDraft = {
  lineId: string;
  notes?: string;
  cause?: string;
  correction?: string;
  updatedAt: string;
};

const DETAIL_KIND = "mobile-work-order-detail";
const DRAFT_KIND = "technician-job-draft";
const DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function projectLine(
  line: WorkOrderLine,
  mutation: PendingMutation,
): WorkOrderLine {
  const payload = record(mutation.payload);
  if (
    mutation.actionType === "update_work_order_line_notes" &&
    text(payload.workOrderLineId) === line.id
  ) {
    return { ...line, notes: text(payload.notes) ?? "" };
  }
  if (
    mutation.actionType === "save_story_draft" &&
    text(payload.lineId) === line.id
  ) {
    return {
      ...line,
      cause: text(payload.cause) ?? "",
      correction: text(payload.correction) ?? "",
    };
  }
  if (
    mutation.actionType !== "job:punch-transition" ||
    text(payload.lineId) !== line.id
  ) {
    return line;
  }

  const action = text(payload.action);
  const body = record(payload.body);
  const occurredAt =
    text(payload.occurredAt) ?? text(body.occurredAt) ?? mutation.createdAt;
  if (action === "start" || action === "resume") {
    return {
      ...line,
      status: "in_progress",
      punched_in_at: occurredAt,
      punched_out_at: null,
      hold_reason: null,
    };
  }
  if (action === "pause") {
    return {
      ...line,
      status: "on_hold",
      punched_out_at: occurredAt,
      hold_reason: text(body.holdReason) ?? line.hold_reason,
    };
  }
  if (action === "finish") {
    return {
      ...line,
      status: "completed",
      punched_out_at: occurredAt,
      cause: text(body.cause) ?? line.cause,
      correction: text(body.correction) ?? line.correction,
    };
  }
  return line;
}

export function projectTechnicianWorkOrderSnapshot(
  snapshot: MobileWorkOrderSnapshot,
  mutations: PendingMutation[],
): MobileWorkOrderSnapshot {
  return {
    ...snapshot,
    lines: snapshot.lines.map((line) => mutations.reduce(projectLine, line)),
  };
}

export async function loadProjectedWorkOrderSnapshot(args: {
  scope: OfflineMutationScope;
  entityId: string;
}): Promise<MobileWorkOrderSnapshot | null> {
  await hydrateOfflineMutationQueue();
  const snapshot = await getOfflineSnapshot<MobileWorkOrderSnapshot>({
    scope: args.scope,
    kind: DETAIL_KIND,
    entityId: args.entityId,
  });
  return snapshot
    ? projectTechnicianWorkOrderSnapshot(
        snapshot.data,
        listPendingMutations(args.scope),
      )
    : null;
}

export async function findProjectedTechnicianJob(args: {
  scope: OfflineMutationScope;
  lineId: string;
}): Promise<{
  snapshot: MobileWorkOrderSnapshot;
  line: WorkOrderLine;
} | null> {
  await hydrateOfflineMutationQueue();
  const snapshots = await listOfflineSnapshots<MobileWorkOrderSnapshot>({
    scope: args.scope,
    kind: DETAIL_KIND,
  });
  const pending = listPendingMutations(args.scope);
  for (const stored of snapshots) {
    const projected = projectTechnicianWorkOrderSnapshot(stored.data, pending);
    const line = projected.lines.find((item) => item.id === args.lineId);
    if (line) return { snapshot: projected, line };
  }
  return null;
}

export async function getTechnicianJobEditorDraft(args: {
  scope: OfflineMutationScope;
  lineId: string;
}): Promise<TechnicianJobEditorDraft | null> {
  const stored = await getOfflineSnapshot<TechnicianJobEditorDraft>({
    scope: args.scope,
    kind: DRAFT_KIND,
    entityId: args.lineId,
  });
  return stored?.data ?? null;
}

export async function saveTechnicianJobEditorDraft(args: {
  scope: OfflineMutationScope;
  draft: TechnicianJobEditorDraft;
}): Promise<void> {
  await saveOfflineSnapshot({
    scope: args.scope,
    kind: DRAFT_KIND,
    entityId: args.draft.lineId,
    data: args.draft,
    maxAgeMs: DRAFT_MAX_AGE_MS,
  });
}

export async function removeTechnicianJobEditorDraft(args: {
  scope: OfflineMutationScope;
  lineId: string;
}): Promise<void> {
  await removeOfflineSnapshots({
    scope: args.scope,
    kind: DRAFT_KIND,
    entityIds: [args.lineId],
  });
}

export async function clearTechnicianJobEditorDraftFields(args: {
  scope: OfflineMutationScope;
  lineId: string;
  fields: Array<"notes" | "cause" | "correction">;
}): Promise<void> {
  const existing = await getTechnicianJobEditorDraft(args);
  if (!existing) return;
  const next = { ...existing };
  for (const field of args.fields) delete next[field];
  if (next.notes == null && next.cause == null && next.correction == null) {
    await removeTechnicianJobEditorDraft(args);
    return;
  }
  await saveTechnicianJobEditorDraft({
    scope: args.scope,
    draft: { ...next, updatedAt: new Date().toISOString() },
  });
}
