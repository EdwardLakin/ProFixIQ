// features/agent/lib/plannerApprovals.ts
import type { ToolContext } from "./toolTypes";
import type { PlannerEvent } from "./plannerSimple";
import {
  runListPendingApprovals,
  runSetLineApproval,
} from "./toolRegistry";

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
  const rawAction =
    (get<string>(context, "action") ?? goal ?? "").toLowerCase();

  const lineId =
    get<string>(context, "lineId") ??
    get<string>(context, "workOrderLineId") ??
    undefined;

  const limit = Number(get<number>(context, "limit") ?? 25);

  let action: ApprovalAction = "list";
  if (rawAction.includes("reject")) action = "reject";
  else if (rawAction.includes("approve")) action = "approve";

  // If they passed a lineId but no obvious action, default to approve
  if (lineId && action === "list") action = "approve";

  return {
    action,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 25,
    lineId,
  };
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

  const pending = await (runListPendingApprovals as any)(listInput, ctx);

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

  const decision = plan.action === "approve" ? "approved" : "rejected";

  const setInput: Record<string, unknown> = {
    lineId: plan.lineId,
    decision,
  };

  await onEvent?.({
    kind: "tool_call",
    name: "set_line_approval",
    input: setInput,
  });

  const setResult = await (runSetLineApproval as any)(setInput, ctx);

  await onEvent?.({
    kind: "tool_result",
    name: "set_line_approval",
    output: setResult,
  });

  await onEvent?.({
    kind: "final",
    text: `Line ${plan.lineId} marked ${decision}.`,
  });
}