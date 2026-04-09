import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
export type ApprovalDecision = "approve" | "decline" | "defer";
type LineUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];
type WorkOrderUpdate = DB["public"]["Tables"]["work_orders"]["Update"];

export function getCanonicalWorkOrderLineApprovalTuple(
  decision: ApprovalDecision,
): Pick<LineUpdate, "approval_state" | "status" | "punchable" | "hold_reason"> {
  if (decision === "approve") {
    return {
      approval_state: "approved",
      status: "in_progress",
      punchable: true,
      hold_reason: null,
    };
  }

  if (decision === "decline") {
    return {
      approval_state: "declined",
      status: "on_hold",
      punchable: false,
    };
  }

  return {
    approval_state: "pending",
    status: "awaiting_approval",
    punchable: false,
  };
}

export function applyWorkOrderLineApprovalDecision(params: {
  supabase: SupabaseClient<DB>;
  decision: ApprovalDecision;
  lineIds: string[];
  workOrderId?: string;
  extraPatch?: LineUpdate;
}) {
  const { supabase, decision, lineIds, workOrderId, extraPatch } = params;

  const patch: LineUpdate = {
    ...getCanonicalWorkOrderLineApprovalTuple(decision),
    ...(extraPatch ?? {}),
  };

  let query = supabase
    .from("work_order_lines")
    .update(patch)
    .in("id", lineIds);

  if (workOrderId) {
    query = query.eq("work_order_id", workOrderId);
  }

  return query;
}

function dedupeNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

async function resolveWorkOrderIdsForLines(params: {
  supabase: SupabaseClient<DB>;
  lineIds: string[];
  workOrderId?: string;
}) {
  const { supabase, lineIds, workOrderId } = params;

  if (workOrderId) return { workOrderIds: [workOrderId], error: null };

  const targetLineIds = dedupeNonEmpty(lineIds);
  if (targetLineIds.length === 0) return { workOrderIds: [] as string[], error: null };

  const { data, error } = await supabase
    .from("work_order_lines")
    .select("work_order_id")
    .in("id", targetLineIds);

  if (error) return { workOrderIds: [] as string[], error };

  const workOrderIds = dedupeNonEmpty(
    (data ?? [])
      .map((row) =>
        typeof (row as { work_order_id?: unknown }).work_order_id === "string"
          ? ((row as { work_order_id: string }).work_order_id)
          : "",
      ),
  );

  return { workOrderIds, error: null };
}

async function rollupWorkOrderApprovalState(params: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  extraPatch?: WorkOrderUpdate;
}) {
  const { supabase, workOrderId, extraPatch } = params;

  const { data: lines, error: linesErr } = await supabase
    .from("work_order_lines")
    .select("approval_state")
    .eq("work_order_id", workOrderId);

  if (linesErr) return { error: linesErr };

  let pendingCount = 0;
  let approvedCount = 0;

  for (const line of lines ?? []) {
    const approvalState =
      typeof (line as { approval_state?: unknown }).approval_state === "string"
        ? ((line as { approval_state: string }).approval_state).toLowerCase()
        : "";

    if (approvalState === "pending") pendingCount += 1;
    if (approvalState === "approved") approvedCount += 1;
  }

  const approvalState: WorkOrderUpdate["approval_state"] =
    approvedCount > 0
      ? pendingCount > 0
        ? "partial"
        : "approved"
      : pendingCount > 0
        ? "pending"
        : "declined";

  const patch: WorkOrderUpdate = {
    approval_state: approvalState,
    ...(extraPatch ?? {}),
  };

  const { error } = await supabase
    .from("work_orders")
    .update(patch)
    .eq("id", workOrderId);

  return { error };
}

export async function applyAndPropagateWorkOrderLineApprovalDecision(params: {
  supabase: SupabaseClient<DB>;
  decision: ApprovalDecision;
  lineIds: string[];
  workOrderId?: string;
  extraPatch?: LineUpdate;
  workOrderPatch?: WorkOrderUpdate;
}) {
  const { supabase, decision, lineIds, workOrderId, extraPatch, workOrderPatch } = params;

  const lineResult = await applyWorkOrderLineApprovalDecision({
    supabase,
    decision,
    lineIds,
    workOrderId,
    extraPatch,
  });

  if (lineResult.error) return lineResult;

  const { workOrderIds, error: woIdErr } = await resolveWorkOrderIdsForLines({
    supabase,
    lineIds,
    workOrderId,
  });

  if (woIdErr) return { data: lineResult.data, error: woIdErr, count: lineResult.count, status: lineResult.status, statusText: lineResult.statusText };

  for (const resolvedWorkOrderId of workOrderIds) {
    const { error } = await rollupWorkOrderApprovalState({
      supabase,
      workOrderId: resolvedWorkOrderId,
      extraPatch: workOrderPatch,
    });
    if (error) {
      return {
        data: lineResult.data,
        error,
        count: lineResult.count,
        status: lineResult.status,
        statusText: lineResult.statusText,
      };
    }
  }

  return lineResult;
}
