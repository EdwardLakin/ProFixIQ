import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

/**
 * Approval methods:
 * - "advisor": internal service writer/advisor approval
 * - "customer": customer-facing approval (email/text/portal)
 * - "fleet": fleet manager/central approvals
 * - "other": catch-all / custom
 */
export const RecordWorkOrderApprovalIn = z.object({
  workOrderId: z.string().uuid(),
  method: z.enum(["advisor", "customer", "fleet", "other"]).default("advisor"),

  // Optional overrides – we’ll default to the current user + now()
  approvedBy: z.string().uuid().optional(),
  approvedAt: z.string().datetime().optional(),

  /**
   * Optional explicit state to write back onto work_orders.approval_state.
   * If omitted, we infer a reasonable value from method.
   */
  approvalState: z
    .enum([
      "pending",
      "advisor_approved",
      "customer_approved",
      "fleet_approved",
      "fully_approved",
      "rejected",
    ])
    .optional(),
});
export type RecordWorkOrderApprovalIn = z.infer<typeof RecordWorkOrderApprovalIn>;

export const RecordWorkOrderApprovalOut = z.object({
  success: z.boolean(),
  approvalId: z.string().uuid().optional(),
  approvalState: z.string().optional(),
});
export type RecordWorkOrderApprovalOut = z.infer<typeof RecordWorkOrderApprovalOut>;

export const toolRecordWorkOrderApproval: ToolDef<
  RecordWorkOrderApprovalIn,
  RecordWorkOrderApprovalOut
> = {
  name: "record_work_order_approval",
  description:
    "Records an approval on a work order (advisor / customer / fleet) and updates the work order's approval_state.",
  inputSchema: RecordWorkOrderApprovalIn,
  outputSchema: RecordWorkOrderApprovalOut,
  async run(input, ctx) {
    const supabase = getServerSupabase();
    const nowIso = new Date().toISOString();
    const approvedBy = input.approvedBy ?? ctx.userId;
    const approvedAt = input.approvedAt ?? nowIso;

    // 1) Insert into work_order_approvals
    const { data: approvalRow, error: insErr } = await supabase
      .from("work_order_approvals")
      .insert({
        work_order_id: input.workOrderId,
        approved_by: approvedBy,
        approved_at: approvedAt,
        method: input.method,
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      throw new Error(insErr.message);
    }

    // 2) Decide what approval_state we should write
    const inferredState =
      input.approvalState ??
      (input.method === "customer"
        ? "customer_approved"
        : input.method === "fleet"
        ? "fleet_approved"
        : "advisor_approved");

    // 3) Update work_orders with the new approval state.
    //    For customer approvals, also stamp the customer_* columns.
    const updatePayload: Record<string, unknown> = {
      approval_state: inferredState,
      updated_at: nowIso,
    };

    if (input.method === "customer") {
      updatePayload.customer_approved_by = approvedBy;
      updatePayload.customer_approval_at = approvedAt;
    }

    const { error: woErr } = await supabase
      .from("work_orders")
      .update(updatePayload)
      .eq("id", input.workOrderId);

    if (woErr) {
      throw new Error(woErr.message);
    }

    return {
      success: true,
      approvalId: approvalRow?.id ?? undefined,
      approvalState: inferredState,
    };
  },
};