// features/agent/lib/plannerOpenAI.ts
import type { ToolContext } from "./toolTypes";

import {
  runCreateWorkOrder,
  runAddWorkOrderLine,
  runFindCustomerVehicle,
  runGenerateInvoiceHtml,
  runEmailInvoice,
  runCreateCustomer,
  runCreateVehicle,
  runCreateCustomInspection,
  runRecordWorkOrderApproval,
  runGetCustomerVisitHistory,
  runGetVehicleHistory,
  runGetBookings,
  runRescheduleBooking,
  runGetShopCurrentStatus,
  runGetStalledWorkOrders,
  runGetWorkOrderStatusSummary,
} from "./toolRegistry";

type PlannerEvent = {
  kind: string;
  [key: string]: unknown;
};

type OnEvent = (e: PlannerEvent) => Promise<void> | void;

type PlannerMode = "openai" | "ops" | "fleet" | "approvals";
type NotificationLevel = "info" | "warning" | "urgent";

type NotificationItem = {
  level: NotificationLevel;
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

type CitationItem = {
  type: string;
  id: string;
  href: string;
  label: string;
};


type ParsedPlan = {
  action?:
    | "lookup_customer_history"
    | "lookup_vehicle_history"
    | "lookup_bookings"
    | "reschedule_booking"
    | "lookup_tech_work"
    | "lookup_work_order_status"
    | "lookup_stale_work_orders"
    | "create_work_order"
    | "add_line"
    | "create_inspection"
    | "email_invoice"
    | "approve_work_order";
  customerQuery?: string;
  plateOrVin?: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  workOrderId?: string;
  techId?: string;
  techName?: string;
  lineDescription?: string;
  lineNotes?: string;
  laborHours?: number;
  orderType?: "inspection" | "maintenance" | "repair" | "diagnosis";
  jobType?: "maintenance" | "repair" | "diagnosis" | "inspection";
  notes?: string;
  toEmail?: string;
  subject?: string;
  approval?: "approved" | "rejected" | "pending";
  approvalNotes?: string;
  requestedStart?: string;
  requestedEnd?: string;
};

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function coerceOrderType(
  x: unknown,
): "inspection" | "maintenance" | "repair" | "diagnosis" {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  return (["inspection", "maintenance", "repair", "diagnosis"].includes(v)
    ? v
    : "repair") as "inspection" | "maintenance" | "repair" | "diagnosis";
}

const JOB_TYPES = new Set(
  ["maintenance", "repair", "diagnosis", "inspection"] as const,
);

function coerceJobType(
  x: unknown,
): "maintenance" | "repair" | "diagnosis" | "inspection" {
  return typeof x === "string" && JOB_TYPES.has(x as never)
    ? (x as "maintenance" | "repair" | "diagnosis" | "inspection")
    : "repair";
}

function asLevel(value: unknown, fallback: NotificationLevel = "info"): NotificationLevel {
  return value === "warning" || value === "urgent" || value === "info"
    ? value
    : fallback;
}

function asNotifications(value: unknown): NotificationItem[] {
  if (!Array.isArray(value)) return [];

  const out: NotificationItem[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;

    out.push({
      level: asLevel(x.level, "info"),
      code: typeof x.code === "string" ? x.code : "notice",
      title: typeof x.title === "string" ? x.title : "Notice",
      message: typeof x.message === "string" ? x.message : "",
      href: typeof x.href === "string" ? x.href : undefined,
      entityType: typeof x.entityType === "string" ? x.entityType : undefined,
      entityId: typeof x.entityId === "string" ? x.entityId : undefined,
    });
  }

  return out;
}

function getPlannerMode(context: Record<string, unknown>): PlannerMode {
  const raw =
    get<string>(context, "plannerKind") ??
    get<string>(context, "mode") ??
    "openai";

  const v = (raw ?? "openai").toLowerCase();

  if (v === "ops") return "ops";
  if (v === "fleet") return "fleet";
  if (v === "approvals") return "approvals";
  return "openai";
}



function extractCustomerFromGoal(goal: string): string | undefined {
  const match = goal.match(/([A-Z][a-z]+\s[A-Z][a-z]+)/);
  return match ? match[1] : undefined;
}

function extractWorkOrderFromGoal(goal: string): string | undefined {
  const match = goal.match(/WO[#\s]*([A-Za-z0-9\-]+)/i);
  return match ? match[1] : undefined;
}

function extractPlateOrVinFromGoal(goal: string): string | undefined {
  const vinLike = goal.match(/\b[A-HJ-NPR-Z0-9]{11,17}\b/i)?.[0];
  if (vinLike) return vinLike.toUpperCase();

  const plateLike = goal.match(/\b[A-Z0-9]{5,8}\b/i)?.[0];
  return plateLike?.toUpperCase();
}

async function llmParseGoal(
  goal: string,
  context: Record<string, unknown>,
): Promise<ParsedPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return {};

  const system = [
    "You are parsing requests for the ProFixIQ ops assistant.",
    "Return JSON only.",
    "Detect whether the request is asking to look up customer history, vehicle history, bookings, tech work, work order status, stale work orders, or a write action.",
    "Prefer retrieval-style action labels when the user is asking for information.",
    "Allowed action values:",
    [
      "lookup_customer_history",
      "lookup_vehicle_history",
      "lookup_bookings",
      "reschedule_booking",
      "lookup_tech_work",
      "lookup_work_order_status",
      "lookup_stale_work_orders",
      "create_work_order",
      "add_line",
      "create_inspection",
      "email_invoice",
      "approve_work_order",
    ].join(", "),
  ].join("\n");

  const user = JSON.stringify({ goal, context });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) return {};

  const j = (await res.json().catch(() => null)) as unknown;

  const text =
    typeof j === "object" &&
    j !== null &&
    "choices" in j &&
    Array.isArray((j as { choices?: unknown }).choices) &&
    typeof (j as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message
      ?.content === "string"
      ? (j as { choices: Array<{ message: { content: string } }> }).choices[0].message
          .content
      : undefined;

  if (!text) return {};

  try {
    return JSON.parse(text) as ParsedPlan;
  } catch {
    return {};
  }
}

function mergeCitations(
  ...groups: Array<CitationItem[] | undefined>
): CitationItem[] {
  const seen = new Set<string>();
  const out: CitationItem[] = [];

  for (const group of groups) {
    for (const item of group ?? []) {
      const key = `${item.type}:${item.id}:${item.href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

function mergeNotifications(
  ...groups: Array<NotificationItem[] | undefined>
): NotificationItem[] {
  const out: NotificationItem[] = [];
  for (const group of groups) {
    for (const item of group ?? []) out.push(item);
  }
  return out;
}

export async function runOpenAIPlanner(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: OnEvent,
) {
  await onEvent?.({ kind: "plan", text: `Goal: ${goal}` });

  const mode = getPlannerMode(context);

  let parsed: ParsedPlan = {};
  try {
    parsed = await llmParseGoal(goal, context);
  } catch {
    // ignore parse errors
  }

  const lowerGoal = goal.toLowerCase();

  // 🔥 Extract structured hints from goal
  const inferredCustomer = extractCustomerFromGoal(goal);
  const inferredWO = extractWorkOrderFromGoal(goal);


  const customerQuery = inferredCustomer ??
    normalizeText(parsed.customerQuery) ??
    normalizeText(get<string>(context, "customerQuery"));

  const plateOrVin =
    normalizeText(parsed.plateOrVin) ??
    normalizeText(get<string>(context, "plateOrVin")) ??
    extractPlateOrVinFromGoal(goal);

  const customerId =
    normalizeText(parsed.customerId) ?? normalizeText(get<string>(context, "customerId"));

  const vehicleId =
    normalizeText(parsed.vehicleId) ?? normalizeText(get<string>(context, "vehicleId"));

  const workOrderId = inferredWO ??
    normalizeText(parsed.workOrderId) ??
    normalizeText(get<string>(context, "workOrderId")) ??
    normalizeText(get<string>(context, "id"));

  const bookingId =
    normalizeText(parsed.bookingId) ?? normalizeText(get<string>(context, "bookingId"));

  const requestedAction =
    parsed.action ??
    (lowerGoal.includes("last time") || lowerGoal.includes("last visit")
      ? "lookup_customer_history"
      : lowerGoal.includes("vehicle history")
        ? "lookup_vehicle_history"
        : lowerGoal.includes("reschedule") || lowerGoal.includes("move appointment")
          ? "reschedule_booking"
          : lowerGoal.includes("appointment") || lowerGoal.includes("booking")
            ? "lookup_bookings"
            : lowerGoal.includes("tech") && (lowerGoal.includes("working on") || lowerGoal.includes("doing"))
              ? "lookup_tech_work"
              : lowerGoal.includes("on hold") || lowerGoal.includes("status")
                ? "lookup_work_order_status"
                : lowerGoal.includes("too long") || lowerGoal.includes("stale")
                  ? "lookup_stale_work_orders"
                  : undefined);

  const notifications: NotificationItem[] = [];

  if (
    requestedAction === "lookup_customer_history" ||
    (mode === "ops" && customerQuery) ||
    (mode === "ops" && plateOrVin && !workOrderId && !bookingId)
  ) {
    const result = await runGetCustomerVisitHistory(
      {
        customerId,
        customerQuery,
        plateOrVin,
        limit: 10,
      },
      ctx,
    );

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "lookup_vehicle_history") {
    const result = await runGetVehicleHistory(
      {
        vehicleId,
        customerQuery,
        plateOrVin,
        limit: 12,
      },
      ctx,
    );

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "lookup_bookings") {
    const result = await runGetBookings(
      {
        customerId,
        customerQuery,
        plateOrVin,
        status: normalizeText(get<string>(context, "bookingStatus")),
        limit: 20,
      },
      ctx,
    );

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "reschedule_booking" && bookingId && parsed.requestedStart) {
    const result = await runRescheduleBooking(
      {
        bookingId,
        startsAt: parsed.requestedStart,
        endsAt: parsed.requestedEnd,
        notes: parsed.notes,
      },
      ctx,
    );

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "lookup_tech_work") {
    const result = await runGetShopCurrentStatus({}, ctx);

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "lookup_work_order_status" && workOrderId) {
    const result = await runGetWorkOrderStatusSummary({ workOrderId }, ctx);

    notifications.push(...asNotifications(result.notifications));

    if (notifications.length > 0) {
      await onEvent?.({
        kind: "notifications",
        items: notifications,
      });
    }

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return {
      ...result,
      notifications,
    };
  }

  if (requestedAction === "lookup_stale_work_orders") {
    const result = await runGetStalledWorkOrders({}, ctx);

    notifications.push(...asNotifications(result.notifications));

    if (notifications.length > 0) {
      await onEvent?.({
        kind: "notifications",
        items: notifications,
      });
    }

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return {
      ...result,
      notifications,
    };
  }

  const allowCreate =
    get<boolean>(context, "allowCreate") === true ||
    get<boolean>(context, "allow_create") === true;

  let resolvedCustomerId = customerId;
  let resolvedVehicleId = vehicleId;

  if (!resolvedCustomerId || !resolvedVehicleId) {
    await onEvent?.({
      kind: "tool_call",
      name: "find_customer_vehicle",
      input: {
        customerQuery,
        plateOrVin,
      },
    });

    const found = await runFindCustomerVehicle(
      {
        customerQuery,
        plateOrVin,
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "find_customer_vehicle",
      output: found,
    });

    resolvedCustomerId = resolvedCustomerId ?? found.customerId ?? undefined;
    resolvedVehicleId = resolvedVehicleId ?? found.vehicleId ?? undefined;

    if ((!resolvedCustomerId || !resolvedVehicleId) && !allowCreate) {
      const summary =
        "I could not safely continue because the customer/vehicle could not be resolved from existing records.";
      await onEvent?.({ kind: "final", text: summary });
      return { summary, citations: [], notifications: [] };
    }

    if (!resolvedCustomerId && allowCreate) {
      const name = customerQuery ?? "Customer";

      await onEvent?.({
        kind: "tool_call",
        name: "create_customer",
        input: { name },
      });

      const createdCustomer = await runCreateCustomer({ name }, ctx);
      resolvedCustomerId = createdCustomer.customerId;

      await onEvent?.({
        kind: "tool_result",
        name: "create_customer",
        output: createdCustomer,
      });
    }

    if (!resolvedVehicleId && allowCreate && resolvedCustomerId) {
      await onEvent?.({
        kind: "tool_call",
        name: "create_vehicle",
        input: {
          customerId: resolvedCustomerId,
          vin: plateOrVin,
          license_plate: plateOrVin,
        },
      });

      const createdVehicle = await runCreateVehicle(
        {
          customerId: resolvedCustomerId,
          vin: plateOrVin,
          license_plate: plateOrVin,
        },
        ctx,
      );

      resolvedVehicleId = createdVehicle.vehicleId;

      await onEvent?.({
        kind: "tool_result",
        name: "create_vehicle",
        output: createdVehicle,
      });
    }
  }

  if (
    (requestedAction === "create_work_order" || lowerGoal.includes("create work order")) &&
    resolvedCustomerId &&
    resolvedVehicleId
  ) {
    const orderType = coerceOrderType(parsed.orderType ?? get(context, "orderType"));

    await onEvent?.({
      kind: "tool_call",
      name: "create_work_order",
      input: {
        customerId: resolvedCustomerId,
        vehicleId: resolvedVehicleId,
        type: orderType,
        notes: parsed.notes ?? normalizeText(get<string>(context, "notes")),
      },
    });

    const created = await runCreateWorkOrder(
      {
        customerId: resolvedCustomerId,
        vehicleId: resolvedVehicleId,
        type: orderType,
        notes: parsed.notes ?? normalizeText(get<string>(context, "notes")),
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "create_work_order",
      output: created,
    });

    await onEvent?.({
      kind: "wo.created",
      workOrderId: created.workOrderId,
      customerId: resolvedCustomerId,
      vehicleId: resolvedVehicleId,
    });

    const summary = `Created work order ${created.workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "work_order",
          id: created.workOrderId,
          href: `/work-orders/${created.workOrderId}`,
          label: `Work order ${created.workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "work_order",
          id: created.workOrderId,
          href: `/work-orders/${created.workOrderId}`,
          label: `Work order ${created.workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  if (
    requestedAction === "add_line" &&
    workOrderId &&
    normalizeText(parsed.lineDescription)
  ) {
    await onEvent?.({
      kind: "tool_call",
      name: "add_work_order_line",
      input: {
        workOrderId,
        description: parsed.lineDescription,
        jobType: coerceJobType(parsed.jobType),
        laborHours: typeof parsed.laborHours === "number" ? parsed.laborHours : 0,
        notes: parsed.lineNotes,
      },
    });

    const added = await runAddWorkOrderLine(
      {
        workOrderId,
        description: parsed.lineDescription!,
        jobType: coerceJobType(parsed.jobType),
        laborHours: typeof parsed.laborHours === "number" ? parsed.laborHours : 0,
        notes: parsed.lineNotes,
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "add_work_order_line",
      output: added,
    });

    const summary = `Added a line to work order ${workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/work-orders/${workOrderId}`,
          label: `Work order ${workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/work-orders/${workOrderId}`,
          label: `Work order ${workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  if (requestedAction === "create_inspection" && workOrderId) {
    const inspectionTitle = parsed.notes ?? "Custom Inspection";

    await onEvent?.({
      kind: "tool_call",
      name: "create_custom_inspection",
      input: {
        workOrderId,
        title: inspectionTitle,
      },
    });

    const inspection = await runCreateCustomInspection(
      {
        workOrderId,
        title: inspectionTitle,
        selections: {},
        services: [],
        vehicleType: "car",
        includeAxle: false,
        includeOil: false,
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "create_custom_inspection",
      output: inspection,
    });

    const summary = `Created a custom inspection for work order ${workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/work-orders/${workOrderId}`,
          label: `Work order ${workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/work-orders/${workOrderId}`,
          label: `Work order ${workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  if (
    requestedAction === "email_invoice" &&
    workOrderId &&
    normalizeText(parsed.toEmail)
  ) {
    await onEvent?.({
      kind: "tool_call",
      name: "generate_invoice_html",
      input: { workOrderId },
    });

    const html = await runGenerateInvoiceHtml({ workOrderId }, ctx);

    await onEvent?.({
      kind: "tool_result",
      name: "generate_invoice_html",
      output: html,
    });

    await onEvent?.({
      kind: "tool_call",
      name: "email_invoice",
      input: {
        toEmail: parsed.toEmail,
        subject: parsed.subject ?? "Your invoice",
      },
    });

    const emailed = await runEmailInvoice(
      {
        toEmail: parsed.toEmail!,
        subject: parsed.subject ?? "Your invoice",
        html: html.html,
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "email_invoice",
      output: emailed,
    });

    const summary = `Invoice emailed for work order ${workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "invoice",
          id: workOrderId,
          href: `/work-orders/invoice/${workOrderId}`,
          label: `Invoice ${workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "invoice",
          id: workOrderId,
          href: `/work-orders/invoice/${workOrderId}`,
          label: `Invoice ${workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  if (
    requestedAction === "approve_work_order" &&
    workOrderId &&
    parsed.approval
  ) {
    const approvalState:
      | "advisor_approved"
      | "rejected"
      | "pending" =
      parsed.approval === "approved"
        ? "advisor_approved"
        : parsed.approval === "rejected"
          ? "rejected"
          : "pending";

    await onEvent?.({
      kind: "tool_call",
      name: "record_work_order_approval",
      input: {
        workOrderId,
        method: "advisor",
        approvalState,
        approvedBy: ctx.userId,
        approvedAt: new Date().toISOString(),
      },
    });

    const approval = await runRecordWorkOrderApproval(
      {
        workOrderId,
        method: "advisor",
        approvalState,
        approvedBy: ctx.userId,
        approvedAt: new Date().toISOString(),
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "record_work_order_approval",
      output: approval,
    });

    const summary = `Recorded ${approvalState} for work order ${workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/quote-review/${workOrderId}`,
          label: `Approval ${workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/quote-review/${workOrderId}`,
          label: `Approval ${workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  const stale = await runGetStalledWorkOrders({}, ctx);
  const summary =
    "I couldn’t map that request to a specific action yet, so I checked for shop issues that may need attention.";

  const mergedNotifications = mergeNotifications(
    notifications,
    asNotifications(stale.notifications),
  );

  if (mergedNotifications.length > 0) {
    await onEvent?.({
      kind: "notifications",
      items: mergedNotifications,
    });
  }

  await onEvent?.({
    kind: "final",
    text: `${summary} ${stale.summary}`,
    citations: stale.citations ?? [],
  });

  return {
    summary: `${summary} ${stale.summary}`,
    citations: mergeCitations(stale.citations),
    notifications: mergedNotifications,
  };
}
