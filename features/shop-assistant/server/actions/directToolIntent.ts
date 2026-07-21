import "server-only";

import { canonicalizeRole } from "@/features/shared/lib/rbac";
import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  createPendingAction,
  mapActionPreview,
  mapActionResult,
} from "@/features/shop-assistant/server/actions/actionStore";
import {
  previewShopAssistantWriteTool,
  runShopAssistantReadTool,
} from "@/features/shop-assistant/server/tools/registry";
import type {
  ShopAssistantActionPreview,
  ShopAssistantActionResult,
  ShopAssistantContext,
  ShopAssistantDomain,
  ShopAssistantThreadContext,
} from "@/features/shop-assistant/types";

export type DirectToolIntentResult =
  | {
      kind: "read_result";
      toolName: string;
      domain: ShopAssistantDomain;
      content: string;
      output: Record<string, unknown>;
      resolvedContext?: ShopAssistantThreadContext;
    }
  | {
      kind: "confirmation_required";
      content: string;
      action: ShopAssistantActionPreview;
      resolvedContext?: ShopAssistantThreadContext;
    }
  | {
      kind: "action_result";
      content: string;
      action: ShopAssistantActionResult;
      resolvedContext?: ShopAssistantThreadContext;
    }
  | {
      kind: "clarification_required";
      content: string;
      fields: Array<{
        name: string;
        label: string;
        type: "text" | "select" | "date" | "datetime";
        options?: Array<{ label: string; value: string }>;
      }>;
    };

type ResolvedWorkOrder = {
  id: string;
  customId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractUuid(value: string): string | null {
  return (
    value.match(
      /\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i,
    )?.[1] ?? null
  );
}

function extractWorkOrderReference(question: string): string | null {
  const explicit = question.match(
    /\b(?:work\s*order|wo)\s*#?\s*([A-Z]{1,6}-?\d{3,}|[0-9a-f-]{36})\b/i,
  )?.[1];
  if (explicit) return explicit;

  return (
    question.match(/\b([A-Z]{1,6}-?\d{3,})\b/i)?.[1] ??
    extractUuid(question)
  );
}

async function resolveWorkOrder(params: {
  actor: ShopAssistantActor;
  question: string;
  pageContext?: ShopAssistantContext;
  threadContext?: ShopAssistantThreadContext;
}): Promise<ResolvedWorkOrder | null> {
  const reference =
    extractWorkOrderReference(params.question) ??
    params.pageContext?.workOrderId ??
    params.threadContext?.activeWorkOrderId ??
    null;
  if (!reference) return null;

  const uuid = extractUuid(reference);
  let query = params.actor.supabase
    .from("work_orders")
    .select("id, custom_id")
    .eq("shop_id", params.actor.shopId);
  query = uuid
    ? query.eq("id", uuid)
    : query.ilike("custom_id", reference.replace(/^#/, ""));

  const { data, error } = await query.limit(2);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(`No same-shop work order matched ${reference}.`);
  }
  if (data.length > 1) {
    throw new Error(`More than one work order matched ${reference}.`);
  }
  return { id: data[0].id, customId: data[0].custom_id ?? null };
}

function holdReason(question: string): string {
  const lower = question.toLowerCase();
  if (/parts?|back[- ]?order/.test(lower)) return "Awaiting parts";
  if (/approval|authori[sz]ation/.test(lower)) {
    return "Awaiting customer authorization";
  }
  if (/information|more info|diagnostic info/.test(lower)) {
    return "Need additional info";
  }
  const explicit = question.match(/\b(?:because|reason|for)\s+(.{2,120})$/i)?.[1];
  return explicit?.trim() || "Hold for assistance";
}

function formatListRows(
  rows: unknown,
  formatter: (row: Record<string, unknown>) => string | null,
  limit = 8,
): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => formatter(asRecord(row)))
    .filter((row): row is string => Boolean(row))
    .slice(0, limit);
}

