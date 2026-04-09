import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
export type ApprovalDecision = "approve" | "decline" | "defer";
type LineUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

export function getCanonicalWorkOrderLineApprovalTuple(
  decision: ApprovalDecision,
): Pick<LineUpdate, "approval_state" | "status" | "punchable" | "hold_reason"> {
  if (decision === "approve") {
    return {
      approval_state: "approved",
      status: "active",
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
