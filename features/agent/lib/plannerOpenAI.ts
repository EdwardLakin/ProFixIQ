import { runFindCustomerVehicle, runCreateWorkOrder, runAddWorkOrderLine, runGenerateInvoiceHtml, runEmailInvoice } from "./toolRegistry";
import type { ToolContext } from "./toolTypes";
import type { PlannerEvent } from "./plannerSimple";
import type { GenerateInvoiceHtmlOut } from "../tools/generateInvoiceHtml";

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}
const JOB_TYPES = new Set(["maintenance","repair","diagnosis","inspection"] as const);
function coerceJobType(x: unknown): "maintenance"|"repair"|"diagnosis"|"inspection" {
  return (typeof x === "string" && JOB_TYPES.has(x as never)) ? (x as never) : "repair";
}

export async function runOpenAIPlanner(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: (e: PlannerEvent) => Promise<void> | void
) {
  await onEvent?.({ kind: "plan", text: `Goal: ${goal}` });

  let customerId = get<string>(context, "customerId");
  let vehicleId  = get<string>(context, "vehicleId");

  if (!customerId || !vehicleId) {
    const nameFromQuery = (get<string>(context, "customerQuery") || "").trim() || "Walk-in Customer";
    const createdCust = await validateAndRun("create_customer", {
      name: nameFromQuery,
      email: get<string>(context, "emailInvoiceTo")
    }, ctx) as { customerId: string };
    customerId = createdCust.customerId;
    const pov = get<string>(context, "plateOrVin")?.trim();
    if (pov) {
      const createdVeh = await validateAndRun(
        "create_vehicle",
        /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(pov) ? { customerId, vin: pov } : { customerId, license_plate: pov },
        ctx
      ) as { vehicleId: string };
      vehicleId = createdVeh.vehicleId;
    }
    await onEvent?.({ kind: "tool_result", name: "create_customer", output: { customerId } });
    if (vehicleId) await onEvent?.({ kind: "tool_result", name: "create_vehicle", output: { vehicleId } });
  }
  }

  const createInput = {
    customerId,
    vehicleId,
    type: coerceJobType(get<string>(context, "type")),   // enum-safe
    notes: get<string>(context, "notes") ?? null
  };
  const created = await runCreateWorkOrder(createInput, ctx);
  await onEvent?.({ kind: "tool_result", name: "create_work_order", output: created });

  const lineDescription = get<string>(context, "lineDescription");
  if (lineDescription) {
    const addInput = {
      workOrderId: created.workOrderId,
      description: lineDescription,
      jobType: coerceJobType(get<string>(context, "jobType")),
      laborHours: Number(get<number>(context, "laborHours") ?? 1),
      notes: get<string>(context, "lineNotes") ?? undefined   // undefined, not null
    };
    await onEvent?.({ kind: "tool_call", name: "add_work_order_line", input: addInput });
    const added = await runAddWorkOrderLine(addInput, ctx);
    await onEvent?.({ kind: "tool_result", name: "add_work_order_line", output: added });
  }

  const emailTo = get<string>(context, "emailInvoiceTo");
  if (emailTo) {
    const gen = (await runGenerateInvoiceHtml({ workOrderId: created.workOrderId }, ctx)) as GenerateInvoiceHtmlOut;
    await onEvent?.({ kind: "tool_result", name: "generate_invoice_html", output: gen });
    const sent = await runEmailInvoice({ toEmail: emailTo, subject: get<string>(context, "emailSubject") ?? "Your invoice", html: gen.html }, ctx);
    await onEvent?.({ kind: "tool_result", name: "email_invoice", output: sent });
  }

  await onEvent?.({ kind: "final", text: "Done." });
}
