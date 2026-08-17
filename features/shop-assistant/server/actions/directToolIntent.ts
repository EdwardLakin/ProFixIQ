import "server-only";

import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";
import {
  ShopAssistantHttpError,
  type ShopAssistantActor,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  formatShopAssistantToolOutput,
  recordOutput,
} from "@/features/shop-assistant/server/orchestrator/formatToolOutput";
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
        required?: boolean;
        options?: Array<{ label: string; value: string }>;
      }>;
    };

type ResolvedWorkOrder = {
  id: string;
  customId: string | null;
};

function extractUuid(value: string): string | null {
  return (
    value.match(
      /\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i,
    )?.[1] ?? null
  );
}

function extractUuids(value: string): string[] {
  return [
    ...new Set(
      Array.from(
        value.matchAll(
          /\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/gi,
        ),
        (match) => match[1].toLowerCase(),
      ),
    ),
  ];
}

function extractWorkOrderReference(question: string): string | null {
  const explicit = question.match(
    /\b(?:work\s*order|wo)\s*#?\s*([A-Z]{1,6}-?\d{3,}|[0-9a-f-]{36})\b/i,
  )?.[1];
  if (explicit) return explicit;

  return (
    question.match(/\b([A-Z]{1,6}-?\d{3,})\b/i)?.[1] ?? extractUuid(question)
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
  let query = createAdminSupabase()
    .from("work_orders")
    .select("id, custom_id")
    .eq("shop_id", params.actor.shopId);
  query = uuid
    ? query.eq("id", uuid)
    : query.ilike("custom_id", reference.replace(/^#/, ""));

  const { data, error } = await query.limit(2);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new ShopAssistantHttpError(
      404,
      `No same-shop work order matched ${reference}.`,
    );
  }
  if (data.length > 1) {
    throw new ShopAssistantHttpError(
      409,
      `More than one work order matched ${reference}.`,
    );
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
  const explicit = question.match(
    /\b(?:because|reason|for)\s+(.{2,120})$/i,
  )?.[1];
  return explicit?.trim() || "Hold for assistance";
}

function extractQuotedText(question: string): string | null {
  return question.match(/[“"]([^”"]+)[”"]/u)?.[1]?.trim() ?? null;
}

async function parseDateTime(
  question: string,
  actor: ShopAssistantActor,
): Promise<string | null> {
  const match = question.match(
    /\b(20\d{2}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:?\d{2})?\b/,
  );
  if (!match) return null;

  const [, dateKey, timeValue, offset] = match;
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute, second = 0] = timeValue.split(":").map(Number);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() + 1 !== month ||
    calendarCheck.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  if (offset) {
    const parsed = new Date(`${dateKey}T${timeValue}${offset}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const { data: shop, error } = await createAdminSupabase()
    .from("shops")
    .select("timezone")
    .eq("id", actor.shopId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const timezone = shop?.timezone?.trim();
  if (!timezone) {
    throw new ShopAssistantHttpError(409, "The shop timezone is unavailable.");
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  } catch {
    throw new ShopAssistantHttpError(
      409,
      "The shop timezone is invalid. Correct it in shop settings before rescheduling.",
    );
  }

  const resolved = shopLocalDateTimeToUtc(dateKey, timeValue, timezone);
  const expected = `${dateKey}T${timeValue.padEnd(8, ":00")}`;
  const localStamp = (instant: string | number): string => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const value = (kind: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === kind)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`;
  };
  if (localStamp(resolved) !== expected) {
    throw new ShopAssistantHttpError(
      400,
      "That local time does not exist in the shop timezone because of a clock change. Choose another time or include an explicit UTC offset.",
    );
  }
  const resolvedMs = new Date(resolved).getTime();
  for (const deltaMinutes of [-120, -90, -60, -30, 30, 60, 90, 120]) {
    if (localStamp(resolvedMs + deltaMinutes * 60_000) === expected) {
      throw new ShopAssistantHttpError(
        400,
        "That local time occurs twice in the shop timezone because of a clock change. Include an explicit UTC offset.",
      );
    }
  }
  return resolved;
}

function paymentAmount(question: string): number | null {
  const raw =
    question.match(/(?:\$|\b(?:CAD|USD)\s*)(\d+(?:\.\d{1,2})?)/i)?.[1] ??
    question.match(
      /\b(?:payment(?:\s+of)?|amount)\s*:?\s*(\d+(?:\.\d{1,2})?)/i,
    )?.[1];
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function paymentMethod(
  question: string,
): "cash" | "cheque" | "terminal" | "eft" | "financing" | "other" | null {
  if (/\b(?:cash)\b/i.test(question)) return "cash";
  if (/\b(?:cheque|check)\b/i.test(question)) return "cheque";
  if (/\b(?:terminal|card terminal|debit|credit card)\b/i.test(question)) {
    return "terminal";
  }
  if (/\b(?:eft|e-transfer|etransfer|bank transfer)\b/i.test(question)) {
    return "eft";
  }
  if (/\bfinanc(?:e|ing)\b/i.test(question)) return "financing";
  if (/\bother\b/i.test(question)) return "other";
  return null;
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
    content: formatShopAssistantToolOutput(params.toolName, output),
    output: recordOutput(output),
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
  mode?: "all" | "writes_only";
}): Promise<DirectToolIntentResult | null> {
  const question = params.question.trim();
  const approvalDecision = question
    .match(/^\s*(?:please\s+)?(approve|decline|defer)\b/i)?.[1]
    ?.toLowerCase() as "approve" | "decline" | "defer" | undefined;
  if (
    approvalDecision &&
    params.actor.capabilities.canAuthorizeQuotes &&
    /\b(?:approval|quote|estimate|line|item|work\s*order|wo|all|remaining)\b/i.test(
      question,
    )
  ) {
    const workOrder = await resolveWorkOrder(params);
    if (!workOrder) {
      return {
        kind: "clarification_required",
        content: "Which work order contains the approval items?",
        fields: [{ name: "workOrder", label: "Work order", type: "text" }],
      };
    }
    const allPending = /\b(?:all|every|remaining)\b/i.test(question);
    const itemIds = extractUuids(question).filter(
      (id) => id !== workOrder.id.toLowerCase(),
    );
    if (!allPending && itemIds.length === 0) {
      return {
        kind: "clarification_required",
        content:
          "Should I apply that decision to all pending items, or only specific approval items?",
        fields: [
          {
            name: "scope",
            label: "Approval scope",
            type: "select",
            options: [
              { label: "All pending items", value: "all" },
              { label: "Specific items", value: "selected" },
            ],
          },
        ],
      };
    }
    const contactMethod = /\bin[ -]?person\b/i.test(question)
      ? "in_person"
      : /\bphone|call(?:ed)?\b/i.test(question)
        ? "phone"
        : /\bemail(?:ed)?\b/i.test(question)
          ? "email"
          : "other";
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "record_approval_decision",
      input: {
        workOrderId: workOrder.id,
        itemIds,
        allPending,
        decision: approvalDecision,
        contactMethod,
      },
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "work_orders",
      },
    });
  }

  if (
    params.actor.capabilities.canManageWorkOrders &&
    params.actor.capabilities.canAuthorizeQuotes &&
    /\b(?:finalize|issue)\b.*\binvoice\b/i.test(question)
  ) {
    const workOrder = await resolveWorkOrder(params);
    if (!workOrder) {
      return {
        kind: "clarification_required",
        content: "Which work order should I finalize into an invoice?",
        fields: [{ name: "workOrder", label: "Work order", type: "text" }],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "finalize_invoice",
      input: { workOrderId: workOrder.id },
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "invoices",
      },
    });
  }

  if (
    params.actor.capabilities.canManageWorkOrders &&
    params.actor.capabilities.canAuthorizeQuotes &&
    /\b(?:mark|move|set)\b.*\bready\s+to\s+invoice\b/i.test(question)
  ) {
    const workOrder = await resolveWorkOrder(params);
    if (!workOrder) {
      return {
        kind: "clarification_required",
        content: "Which work order should be marked ready to invoice?",
        fields: [{ name: "workOrder", label: "Work order", type: "text" }],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "mark_work_order_ready_to_invoice",
      input: { workOrderId: workOrder.id },
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "work_orders",
      },
    });
  }

  const reversePayment =
    /\b(?:reverse|reversal|undo)\b.*\bpayment\b|\bpayment\b.*\b(?:reverse|reversal|undo)\b/i.test(
      question,
    );
  if (
    params.actor.capabilities.canManageWorkOrders &&
    /\b(?:record|post|apply|add)\b.*\bpayment\b/i.test(question) &&
    !reversePayment
  ) {
    const workOrder = await resolveWorkOrder(params);
    const amount = paymentAmount(question);
    const method = paymentMethod(question);
    if (!workOrder || !amount || !method) {
      return {
        kind: "clarification_required",
        content: "Provide the work order, amount, and external payment method.",
        fields: [
          { name: "workOrder", label: "Work order", type: "text" },
          { name: "amount", label: "Amount", type: "text" },
          {
            name: "method",
            label: "Payment method",
            type: "select",
            options: [
              { label: "Card terminal", value: "terminal" },
              { label: "Cash", value: "cash" },
              { label: "Cheque", value: "cheque" },
              { label: "EFT / e-transfer", value: "eft" },
              { label: "Financing", value: "financing" },
              { label: "Other", value: "other" },
            ],
          },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "record_manual_invoice_payment",
      input: { workOrderId: workOrder.id, amount, method },
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "invoices",
      },
    });
  }

  if (params.actor.capabilities.canManageWorkOrders && reversePayment) {
    const workOrder = await resolveWorkOrder(params);
    const amount = paymentAmount(question);
    const reason =
      question.match(/\b(?:because|reason)\s*:?\s*(.{3,500})$/i)?.[1]?.trim() ??
      null;
    if (!workOrder || !amount || !reason) {
      return {
        kind: "clarification_required",
        content: "Provide the work order, reversal amount, and audit reason.",
        fields: [
          { name: "workOrder", label: "Work order", type: "text" },
          { name: "amount", label: "Amount", type: "text" },
          { name: "reason", label: "Reversal reason", type: "text" },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "reverse_manual_invoice_payment",
      input: { workOrderId: workOrder.id, amount, reason },
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "invoices",
      },
    });
  }

  const isHold =
    /\b(?:put|place|set|mark|move)\b.*\b(?:on\s+hold|hold)\b/i.test(question) ||
    /\bhold\b.*\b(?:work\s*order|wo|[A-Z]{1,6}-?\d{3,})\b/i.test(question);
  const isReleaseHold = /\b(?:release|remove|clear|take)\b.*\bhold\b/i.test(
    question,
  );

  if (
    isHold &&
    !isReleaseHold &&
    params.actor.capabilities.canManageWorkOrders
  ) {
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
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "work_orders",
      },
    });
  }

  if (isReleaseHold && params.actor.capabilities.canManageWorkOrders) {
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
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "work_orders",
      },
    });
  }

  const assignMatch = question.match(
    /\b(?:assign|move)\s+(?:(?:work\s*order|wo)\s*)?#?([A-Z]{1,6}-?\d{3,}|[0-9a-f-]{36})\s+to\s+([^\n]{2,80})(?:\n|$)/i,
  );
  if (assignMatch && params.actor.capabilities.canAssignWork) {
    const workOrder = await resolveWorkOrder(params);
    const techQuery = assignMatch[2].replace(/[.!?]+$/, "").trim();
    const clarifiedTechnicianId = question.match(
      /(?:^|\n)Technician:\s*([0-9a-f-]{36})(?:\n|$)/i,
    )?.[1];
    let technicianQuery = createAdminSupabase()
      .from("profiles")
      .select("id, full_name, role")
      .eq("shop_id", params.actor.shopId);
    technicianQuery = clarifiedTechnicianId
      ? technicianQuery.eq("id", clarifiedTechnicianId)
      : technicianQuery.ilike(
          "full_name",
          `%${techQuery.replace(/[^a-zA-Z0-9 ._'-]/g, " ")}%`,
        );
    const { data: matchedProfiles, error } = await technicianQuery.limit(25);
    if (error) throw new Error(error.message);
    const techs = (matchedProfiles ?? [])
      .filter((profile) => {
        const role = canonicalizeRole(profile.role);
        return (
          role === "mechanic" || role === "lead_hand" || role === "foreman"
        );
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
      resolvedContext: {
        activeWorkOrderId: workOrder.id,
        lastDomain: "workforce",
      },
    });
  }

  if (
    params.actor.capabilities.canManageScheduling &&
    /\b(?:reschedule|move)\b.*\b(?:booking|appointment)\b/i.test(question)
  ) {
    const bookingId =
      extractUuid(question) ?? params.pageContext?.bookingId ?? null;
    const startsAt = await parseDateTime(question, params.actor);
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

  if (
    params.actor.capabilities.canInvitePortalCustomers &&
    /\b(?:send|message)\b.*\b(?:conversation|customer|client)\b/i.test(question)
  ) {
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

  if (
    params.actor.capabilities.canManageWorkOrders &&
    /\b(?:create|add)\b.*\bcustomer\b/i.test(question)
  ) {
    const quotedName = extractQuotedText(question);
    const email = question.match(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/)?.[0];
    const nameMatch = question.match(
      /\b(?:create|add)\s+(?:a\s+|new\s+)?customer\s+(.+?)(?:\s+with\s+|\s+email\s+|\s+phone\s+|$)/i,
    )?.[1];
    const clarifiedName = question.match(
      /(?:^|\n)Customer name:\s*([^\n]{1,160})(?:\n|$)/i,
    )?.[1];
    const clarifiedEmail = question.match(
      /(?:^|\n)Email:\s*([^\s\n]+)(?:\n|$)/i,
    )?.[1];
    const clarifiedPhone = question.match(
      /(?:^|\n)Phone:\s*([^\n]{3,40})(?:\n|$)/i,
    )?.[1];
    const name =
      quotedName ??
      clarifiedName?.trim() ??
      nameMatch?.replace(/[.!?]+$/, "").trim() ??
      null;
    if (!name) {
      return {
        kind: "clarification_required",
        content: "What is the new customer’s name?",
        fields: [
          { name: "name", label: "Customer name", type: "text" },
          {
            name: "email",
            label: "Email",
            type: "text",
            required: false,
          },
          {
            name: "phone",
            label: "Phone",
            type: "text",
            required: false,
          },
        ],
      };
    }
    return previewWrite({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "create_customer",
      input: {
        name,
        email: clarifiedEmail ?? email,
        phone: clarifiedPhone,
      },
      resolvedContext: { lastDomain: "customers" },
    });
  }

  if (params.mode === "writes_only") return null;

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

  if (
    /\b(?:(?:pending|overdue|waiting|awaiting)\s+approvals?|approvals?\s+(?:pending|overdue|waiting)|waiting\s+on\s+approvals?)\b/i.test(
      question,
    )
  ) {
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "list_pending_approvals",
      domain: "work_orders",
      input: { limit: 20 },
      resolvedContext: { lastDomain: "work_orders" },
    });
  }

  if (
    /\b(?:parts? blockers?|waiting on parts|parts? delayed|delayed parts?|jobs? delayed by parts?)\b/i.test(
      question,
    )
  ) {
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

  if (
    /\b(?:stalled work orders?|stale work orders?|queued too long|waiting too long|prioritize the stalled)\b/i.test(
      question,
    )
  ) {
    return runRead({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      toolName: "list_stalled_work_orders",
      domain: "work_orders",
      input: { limit: 20 },
      resolvedContext: { lastDomain: "work_orders" },
    });
  }

  if (
    /\b(?:ready to invoice|ready for invoice|invoice queue|billing queue)\b/i.test(
      question,
    )
  ) {
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

  if (
    /\b(?:technician load|tech load|who is idle|available tech|available technician|workload)\b/i.test(
      question,
    )
  ) {
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

  if (
    /\b(?:inspection status|open inspections?|inspection queue)\b/i.test(
      question,
    )
  ) {
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
        fields: [
          { name: "query", label: "Name, email, or phone", type: "text" },
        ],
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

  if (
    /\b(?:revenue|business snapshot|financial snapshot|throughput report)\b/i.test(
      question,
    )
  ) {
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

  if (
    /\b(?:shop status|how is the shop|how's the shop|operations summary)\b/i.test(
      question,
    )
  ) {
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
