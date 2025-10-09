// features/agent/lib/plannerSimple.ts
import type { ToolContext } from "./toolTypes";

import {
  runCreateWorkOrder,
  runAddWorkOrderLine,
  runGenerateInvoiceHtml,
  runEmailInvoice,
  runAttachPhoto,
} from "./toolRegistry";

export type PlannerEvent =
  | { kind: "plan"; text: string }
  | { kind: "tool_call"; name: string; input: unknown }
  | { kind: "tool_result"; name: string; output: unknown }
  | { kind: "final"; text: string };

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}

const JOB_TYPES = new Set(["maintenance", "repair", "diagnosis", "inspection"] as const);
function coerceJobType(x: unknown): "maintenance" | "repair" | "diagnosis" | "inspection" {
  return typeof x === "string" && JOB_TYPES.has(x as never) ? (x as never) : "repair";
}

function coerceOrderType(
  x: unknown
): "inspection" | "maintenance" | "repair" | "diagnosis" {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  return (["inspection", "maintenance", "repair", "diagnosis"].includes(v)
    ? v
    : "inspection") as
    | "inspection"
    | "maintenance"
    | "repair"
    | "diagnosis";
}

/**
 * "Simple" planner — expects resolved customerId + vehicleId in context.
 * Runs a deterministic sequence with optional steps.
 */
export async function runSimplePlan(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: (e: PlannerEvent) => Promise<void> | void
) {
  await onEvent?.({ kind: "plan", text: `Goal: ${goal}` });

  const customerId = get<string>(context, "customerId");
  const vehicleId = get<string>(context, "vehicleId");
  if (!customerId || !vehicleId) {
    await onEvent?.({
      kind: "final",
      text: "Need customerId and vehicleId or use find_customer_vehicle first.",
    });
    return;
  }

  // Create work order (type/notes are coerced to expected shapes)
  const createInput = {
    customerId,
    vehicleId,
    type: coerceOrderType(get<string>(context, "type")),
    notes: get<string>(context, "notes") ?? undefined,
  };
  await onEvent?.({ kind: "tool_call", name: "create_work_order", input: createInput });
  const created = await runCreateWorkOrder(createInput, ctx);
  await onEvent?.({ kind: "tool_result", name: "create_work_order", output: created });

  // Optional: add one line
  const lineDescription = get<string>(context, "lineDescription");
  if (lineDescription) {
    const addInput = {
      workOrderId: created.workOrderId,
      description: lineDescription,
      jobType: coerceJobType(get<string>(context, "jobType")),
      laborHours: Number(get<number>(context, "laborHours") ?? 1),
      notes: get<string>(context, "lineNotes") ?? undefined,
    };
    await onEvent?.({ kind: "tool_call", name: "add_work_order_line", input: addInput });
    const added = await runAddWorkOrderLine(addInput, ctx);
    await onEvent?.({ kind: "tool_result", name: "add_work_order_line", output: added });
  }

  // Optional: attach photo
  const photoUrl = get<string>(context, "photoUrl");
  if (photoUrl) {
    const attachInput = {
      workOrderId: created.workOrderId,
      imageUrl: photoUrl,
      kind: "photo",
    };
    await onEvent?.({ kind: "tool_call", name: "attach_photo_to_work_order", input: attachInput });
    const attached = await runAttachPhoto(attachInput, ctx);
    await onEvent?.({ kind: "tool_result", name: "attach_photo_to_work_order", output: attached });
  }

  // Optional: email invoice
  const emailTo = get<string>(context, "emailInvoiceTo");
  if (emailTo) {
    const genInput = { workOrderId: created.workOrderId };
    await onEvent?.({ kind: "tool_call", name: "generate_invoice_html", input: genInput });
    const gen = await runGenerateInvoiceHtml(genInput, ctx);
    await onEvent?.({ kind: "tool_result", name: "generate_invoice_html", output: gen });

    const emailInput = {
      toEmail: emailTo,
      subject: get<string>(context, "emailSubject") ?? "Your invoice",
      html: gen.html,
    };
    await onEvent?.({ kind: "tool_call", name: "email_invoice", input: emailInput });
    const sent = await runEmailInvoice(emailInput, ctx);
    await onEvent?.({ kind: "tool_result", name: "email_invoice", output: sent });
  }

  await onEvent?.({ kind: "final", text: "Done." });
}