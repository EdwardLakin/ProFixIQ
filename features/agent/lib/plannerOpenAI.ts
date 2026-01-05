// features/agent/lib/plannerOpenAI.ts
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
  runCreateCustomInspection,
  runRecordWorkOrderApproval,
} from "./toolRegistry";

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}

function toMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (
    e !== null &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

const JOB_TYPES = new Set(["maintenance", "repair", "diagnosis", "inspection"] as const);
function coerceJobType(x: unknown): "maintenance" | "repair" | "diagnosis" | "inspection" {
  return typeof x === "string" && JOB_TYPES.has(x as never) ? (x as never) : "repair";
}

function coerceOrderType(
  x: unknown,
): "inspection" | "maintenance" | "repair" | "diagnosis" {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  return (["inspection", "maintenance", "repair", "diagnosis"].includes(v)
    ? v
    : "inspection") as "inspection" | "maintenance" | "repair" | "diagnosis";
}

type PlannerMode = "openai" | "fleet" | "approvals";
function getPlannerMode(context: Record<string, unknown>): PlannerMode {
  const raw =
    (get<string>(context, "plannerKind") ??
      get<string>(context, "mode") ??
      "openai") || "openai";
  const v = raw.toLowerCase();
  if (v === "fleet") return "fleet";
  if (v === "approvals") return "approvals";
  return "openai";
}

function coerceApprovalMethod(
  x: unknown,
  mode: PlannerMode,
): "fleet" | "advisor" | "customer" | "other" {
  if (typeof x === "string") {
    const v = x.toLowerCase();
    if (v.includes("fleet")) return "fleet";
    if (v.includes("advisor")) return "advisor";
    if (v.includes("customer")) return "customer";
    return "other";
  }
  if (mode === "fleet") return "fleet";
  if (mode === "approvals") return "advisor";
  return "other";
}

/* -------------------------------------------------------------------------- */
/* LLM parsing                                                                */
/* -------------------------------------------------------------------------- */

type ParsedLine = {
  description: string;
  jobType?: "maintenance" | "repair" | "diagnosis" | "inspection";
  laborHours?: number;
  notes?: string;
};

type ParsedPlan = {
  customerQuery?: string;
  plateOrVin?: string;
  orderType?: "inspection" | "maintenance" | "repair" | "diagnosis";
  notes?: string | null;
  lines?: ParsedLine[];
  emailInvoiceTo?: string;
  emailSubject?: string;
  photoUrl?: string;

  inspection?: {
    title?: string;
    vehicleType?: "car" | "truck" | "bus" | "trailer";
    includeAxle?: boolean;
    includeOil?: boolean;
    selections?: Record<string, string[]>;
    services?: string[];
  };

  autoApprove?: boolean;
  approvalMethod?: string;
};

async function llmParseGoal(
  goal: string,
  context: Record<string, unknown>,
): Promise<ParsedPlan> {
  const hints = {
    customerQuery: get<string>(context, "customerQuery"),
    plateOrVin: get<string>(context, "plateOrVin"),
    emailInvoiceTo: get<string>(context, "emailInvoiceTo"),
    photoUrl: get<string>(context, "imageUrl"),
    mode: get<string>(context, "mode") ?? get<string>(context, "plannerKind"),
  };

  const system = [
    "You write strict JSON for auto-repair shop orchestration.",
    "Output ONLY a JSON object; no prose.",
    "Keys allowed: customerQuery, plateOrVin, orderType, notes, lines, emailInvoiceTo, emailSubject, photoUrl, inspection, autoApprove, approvalMethod.",
    "Each line must include: description (required); jobType (maintenance|repair|diagnosis|inspection) if inferable; laborHours number if inferable; notes optional.",
    "If you cannot infer something, omit it.",
    "If a custom inspection is implied, set 'inspection' with title, selections{section:[items]}, services[], vehicleType, includeAxle/includeOil.",
    "If the goal clearly implies advisor/customer approval, you may set autoApprove: true and an approvalMethod string (e.g. 'advisor_auto', 'customer_signed', 'phone_call').",
  ].join(" ");

  const user = `Goal:\n${goal}\n\nUI hints:\n${JSON.stringify(hints)}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) return {};
  const j = (await res.json().catch(() => null)) as unknown;
  const text =
    typeof j === "object" &&
    j !== null &&
    "choices" in j &&
    Array.isArray((j as any).choices) &&
    (j as any).choices[0]?.message?.content
      ? String((j as any).choices[0].message.content)
      : undefined;

  if (!text) return {};
  try {
    return JSON.parse(text) as ParsedPlan;
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/* OpenAI Planner                                                             */
/* -------------------------------------------------------------------------- */

export async function runOpenAIPlanner(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: (e: PlannerEvent) => Promise<void> | void,
) {
  await onEvent?.({ kind: "plan", text: `Goal: ${goal}` });

  const mode = getPlannerMode(context);

  // 0) Parse with LLM (best-effort)
  let parsed: ParsedPlan = {};
  try {
    parsed = await llmParseGoal(goal, context);
  } catch {
    // ignore parse errors
  }

  // 1) Resolve customer + vehicle
  let customerId = get<string>(context, "customerId");
  let vehicleId = get<string>(context, "vehicleId");

  const findIn = {
    customerQuery: parsed.customerQuery ?? get<string>(context, "customerQuery"),
    plateOrVin: parsed.plateOrVin ?? get<string>(context, "plateOrVin"),
  };

  if (!customerId || !vehicleId) {
    await onEvent?.({
      kind: "tool_call",
      name: "find_customer_vehicle",
      input: findIn,
    });

    const found = await runFindCustomerVehicle(findIn, ctx);

    await onEvent?.({
      kind: "tool_result",
      name: "find_customer_vehicle",
      output: found,
    });

    customerId = customerId ?? found.customerId;
    vehicleId = vehicleId ?? found.vehicleId;

    // 1a) If customer missing, try create_customer.
    // If the DB has a unique constraint on customers.user_id, we gracefully recover
    // by re-running find_customer_vehicle (which should now be able to find the existing row).
    if (!customerId) {
      const name = (findIn.customerQuery ?? "").trim() || "Default Customer";

      await onEvent?.({
        kind: "tool_call",
        name: "create_customer",
        input: { name },
      });

      try {
        const createdC = await runCreateCustomer({ name }, ctx);
        customerId = createdC.customerId;

        await onEvent?.({
          kind: "tool_result",
          name: "create_customer",
          output: createdC,
        });
      } catch (err) {
        const msg = toMsg(err);

        // Most common: duplicate key value violates unique constraint "customers_user_id_uq"
        if (msg.toLowerCase().includes("customers_user_id_uq")) {
          await onEvent?.({
            kind: "tool_result",
            name: "create_customer",
            output: { skipped: true, reason: "customer already exists for user" },
          });

          // Re-try find to fetch the existing customerId
          const retry = await runFindCustomerVehicle(
            { customerQuery: name, plateOrVin: findIn.plateOrVin },
            ctx,
          );

          await onEvent?.({
            kind: "tool_result",
            name: "find_customer_vehicle",
            output: retry,
          });

          customerId = retry.customerId ?? customerId;
          vehicleId = retry.vehicleId ?? vehicleId;
        } else {
          await onEvent?.({
            kind: "final",
            text: `Create customer failed: ${msg}`,
          });
          return;
        }
      }
    }

    // 1b) If vehicle missing, create it (based on plate/vin)
    if (!vehicleId && customerId && findIn.plateOrVin) {
      const vinOrPlate = findIn.plateOrVin;

      const vehicleInput = {
        customerId,
        vin: vinOrPlate && vinOrPlate.length > 10 ? vinOrPlate : undefined,
        license_plate: vinOrPlate && vinOrPlate.length <= 10 ? vinOrPlate : undefined,
      };

      await onEvent?.({
        kind: "tool_call",
        name: "create_vehicle",
        input: vehicleInput,
      });

      const createdV = await runCreateVehicle(vehicleInput, ctx);
      vehicleId = createdV.vehicleId;

      await onEvent?.({
        kind: "tool_result",
        name: "create_vehicle",
        output: createdV,
      });
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
    type: coerceOrderType(parsed.orderType ?? get<string>(context, "type")),
    notes: (parsed.notes ?? get<string>(context, "notes") ?? undefined) || undefined,
  };

  await onEvent?.({
    kind: "tool_call",
    name: "create_work_order",
    input: createInput,
  });

  const created = await runCreateWorkOrder(createInput, ctx);

  await onEvent?.({
    kind: "tool_result",
    name: "create_work_order",
    output: created,
  });

  await onEvent?.({
    kind: "wo.created",
    workOrderId: created.workOrderId,
    customerId,
    vehicleId,
  });

  // 3) Add lines
  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  if (lines.length > 0) {
    for (const L of lines) {
      const desc = (L?.description ?? "").trim();
      if (!desc) continue;

      const addInput = {
        workOrderId: created.workOrderId,
        description: desc,
        jobType: coerceJobType(L?.jobType),
        laborHours: Number(L?.laborHours ?? 1),
        notes: typeof L?.notes === "string" ? L.notes : undefined,
      };

      await onEvent?.({
        kind: "tool_call",
        name: "add_work_order_line",
        input: addInput,
      });

      const added = await runAddWorkOrderLine(addInput, ctx);

      await onEvent?.({
        kind: "tool_result",
        name: "add_work_order_line",
        output: added,
      });
    }
  } else {
    const legacyDesc = get<string>(context, "lineDescription");
    if (legacyDesc) {
      const addInput = {
        workOrderId: created.workOrderId,
        description: legacyDesc,
        jobType: coerceJobType(get<string>(context, "jobType")),
        laborHours: Number(get<number>(context, "laborHours") ?? 1),
        notes: get<string>(context, "lineNotes") ?? undefined,
      };

      await onEvent?.({
        kind: "tool_call",
        name: "add_work_order_line",
        input: addInput,
      });

      const added = await runAddWorkOrderLine(addInput, ctx);

      await onEvent?.({
        kind: "tool_result",
        name: "add_work_order_line",
        output: added,
      });
    }
  }

  // 4) Optional: attach photo
  const photoUrl = parsed.photoUrl ?? get<string>(context, "imageUrl");
  if (photoUrl) {
    const attachInput = {
      workOrderId: created.workOrderId,
      imageUrl: photoUrl,
      kind: "photo" as const,
    };

    await onEvent?.({
      kind: "tool_call",
      name: "attach_photo_to_work_order",
      input: attachInput,
    });

    const attached = await runAttachPhoto(attachInput, ctx);

    await onEvent?.({
      kind: "tool_result",
      name: "attach_photo_to_work_order",
      output: attached,
    });
  }

  // 5) Optional: custom inspection
  const insp =
    parsed.inspection ??
    (get<Record<string, unknown>>(context, "inspection") as ParsedPlan["inspection"]) ??
    (get<Record<string, unknown>>(context, "customInspection") as ParsedPlan["inspection"]);

  if (insp) {
    const input = {
      workOrderId: created.workOrderId,
      title: insp.title ?? "Custom Inspection",
      selections: insp.selections ?? {},
      services: Array.isArray(insp.services) ? insp.services : [],
      vehicleType: (insp.vehicleType ?? "truck") as "car" | "truck" | "bus" | "trailer",
      includeAxle: insp.includeAxle ?? true,
      includeOil: insp.includeOil ?? false,
    };

    await onEvent?.({
      kind: "tool_call",
      name: "create_custom_inspection",
      input,
    });

    const out = await runCreateCustomInspection(input, ctx);

    await onEvent?.({
      kind: "tool_result",
      name: "create_custom_inspection",
      output: out,
    });
  }

  // 6) Optional: invoice + email
  const emailTo = parsed.emailInvoiceTo ?? get<string>(context, "emailInvoiceTo");
  if (emailTo) {
    const genInput = { workOrderId: created.workOrderId };

    await onEvent?.({
      kind: "tool_call",
      name: "generate_invoice_html",
      input: genInput,
    });

    const gen = await runGenerateInvoiceHtml(genInput, ctx);

    await onEvent?.({
      kind: "tool_result",
      name: "generate_invoice_html",
      output: gen,
    });

    const emailInput = {
      toEmail: emailTo,
      subject: parsed.emailSubject ?? (get<string>(context, "emailSubject") ?? "Your invoice"),
      html: gen.html,
    };

    await onEvent?.({
      kind: "tool_call",
      name: "email_invoice",
      input: emailInput,
    });

    const sent = await runEmailInvoice(emailInput, ctx);

    await onEvent?.({
      kind: "tool_result",
      name: "email_invoice",
      output: sent,
    });
  }

  // 7) Optional: record work-order level approval
  const autoApprove =
    parsed.autoApprove === true ||
    get<boolean>(context, "autoApprove") === true ||
    mode === "approvals";

  if (autoApprove) {
    const rawMethod = parsed.approvalMethod ?? get<string>(context, "approvalMethod");

    const approvalInput = {
      workOrderId: created.workOrderId,
      method: coerceApprovalMethod(rawMethod, mode),
    };

    await onEvent?.({
      kind: "tool_call",
      name: "record_work_order_approval",
      input: approvalInput,
    });

    const approvalResult = await runRecordWorkOrderApproval(approvalInput, ctx);

    await onEvent?.({
      kind: "tool_result",
      name: "record_work_order_approval",
      output: approvalResult,
    });
  }

  await onEvent?.({ kind: "final", text: "Done." });
}