function formatReadOutput(toolName: string, output: unknown): string {
  const record = asRecord(output);
  const summary = stringValue(record.summary) ?? `${toolName} completed.`;
  let bullets: string[] = [];

  if (toolName === "list_low_stock_parts") {
    bullets = formatListRows(record.items, (item) => {
      const name = stringValue(item.name);
      const quantity = numberValue(item.quantityOnHand);
      const threshold = numberValue(item.threshold);
      const reorder = numberValue(item.suggestedReorder);
      return name && quantity != null && threshold != null && reorder != null
        ? `${name}: ${quantity} on hand, threshold ${threshold}, suggested reorder ${reorder}.`
        : null;
    });
  } else if (toolName === "list_parts_blockers") {
    bullets = formatListRows(record.blockers, (item) => {
      const description = stringValue(item.description);
      const remaining = numberValue(item.remainingQuantity);
      const label = stringValue(item.workOrderLabel);
      return description && remaining != null
        ? `${label ? `${label}: ` : ""}${description} — ${remaining} still unreceived.`
        : null;
    });
  } else if (toolName === "list_ready_invoices") {
    bullets = formatListRows(record.workOrders, (item) => {
      const customId = stringValue(item.customId);
      const status = stringValue(item.status);
      const customerName = stringValue(item.customerName);
      return `${customId ? `WO #${customId}` : "Work order"} • ${status ?? "ready"}${customerName ? ` • ${customerName}` : ""}`;
    });
  } else if (toolName === "list_technician_load") {
    bullets = formatListRows(record.technicians, (item) => {
      const name = stringValue(item.name);
      const active = numberValue(item.activeJobs);
      const utilization = numberValue(item.utilizationPct);
      return name && active != null && utilization != null
        ? `${name}: ${active} active job(s), ${utilization}% utilization.`
        : null;
    });
  } else if (toolName === "list_bookings") {
    bullets = formatListRows(record.bookings, (item) => {
      const startsAt = stringValue(item.startsAt);
      const status = stringValue(item.status);
      return startsAt ? `${startsAt} • ${status ?? "scheduled"}` : null;
    });
  } else if (toolName === "find_customers") {
    bullets = formatListRows(record.customers, (item) => {
      const name = stringValue(item.name);
      const email = stringValue(item.email);
      const phone = stringValue(item.phone);
      return name
        ? [name, email, phone].filter(Boolean).join(" • ")
        : null;
    });
  } else if (toolName === "list_inspections") {
    bullets = formatListRows(record.inspections, (item) => {
      const status = stringValue(item.status);
      const workOrderId = stringValue(item.workOrderId);
      return `${workOrderId ? `WO ${workOrderId.slice(0, 8)}` : "Inspection"} • ${status ?? "unknown"}${item.completed === true ? " • completed" : ""}`;
    });
  } else if (toolName === "read_shop_state") {
    bullets = formatListRows(record.alerts, (item) => {
      const title = stringValue(item.title);
      const message = stringValue(item.message);
      return title ? `${title}${message ? ` — ${message}` : ""}` : null;
    }, 5);
  }

  return [summary, ...bullets.map((bullet) => `• ${bullet}`)].join("\n");
}

