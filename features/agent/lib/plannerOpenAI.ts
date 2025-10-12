import type { ToolContext } from "./toolTypes";
import type { PlannerEvent } from "./plannerSimple"; // includes "wo.created"

import {
  runCreateWorkOrder,
  runAddWorkOrderLine,
  runFindCustomerVehicle,
  runGenerateInvoiceHtml,
  runEmailInvoice,
  runCreateCustomer,
  runCreateVehicle,
  runAttachPhoto,
} from "./toolRegistry";

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}

const JOB_TYPES = new Set(["maintenance", "repair", "diagnosis", "inspection"] as const);
function coerceJobType(x: unknown): "maintenance" | "repair" | "diagnosis" | "inspection" {
  return typeof x === "string" && JOB_TYPES.has(x as never) ? (x as never) : "repair";
}

// Narrow the order "type" to valid literals
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
 * "OpenAI" planner — deterministic/sequenced orchestration of tools.
 */
export async function runOpenAIPlanner(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: (e: PlannerEvent) => Promise<void> | void
) {
  await onEvent?.({ kind: "plan", text: `Goal: ${goal}` });

  // 1) Resolve customer + vehicle (find first; else create if data available)
  let customerId = get<string>(context, "customerId");
  let vehicleId = get<string>(context, "vehicleId");

  if (!customerId || !vehicleId) {
    const findIn = {
      customerQuery: get<string>(context, "customerQuery"),
      plateOrVin: get<string>(context, "plateOrVin"),
    };
    await onEvent?.({ kind: "tool_call", name: "find_customer_vehicle", input: findIn });
    const found = await runFindCustomerVehicle(findIn, ctx);
    await onEvent?.({ kind: "tool_result", name: "find_customer_vehicle", output: found });

    customerId = customerId ?? found.customerId;
    vehicleId = vehicleId ?? found.vehicleId;

    if (!customerId) {
      const name = get<string>(context, "customerQuery")?.trim();
      if (name) {
        const createdC = await runCreateCustomer({ name }, ctx);
        customerId = createdC.customerId;
        await onEvent?.({
          kind: "tool_result",
          name: "create_customer",
          output: createdC,
        });
      }
    }

    if (!vehicleId && customerId) {
      const vinOrPlate = get<string>(context, "plateOrVin");
      const make = get<string>(context, "make");
      const model = get<string>(context, "model");
      const year = get<number>(context, "year");

      if (vinOrPlate || make || model || typeof year === "number") {
        const createdV = await runCreateVehicle(
          {
            customerId,
            vin: vinOrPlate && vinOrPlate.length > 10 ? vinOrPlate : undefined,
            license_plate: vinOrPlate && vinOrPlate.length <= 10 ? vinOrPlate : undefined,
            make: make ?? undefined,
            model: model ?? undefined,
            year: typeof year === "number" ? year : undefined,
          },
          ctx
        );
        vehicleId = createdV.vehicleId;
        await onEvent?.({
          kind: "tool_result",
          name: "create_vehicle",
          output: createdV,
        });
      }
    }

    if (!customerId || !vehicleId) {
      await onEvent?.({
        kind: "final",
        text: "Need a specific customer and vehicle to proceed.",
      });
      return;
    }
  }

  // 2) Create the work order
  const createInput = {
    customerId,
    vehicleId,
    type: coerceOrderType(get<string>(context, "type")),
    notes: get<string>(context, "notes") ?? undefined,
  };
  await onEvent?.({ kind: "tool_call", name: "create_work_order", input: createInput });
  const created = await runCreateWorkOrder(createInput, ctx);
  await onEvent?.({ kind: "tool_result", name: "create_work_order", output: created });

  // 👇 Emit a dedicated event your UI can use to open a preview modal
  await onEvent?.({
    kind: "wo.created",
    workOrderId: created.workOrderId,
    customerId,
    vehicleId,
  });

  // 3) Optional: add one line
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

  // 4) Optional: attach photo
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

  // 5) Optional: invoice + email
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