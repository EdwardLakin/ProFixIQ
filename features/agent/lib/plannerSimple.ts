import type { ToolCall } from "./toolRegistry";
import { ToolCallSchema, runCreateWorkOrder, runAddWorkOrderLine, runGenerateInvoiceHtml, runEmailInvoice } from "./toolRegistry";
import type { ToolContext } from "./toolTypes";
import type { GenerateInvoiceHtmlOut } from "../tools/generateInvoiceHtml";

export type PlannerEvent =
  | { kind: "plan"; text: string }
  | { kind: "tool_call"; name: string; input: unknown }
  | { kind: "tool_result"; name: string; output: unknown }
  | { kind: "final"; text: string };

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}
const JOB_TYPES = new Set(["maintenance","repair","diagnosis","inspection"] as const);
function coerceJobType(x: unknown): "maintenance"|"repair"|"diagnosis"|"inspection" {
  return (typeof x === "string" && JOB_TYPES.has(x as never)) ? (x as never) : "repair";
}

export async function runSimplePlan(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: (e: PlannerEvent) => Promise<void> | void
) {
  await onEvent?.({ kind: "plan", text: `Goal: ${goal}` });

  const customerId = get<string>(context, "customerId");
  const vehicleId  = get<string>(context, "vehicleId");
