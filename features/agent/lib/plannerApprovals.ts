// features/agent/lib/plannerApprovals.ts
import type { ToolContext } from "./toolTypes";
import type { PlannerEvent } from "./plannerSimple";
import { runListPendingApprovals, runSetLineApproval } from "./toolRegistry";

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}

type ApprovalAction = "list" | "approve" | "reject";

type ParsedApprovalPlan = {
  action: ApprovalAction;
  limit: number;
  lineId?: string;
};

/**
 * Tiny parser for approvals.
 * You can later swap this to an LLM if you want “natural language approvals”.
 */
function buildApprovalPlan(
  goal: string,
  context: Record<string, unknown>,
): ParsedApprovalPlan {
  const raw =
    (
      get<string>(context, "action") ??
      get<string>(context, "decision") ??
      get<string>(context, "state") ??
      goal ??
      ""
    ).toLowerCase();

  const lineId =
    get<string>(context, "lineId") ??
    get<string>(context, "workOrderLineId") ??
    get<string>(context, "work_order_line_id") ??
    undefined;

  const limitRaw = get<number>(context, "limit");
  const limit = Number(limitRaw ?? 25);

  let action: ApprovalAction = "list";
  if (raw.includes("reject") || raw.includes("declin")) action = "reject";
  else if (raw.includes("approve") || raw.includes("accept")) action = "approve";

  // If they passed a lineId but no obvious action, default to approve
  if (lineId && action === "list") action = "approve";

  return {
    action,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 25,
    lineId,
  };
}

type ToolFn = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

function asToolFn(fn: unknown): ToolFn {
  return fn as ToolFn;
}

export async function runApprovalPlanner(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: (e: PlannerEvent) => Promise<void> | void,
) {
  const plan: ParsedApprovalPlan = buildApprovalPlan(goal, context);

  await onEvent?.({
    kind: "plan",
    text: `Approval goal: ${goal}`,
  });

  // 1) Always list current pending approvals first (advisor sees summary)
  const listInput: Record<string, unknown> = { limit: plan.limit };

  await onEvent?.({
    kind: "tool_call",
    name: "list_pending_approvals",
    input: listInput,
  });

  const pending = await asToolFn(runListPendingApprovals)(listInput, ctx);

  await onEvent?.({
    kind: "tool_result",
    name: "list_pending_approvals",
    output: pending,
  });

  // 2) Optionally approve / reject a single line
  if (plan.action === "list" || !plan.lineId) {
    await onEvent?.({
      kind: "final",
      text: "Listed pending approvals.",
    });
    return;
  }

  // ✅ Tool expects `state`, not `decision`
  const state = plan.action === "approve" ? "approved" : "declined";

  const setInput: Record<string, unknown> = {
    lineId: plan.lineId,
    state,
  };

  await onEvent?.({
    kind: "tool_call",
    name: "set_line_approval",
    input: setInput,
  });

  const setResult = await asToolFn(runSetLineApproval)(setInput, ctx);

  await onEvent?.({
    kind: "tool_result",
    name: "set_line_approval",
    output: setResult,
  });

  await onEvent?.({
    kind: "final",
    text: `Line ${plan.lineId} marked ${state}.`,
  });
}