function extractQuotedText(question: string): string | null {
  return question.match(/[“"]([^”"]+)[”"]/u)?.[1]?.trim() ?? null;
}

function parseDateTime(question: string): string | null {
  const iso = question.match(
    /\b(20\d{2}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?)\b/,
  )?.[1];
  if (!iso) return null;
  const parsed = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function previewWrite(params: {
  actor: ShopAssistantActor;
  threadId: string;
  clientMessageId: string;
  toolName: string;
  input: unknown;
  resolvedContext?: ShopAssistantThreadContext;
}): Promise<DirectToolIntentResult> {
  const idempotencyKey = `${params.threadId}:${params.clientMessageId}:${params.toolName}`;
  const prepared = await previewShopAssistantWriteTool({
    name: params.toolName,
    input: params.input,
    context: {
      actor: params.actor,
      threadId: params.threadId,
      idempotencyKey,
    },
  });
  const actionWrite = await createPendingAction({
    actor: params.actor,
    threadId: params.threadId,
    toolName: prepared.metadata.name,
    domain: prepared.metadata.domain,
    risk: prepared.metadata.risk,
    input: prepared.input,
    preview: prepared.preview,
    idempotencyKey,
  });

  if (
    actionWrite.row.status === "succeeded" ||
    actionWrite.row.status === "failed" ||
    actionWrite.row.status === "cancelled" ||
    actionWrite.row.status === "expired"
  ) {
    const result = mapActionResult(actionWrite.row);
    return {
      kind: "action_result",
      content: result.summary,
      action: result,
      resolvedContext: params.resolvedContext,
    };
  }

  const action = mapActionPreview(actionWrite.row);
  return {
    kind: "confirmation_required",
    content: `${action.title}\n${action.summary}`,
    action,
    resolvedContext: params.resolvedContext,
  };
}

async function runRead(params: {
  actor: ShopAssistantActor;
  threadId: string;
  clientMessageId: string;
  toolName: string;
  domain: ShopAssistantDomain;
  input: unknown;
  resolvedContext?: ShopAssistantThreadContext;
}): Promise<DirectToolIntentResult> {
  const output = await runShopAssistantReadTool({
    name: params.toolName,
    input: params.input,
    context: {
      actor: params.actor,
      threadId: params.threadId,
      idempotencyKey: `${params.threadId}:${params.clientMessageId}:${params.toolName}`,
    },
  });
  return {
    kind: "read_result",
    toolName: params.toolName,
    domain: params.domain,
    content: formatReadOutput(params.toolName, output),
    output: asRecord(output),
    resolvedContext: params.resolvedContext,
  };
}

export async function routeDirectToolIntent(params: {
  actor: ShopAssistantActor;
  threadId: string;
  clientMessageId: string;
  question: string;
  pageContext?: ShopAssistantContext;
  threadContext?: ShopAssistantThreadContext;
}): Promise<DirectToolIntentResult | null> {
  const question = params.question.trim();
  const isHold =
    /\b(?:put|place|set|mark|move)\b.*\b(?:on\s+hold|hold)\b/i.test(question) ||
    /\bhold\b.*\b(?:work\s*order|wo|[A-Z]{1,6}-?\d{3,})\b/i.test(question);
  const isReleaseHold =
    /\b(?:release|remove|clear|take)\b.*\bhold\b/i.test(question);

  if (isHold && !isReleaseHold) {
    const workOrder = await resolveWorkOrder(params);
    if (!workOrder) {
      return {
        kind: "clarification_required",
        content: "Which work order should be placed on hold?",
        fields: [
          { name: "workOrder", label: "Work order number", type: "text" },
          { name: "reason", label: "Hold reason", type: "text" },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "hold_work_order",
      input: { workOrderId: workOrder.id, reason: holdReason(question) },
      resolvedContext: { activeWorkOrderId: workOrder.id, lastDomain: "work_orders" },
    });
  }

  if (isReleaseHold) {
    const workOrder = await resolveWorkOrder(params);
    if (!workOrder) {
      return {
        kind: "clarification_required",
        content: "Which work order hold should be released?",
        fields: [
          { name: "workOrder", label: "Work order number", type: "text" },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "release_work_order_hold",
      input: { workOrderId: workOrder.id },
      resolvedContext: { activeWorkOrderId: workOrder.id, lastDomain: "work_orders" },
    });
  }

  const assignMatch = question.match(
    /\b(?:assign|move)\s+(?:(?:work\s*order|wo)\s*)?#?([A-Z]{1,6}-?\d{3,}|[0-9a-f-]{36})\s+to\s+(.{2,80})$/i,
  );
  if (assignMatch) {
    const workOrder = await resolveWorkOrder(params);
    const techQuery = assignMatch[2].replace(/[.!?]+$/, "").trim();
    const { data: matchedProfiles, error } = await params.actor.supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("shop_id", params.actor.shopId)
      .ilike("full_name", `%${techQuery.replace(/[%,]/g, " ")}%`)
      .limit(25);
    if (error) throw new Error(error.message);
    const techs = (matchedProfiles ?? [])
      .filter((profile) => {
        const role = canonicalizeRole(profile.role);
        return role === "mechanic" || role === "lead_hand" || role === "foreman";
      })
      .slice(0, 10);
    if (!workOrder) {
      return {
        kind: "clarification_required",
        content: "Which work order should be assigned?",
        fields: [{ name: "workOrder", label: "Work order", type: "text" }],
      };
    }
    if (techs.length !== 1) {
      return {
        kind: "clarification_required",
        content:
          techs.length > 1
            ? `More than one technician matched “${techQuery}”. Select one.`
            : `No same-shop technician matched “${techQuery}”.`,
        fields: [
          {
            name: "technicianId",
            label: "Technician",
            type: "select",
            options: techs.map((tech) => ({
              label: tech.full_name ?? tech.id,
              value: tech.id,
            })),
          },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "assign_work_order",
      input: {
        workOrderId: workOrder.id,
        technicianId: techs[0].id,
        onlyUnassigned: true,
      },
      resolvedContext: { activeWorkOrderId: workOrder.id, lastDomain: "workforce" },
    });
  }

  if (/\b(?:reschedule|move)\b.*\b(?:booking|appointment)\b/i.test(question)) {
    const bookingId = extractUuid(question) ?? params.pageContext?.bookingId ?? null;
    const startsAt = parseDateTime(question);
    if (!bookingId || !startsAt) {
      return {
        kind: "clarification_required",
        content: "Provide the appointment and its new date and time.",
        fields: [
          { name: "bookingId", label: "Appointment", type: "text" },
          { name: "startsAt", label: "New start", type: "datetime" },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "reschedule_booking",
      input: { bookingId, startsAt },
      resolvedContext: { activeBookingId: bookingId, lastDomain: "scheduling" },
    });
  }

  if (/\b(?:send|message)\b.*\b(?:conversation|customer|client)\b/i.test(question)) {
    const conversationId = extractUuid(question);
    const content = extractQuotedText(question);
    if (!conversationId || !content) {
      return {
        kind: "clarification_required",
        content:
          "Provide the conversation id and put the exact message in quotation marks.",
        fields: [
          { name: "conversationId", label: "Conversation", type: "text" },
          { name: "content", label: "Exact message", type: "text" },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "send_conversation_message",
      input: { conversationId, content },
      resolvedContext: { lastDomain: "customer_communications" },
    });
  }

  if (/\b(?:create|add)\b.*\bcustomer\b/i.test(question)) {
    const quotedName = extractQuotedText(question);
    const email = question.match(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/)?.[0];
    const nameMatch = question.match(
      /\b(?:create|add)\s+(?:a\s+|new\s+)?customer\s+(.+?)(?:\s+with\s+|\s+email\s+|\s+phone\s+|$)/i,
    )?.[1];
    const name = quotedName ?? nameMatch?.replace(/[.!?]+$/, "").trim() ?? null;
    if (!name) {
      return {
        kind: "clarification_required",
        content: "What is the new customer’s name?",
        fields: [
          { name: "name", label: "Customer name", type: "text" },
          { name: "email", label: "Email", type: "text" },
          { name: "phone", label: "Phone", type: "text" },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "create_customer",
      input: { name, email },
      resolvedContext: { lastDomain: "customers" },
    });
  }

  if (/\b(?:low stock|low inventory|reorder)\b/i.test(question)) {
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "list_low_stock_parts",
      domain: "inventory",
      input: { limit: 20 },
      resolvedContext: { lastDomain: "inventory" },
    });
  }

  if (/\b(?:parts? blockers?|waiting on parts|parts? delayed)\b/i.test(question)) {
    const workOrder = await resolveWorkOrder(params).catch(() => null);
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "list_parts_blockers",
      domain: "inventory",
      input: { workOrderId: workOrder?.id, limit: 20 },
      resolvedContext: {
        activeWorkOrderId: workOrder?.id,
        lastDomain: "inventory",
      },
    });
  }

  if (/\b(?:ready to invoice|ready for invoice|invoice queue|billing queue)\b/i.test(question)) {
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "list_ready_invoices",
      domain: "invoices",
      input: { limit: 20 },
      resolvedContext: { lastDomain: "invoices" },
    });
  }

  if (/\b(?:technician load|tech load|who is idle|available tech|available technician|workload)\b/i.test(question)) {
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "list_technician_load",
      domain: "workforce",
      input: { includeOffShift: false },
      resolvedContext: { lastDomain: "workforce" },
    });
  }

  if (/\b(?:appointments?|bookings?|schedule)\b/i.test(question)) {
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "list_bookings",
      domain: "scheduling",
      input: { limit: 20 },
      resolvedContext: { lastDomain: "scheduling" },
    });
  }

  if (/\b(?:inspection status|open inspections?|inspection queue)\b/i.test(question)) {
    const workOrder = await resolveWorkOrder(params).catch(() => null);
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "list_inspections",
      domain: "inspections",
      input: { workOrderId: workOrder?.id, onlyOpen: true, limit: 20 },
      resolvedContext: {
        activeWorkOrderId: workOrder?.id,
        lastDomain: "inspections",
      },
    });
  }

  if (/\b(?:find|look up|search)\b.*\bcustomer\b/i.test(question)) {
    const query =
      extractQuotedText(question) ??
      question.match(/\bcustomer\s+(.{2,100})$/i)?.[1]?.trim() ??
      null;
    if (!query) {
      return {
        kind: "clarification_required",
        content: "Which customer should I search for?",
        fields: [{ name: "query", label: "Name, email, or phone", type: "text" }],
      };
    }
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "find_customers",
      domain: "customers",
      input: { query, limit: 10 },
      resolvedContext: { lastDomain: "customers" },
    });
  }

  if (/\b(?:revenue|business snapshot|financial snapshot|throughput report)\b/i.test(question)) {
    const days = Number(question.match(/\b(\d{1,3})\s+days?\b/i)?.[1] ?? 30);
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "read_business_snapshot",
      domain: "business_analytics",
      input: { lookbackDays: Math.min(Math.max(days, 1), 365) },
      resolvedContext: { lastDomain: "business_analytics" },
    });
  }

  if (/\b(?:shop status|how is the shop|how's the shop|operations summary)\b/i.test(question)) {
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "read_shop_state",
      domain: "reporting",
      input: {},
      resolvedContext: { lastDomain: "reporting" },
    });
  }

  const workOrder = extractWorkOrderReference(question)
    ? await resolveWorkOrder(params)
    : null;
  if (
    workOrder &&
    /\b(?:status|show|open|where is|what is happening|what's happening)\b/i.test(
      question,
    )
  ) {
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "read_work_order",
      domain: "work_orders",
      input: { workOrderId: workOrder.id },
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "work_orders",
      },
    });
  }

  return null;
}
