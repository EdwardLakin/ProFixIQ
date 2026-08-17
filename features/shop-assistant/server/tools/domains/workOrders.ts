import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadTechnicianWorkCandidateForWorkOrder } from "@/features/copilot/technician/server/assignedWork";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@/features/shared/types/types/supabase";
import { seedCompletedWorkOrderIntelligence } from "@/features/ai/server/workOrderIntelligence";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";
import { buildWorkOrderCompletedEvent } from "@/features/integrations/shopreel/server/buildProFixIQStoryEvents";
import { postStoryEventToShopReel } from "@/features/integrations/shopreel/server/postStoryEventToShopReel";

import {
  ListPendingApprovalsOut,
  toolListPendingApprovals,
} from "@/features/agent/tools/listPendingApprovals";
import {
  ageHours,
  isWorkOrderFlowStalled,
} from "@/features/agent/server/flowHealth";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { defineShopAssistantTool, runShopAssistantCommandRpc } from "../types";
import { isReviewableQuoteLine } from "@/features/work-orders/lib/quotes/reviewableQuoteLines";

const WorkOrderSummarySchema = z.object({
  ok: z.literal(true),
  workOrderId: z.string().uuid(),
  customId: z.string().nullable(),
  status: z.string().nullable(),
  updatedAt: z.string().nullable(),
  href: z.string(),
  summary: z.string(),
});

const WorkOrderMutationSchema = z.object({
  ok: z.literal(true),
  workOrderId: z.string().uuid(),
  customId: z.string().nullable(),
  status: z.string(),
  affectedLines: z.number().int().nonnegative(),
  summary: z.string(),
  href: z.string(),
});

const WorkOrderCreateResultSchema = z.object({
  ok: z.literal(true),
  workOrderId: z.string().uuid(),
  customId: z.string(),
  status: z.string(),
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  summary: z.string(),
  href: z.string(),
});

const WorkOrderLineCreateResultSchema = z.object({
  ok: z.literal(true),
  workOrderId: z.string().uuid(),
  workOrderLineId: z.string().uuid(),
  description: z.string(),
  status: z.string(),
  summary: z.string(),
  href: z.string(),
});

const WorkOrderReadyResultSchema = z.object({
  ok: z.literal(true),
  idempotent: z.boolean().optional(),
  workOrderId: z.string().uuid(),
  status: z.literal("ready_to_invoice"),
  lineCount: z.number().int().positive(),
  summary: z.string(),
  href: z.string(),
});

const ApprovalDecisionResultSchema = z.object({
  ok: z.literal(true),
  workOrderId: z.string().uuid(),
  decision: z.enum(["approve", "decline", "defer"]),
  quoteLineIds: z.array(z.string().uuid()),
  workOrderLineIds: z.array(z.string().uuid()),
  itemCount: z.number().int().positive(),
  approvalState: z.string(),
  summary: z.string(),
  href: z.string(),
});

type WorkOrderRow = {
  id: string;
  custom_id: string | null;
  status: string | null;
  updated_at: string | null;
};

type ApprovalQuotePreviewRow = {
  id: string;
  description: string;
  status: string;
  stage: string | null;
  approved_at: string | null;
  declined_at: string | null;
  work_order_line_id: string | null;
  sent_to_customer_at: string | null;
  updated_at: string;
};

type ApprovalLinePreviewRow = {
  id: string;
  description: string | null;
  status: string | null;
  approval_state: string | null;
  voided_at: string | null;
  updated_at: string | null;
};

const PendingApprovalsSchema = ListPendingApprovalsOut.extend({
  ok: z.literal(true),
  summary: z.string(),
  href: z.string(),
});

const StalledWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  customId: z.string().nullable(),
  status: z.string().nullable(),
  ageHours: z.number().nonnegative(),
  recommendedNextStep: z.string(),
  href: z.string(),
});

const HOLDABLE_WORK_ORDER_STATUSES = new Set([
  "awaiting",
  "awaiting_approval",
  "planned",
  "queued",
  "in_progress",
  "active",
  "on_hold",
]);

const HOLDABLE_LINE_STATUSES = [
  "awaiting",
  "awaiting_approval",
  "active",
  "queued",
  "in_progress",
  "planned",
];

function normalizeStatus(value: string | null): string {
  return String(value ?? "awaiting")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

async function loadWorkOrder(
  workOrderId: string,
  shopId: string,
  supabase: SupabaseClient<Database>,
): Promise<WorkOrderRow> {
  const { data, error } = await supabase
    .from("work_orders")
    .select("id, custom_id, status, updated_at")
    .eq("shop_id", shopId)
    .eq("id", workOrderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data)
    throw new ShopAssistantHttpError(404, "Work order not found in this shop.");
  return data as WorkOrderRow;
}

function workOrderLabel(row: WorkOrderRow): string {
  return row.custom_id ? `WO #${row.custom_id}` : `WO ${row.id.slice(0, 8)}`;
}

async function loadApprovalPreviewRows(params: {
  shopId: string;
  workOrderId: string;
}): Promise<{
  quoteRows: ApprovalQuotePreviewRow[];
  lineRows: ApprovalLinePreviewRow[];
}> {
  const admin = createAdminSupabase();
  const quoteRows: ApprovalQuotePreviewRow[] = [];
  const lineRows: ApprovalLinePreviewRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from("work_order_quote_lines")
      .select(
        "id, description, status, stage, approved_at, declined_at, work_order_line_id, sent_to_customer_at, updated_at",
      )
      .eq("shop_id", params.shopId)
      .eq("work_order_id", params.workOrderId)
      .order("id", { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    quoteRows.push(...((data ?? []) as ApprovalQuotePreviewRow[]));
    if ((data ?? []).length < 500) break;
  }
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from("work_order_lines")
      .select("id, description, status, approval_state, voided_at, updated_at")
      .eq("shop_id", params.shopId)
      .eq("work_order_id", params.workOrderId)
      .order("id", { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    lineRows.push(...((data ?? []) as ApprovalLinePreviewRow[]));
    if ((data ?? []).length < 500) break;
  }
  return { quoteRows, lineRows };
}

async function loadMutableWorkOrderLines(params: {
  shopId: string;
  workOrderId: string;
  statuses: string[];
}): Promise<Array<{ id: string; updatedAt: string | null }>> {
  const admin = createAdminSupabase();
  const statuses = new Set(
    params.statuses.map((status) => normalizeStatus(status)),
  );
  const lines: Array<{ id: string; updatedAt: string | null }> = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from("work_order_lines")
      .select("id, updated_at, status")
      .eq("shop_id", params.shopId)
      .eq("work_order_id", params.workOrderId)
      .is("voided_at", null)
      .order("id", { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    lines.push(
      ...(data ?? [])
        .filter((line) => statuses.has(normalizeStatus(line.status)))
        .map((line) => ({
          id: line.id,
          updatedAt: line.updated_at,
        })),
    );
    if ((data ?? []).length < 500) break;
  }
  return lines;
}

function mutableLineTargetVersions(
  workOrderId: string,
  lines: Array<{ id: string; updatedAt: string | null }>,
): Record<string, string> {
  return Object.fromEntries([
    [`work_order_line_count:${workOrderId}`, String(lines.length)],
    ...lines.map(
      (line) =>
        [`work_order_line:${line.id}`, line.updatedAt ?? "missing"] as const,
    ),
  ]);
}

async function verifyReadyToInvoicePricing(
  workOrderId: string,
  shopId: string,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const [draft, issuable] = await Promise.all([
    getInvoiceSnapshotForWorkOrder({ supabase, workOrderId }),
    getIssuableInvoiceSnapshot({ supabase, workOrderId, shopId }),
  ]);
  const draftTotal = Number(draft.total ?? 0);
  const draftParts = Number(draft.partsCost ?? 0);
  const issuableTotal = Number(issuable.total ?? 0);
  const issuableParts = Number(issuable.partsCost ?? 0);
  if (!Number.isFinite(draftTotal) || draftTotal <= 0) {
    throw new ShopAssistantHttpError(
      409,
      "Invoice pricing must be completed before marking the work order ready.",
    );
  }
  if (
    Math.abs(draftParts - issuableParts) > 0.01 ||
    Math.abs(draftTotal - issuableTotal) > 0.01
  ) {
    throw new ShopAssistantHttpError(
      409,
      "Approved parts must be attached to the work order before it can be marked ready to invoice.",
    );
  }
}

export const readWorkOrderTool = defineShopAssistantTool({
  name: "read_work_order",
  domain: "work_orders",
  description: "Read the current status of one shop-scoped work order.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: [
    "canViewShopWideData",
    "canManageWorkOrders",
    "canPerformAssignedWork",
  ],
  confirmation: "never",
  inputSchema: z.object({ workOrderId: z.string().uuid() }),
  outputSchema: WorkOrderSummarySchema,
  async authorize(input, context) {
    if (
      context.actor.capabilities.canViewShopWideData ||
      context.actor.capabilities.canManageWorkOrders
    ) {
      return;
    }
    const assigned = await loadTechnicianWorkCandidateForWorkOrder({
      supabase: createAdminSupabase(),
      shopId: context.actor.shopId,
      technicianIds: [context.actor.userId, context.actor.profileId],
      workOrderId: input.workOrderId,
    });
    if (!assigned) {
      throw new ShopAssistantHttpError(
        403,
        "This work order is not currently assigned and actionable for you.",
      );
    }
  },
  async execute(input, context) {
    const row = await loadWorkOrder(
      input.workOrderId,
      context.actor.shopId,
      context.actor.canonicalRole === "mechanic"
        ? createAdminSupabase()
        : context.actor.supabase,
    );
    const label = workOrderLabel(row);
    return {
      ok: true as const,
      workOrderId: row.id,
      customId: row.custom_id,
      status: row.status,
      updatedAt: row.updated_at,
      href: `/work-orders/${row.id}`,
      summary: `${label} is ${row.status ?? "in an unknown state"}.`,
    };
  },
});

export const listPendingApprovalsTool = defineShopAssistantTool({
  name: "list_pending_approvals",
  domain: "work_orders",
  description:
    "List canonical quote lines and legacy job lines awaiting advisor or customer approval, ordered oldest first.",
  mode: "read",
  risk: "low",
  requiredCapability: "canAuthorizeQuotes",
  confirmation: "never",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: PendingApprovalsSchema,
  async execute(input, context) {
    const result = await toolListPendingApprovals.run(input, {
      shopId: context.actor.shopId,
      userId: context.actor.userId,
    });
    return {
      ok: true as const,
      ...result,
      summary: `${result.items.length} work order(s) have approval items waiting for review.`,
      href: "/work-orders/quote-review",
    };
  },
});

export const recordApprovalDecisionTool = defineShopAssistantTool({
  name: "record_approval_decision",
  domain: "work_orders",
  description:
    "Approve, decline, or defer selected or all currently pending quote and legacy work-order approval items after staff confirmation.",
  mode: "write",
  risk: "high",
  requiredCapability: "canAuthorizeQuotes",
  allowedRoles: ["owner", "admin", "manager", "advisor", "service", "foreman"],
  confirmation: "required",
  inputSchema: z
    .object({
      workOrderId: z.string().uuid(),
      itemIds: z.array(z.string().uuid()).max(100).default([]),
      allPending: z.boolean().default(false),
      decision: z.enum(["approve", "decline", "defer"]),
      contactMethod: z
        .enum(["phone", "in_person", "email", "other"])
        .default("other"),
      note: z.string().trim().max(1000).optional(),
    })
    .refine((input) => input.allPending || input.itemIds.length > 0, {
      message: "Select at least one approval item or choose all pending items.",
      path: ["itemIds"],
    }),
  outputSchema: ApprovalDecisionResultSchema,
  async preview(input, context) {
    const { data: workOrder, error: workOrderError } =
      await context.actor.supabase
        .from("work_orders")
        .select("id, custom_id, updated_at")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.workOrderId)
        .maybeSingle();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!workOrder) {
      throw new ShopAssistantHttpError(
        404,
        "Work order not found in this shop.",
      );
    }

    const { quoteRows: allQuoteRows, lineRows: allLineRows } =
      await loadApprovalPreviewRows({
        shopId: context.actor.shopId,
        workOrderId: input.workOrderId,
      });
    const selectedIds = new Set(input.itemIds);
    const quoteRows = allQuoteRows.filter(
      (row) =>
        (input.allPending || selectedIds.has(row.id)) &&
        isReviewableQuoteLine(row),
    );
    const linkedLineIds = new Set(
      allQuoteRows
        .map((row) => row.work_order_line_id)
        .filter((id): id is string => Boolean(id)),
    );
    const lineRows = allLineRows.filter(
      (row) =>
        (input.allPending || selectedIds.has(row.id)) &&
        !row.voided_at &&
        String(row.approval_state ?? "").toLowerCase() === "pending" &&
        !linkedLineIds.has(row.id),
    );
    const resolvedIds = new Set([
      ...quoteRows.map((row) => row.id),
      ...lineRows.map((row) => row.id),
    ]);
    if (
      !input.allPending &&
      input.itemIds.some((itemId) => !resolvedIds.has(itemId))
    ) {
      throw new ShopAssistantHttpError(
        409,
        "One or more selected approval items are no longer pending on this work order.",
      );
    }

    const itemCount = quoteRows.length + lineRows.length;
    if (itemCount === 0) {
      throw new ShopAssistantHttpError(
        409,
        "No pending approval items remain on this work order.",
      );
    }
    if (itemCount > 500) {
      throw new ShopAssistantHttpError(
        409,
        "More than 500 approval items are pending. Select a smaller reviewed set before recording a decision.",
      );
    }
    if (
      input.decision === "approve" &&
      quoteRows.some((row) => {
        const status = String(row.status ?? "").toLowerCase();
        return (
          !row.sent_to_customer_at &&
          ![
            "sent",
            "ready_to_send",
            "quoted",
            "approved",
            "converted",
          ].includes(status)
        );
      })
    ) {
      throw new ShopAssistantHttpError(
        409,
        "At least one selected quote item has not been sent or made ready for customer approval yet.",
      );
    }

    const label = workOrder.custom_id
      ? `WO #${workOrder.custom_id}`
      : `WO ${workOrder.id.slice(0, 8)}`;
    const verb =
      input.decision === "approve"
        ? "Approve"
        : input.decision === "decline"
          ? "Decline"
          : "Defer";
    const descriptions = [...quoteRows, ...lineRows]
      .map((row) => row.description?.trim())
      .filter((value): value is string => Boolean(value));
    return {
      title: `${verb} ${itemCount} item(s) on ${label}`,
      summary: `Record a ${input.decision} decision for ${
        input.allPending ? "all pending" : "the selected"
      } approval items.`,
      consequences: [
        ...descriptions.slice(0, 5).map((description) => description),
        ...(descriptions.length > 5
          ? [`Plus ${descriptions.length - 5} additional item(s).`]
          : []),
        input.decision === "approve"
          ? "Approved quote items can materialize authorized work-order lines and relink their parts requests."
          : input.decision === "decline"
            ? "Declined work will not proceed and legacy lines will be placed on hold."
            : "Deferred items remain unresolved and will require later follow-up.",
        `Contact method: ${input.contactMethod.replaceAll("_", " ")}.`,
      ],
      targetVersions: {
        [`work_order:${workOrder.id}`]: workOrder.updated_at ?? "missing",
        [`approval_item_count:${workOrder.id}`]: String(itemCount),
        ...Object.fromEntries(
          quoteRows.map((row) => [
            `approval_quote_line:${row.id}`,
            row.updated_at ?? "missing",
          ]),
        ),
        ...Object.fromEntries(
          lineRows.map((row) => [
            `approval_work_order_line:${row.id}`,
            row.updated_at ?? "missing",
          ]),
        ),
      },
      metadata: {
        quoteLineIds: quoteRows.map((row) => row.id),
        workOrderLineIds: lineRows.map((row) => row.id),
        itemCount,
        decision: input.decision,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required for atomic approval decisions.",
      );
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_record_approval_decision_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_work_order_id: input.workOrderId,
        p_item_ids: input.itemIds,
        p_all_pending: input.allPending,
        p_decision: input.decision,
        p_contact_method: input.contactMethod,
        p_note: input.note ?? null,
      },
    );
    return ApprovalDecisionResultSchema.parse(data);
  },
});

function stalledNextStep(status: string | null): string {
  const normalized = normalizeStatus(status);
  if (normalized === "awaiting_approval") {
    return "Review the pending quote and contact the customer in oldest-first order.";
  }
  if (normalized === "on_hold") {
    return "Review the hold reason, parts status, and owner before releasing or escalating it.";
  }
  if (normalized === "queued" || normalized === "planned") {
    return "Confirm technician capacity and assign the next eligible job.";
  }
  if (normalized === "in_progress" || normalized === "active") {
    return "Confirm the assigned technician is still actively working and remove the blocker.";
  }
  return "Review the work order and move it into the next valid operational state.";
}

export const listStalledWorkOrdersTool = defineShopAssistantTool({
  name: "list_stalled_work_orders",
  domain: "work_orders",
  description:
    "List work orders that exceeded the canonical workflow age threshold, oldest and most actionable first.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canViewShopWideData", "canManageWorkOrders"],
  confirmation: "never",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    workOrders: z.array(StalledWorkOrderSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const rows: Array<{
      id: string;
      custom_id: string | null;
      status: string | null;
      updated_at: string | null;
    }> = [];
    const pageSize = 500;

    // Stalled thresholds vary by state (for example, approval waits become
    // stale sooner than queued work). A mixed-status age cap can therefore
    // hide a newer-but-stalled approval behind older queued rows. Evaluate the
    // complete scoped set before applying the caller's result limit.
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await context.actor.supabase
        .from("work_orders")
        .select("id, custom_id, status, updated_at")
        .eq("shop_id", context.actor.shopId)
        .in("status", [
          "awaiting",
          "awaiting_approval",
          "queued",
          "on_hold",
          "planned",
          "in_progress",
          "active",
        ])
        .order("updated_at", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = data ?? [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    const workOrders = rows
      .map((row) => {
        const hours = ageHours(row.updated_at);
        if (hours == null || !isWorkOrderFlowStalled(row.status, hours)) {
          return null;
        }
        return {
          workOrderId: row.id,
          customId: row.custom_id ?? null,
          status: row.status ?? null,
          ageHours: Math.round(hours * 10) / 10,
          recommendedNextStep: stalledNextStep(row.status),
          href:
            normalizeStatus(row.status) === "awaiting_approval"
              ? `/work-orders/${row.id}/quote-review`
              : `/work-orders/${row.id}`,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .slice(0, input.limit);

    return {
      ok: true as const,
      workOrders,
      summary: `${workOrders.length} work order(s) have exceeded their workflow threshold.`,
      href: "/work-orders/view",
    };
  },
});

export const createWorkOrderTool = defineShopAssistantTool({
  name: "create_work_order",
  domain: "work_orders",
  description:
    "Create a work order for an existing same-shop customer and one of that customer's vehicles.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageWorkOrders",
  confirmation: "required",
  inputSchema: z.object({
    customerId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    notes: z.string().trim().max(4000).optional(),
    priority: z.number().int().min(1).max(5).default(3),
    isWaiter: z.boolean().default(false),
    advisorId: z.string().uuid().optional(),
  }),
  outputSchema: WorkOrderCreateResultSchema,
  async preview(input, context) {
    const [
      { data: customer, error: customerError },
      { data: vehicle, error: vehicleError },
    ] = await Promise.all([
      context.actor.supabase
        .from("customers")
        .select("id, name, first_name, last_name")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.customerId)
        .maybeSingle(),
      context.actor.supabase
        .from("vehicles")
        .select(
          "id, customer_id, year, make, model, vin, license_plate, unit_number",
        )
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.vehicleId)
        .maybeSingle(),
    ]);
    if (customerError) throw new Error(customerError.message);
    if (vehicleError) throw new Error(vehicleError.message);
    if (!customer) {
      throw new ShopAssistantHttpError(404, "Customer not found in this shop.");
    }
    if (!vehicle || vehicle.customer_id !== input.customerId) {
      throw new ShopAssistantHttpError(
        404,
        "Vehicle was not found for this customer and shop.",
      );
    }
    if (input.advisorId) {
      const { data: advisor, error } = await context.actor.supabase
        .from("profiles")
        .select("id")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.advisorId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!advisor) {
        throw new ShopAssistantHttpError(
          404,
          "Advisor not found in this shop.",
        );
      }
    }

    const customerLabel =
      customer.name?.trim() ||
      [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
      "the customer";
    const vehicleLabel =
      [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
      vehicle.unit_number ||
      vehicle.license_plate ||
      vehicle.vin ||
      "the vehicle";
    return {
      title: `Create a work order for ${customerLabel}`,
      summary: `Create an awaiting work order for ${vehicleLabel}.`,
      consequences: [
        `Priority: ${input.priority}.`,
        input.isWaiter
          ? "The customer will be marked as waiting."
          : "The customer will not be marked as waiting.",
        input.notes
          ? "The supplied concern/notes will be saved."
          : "No intake notes will be saved.",
        "The work order and terminal assistant result will be committed atomically.",
      ],
      metadata: {
        customerId: input.customerId,
        customerName: customerLabel,
        vehicleId: input.vehicleId,
        vehicleLabel,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required for atomic work-order creation.",
      );
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_create_work_order_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_customer_id: input.customerId,
        p_vehicle_id: input.vehicleId,
        p_notes: input.notes ?? null,
        p_priority: input.priority,
        p_is_waiter: input.isWaiter,
        p_advisor_id: input.advisorId ?? null,
      },
    );
    return WorkOrderCreateResultSchema.parse(data);
  },
});

export const addWorkOrderLineTool = defineShopAssistantTool({
  name: "add_work_order_line",
  domain: "work_orders",
  description:
    "Add a diagnosis, inspection, maintenance, repair, or technician-suggested job to an editable work order.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageWorkOrders",
  confirmation: "required",
  inputSchema: z.object({
    workOrderId: z.string().uuid(),
    description: z.string().trim().min(2).max(1000),
    jobType: z
      .enum([
        "diagnosis",
        "inspection",
        "maintenance",
        "repair",
        "tech-suggested",
      ])
      .default("repair"),
    urgency: z.enum(["low", "medium", "high"]).default("medium"),
    laborTime: z.number().min(0).max(1000).optional(),
    priceEstimate: z.number().min(0).max(10000000).optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  outputSchema: WorkOrderLineCreateResultSchema,
  async preview(input, context) {
    const row = await loadWorkOrder(
      input.workOrderId,
      context.actor.shopId,
      context.actor.supabase,
    );
    const status = normalizeStatus(row.status);
    if (["completed", "invoiced", "cancelled", "canceled"].includes(status)) {
      throw new ShopAssistantHttpError(
        409,
        "This work order is no longer editable.",
      );
    }
    return {
      title: `Add a job to ${workOrderLabel(row)}`,
      summary: `Add “${input.description}” as a ${input.jobType} job.`,
      consequences: [
        `Urgency: ${input.urgency}.`,
        input.laborTime == null
          ? "No labor time will be estimated."
          : `Estimated labor: ${input.laborTime} hour(s).`,
        input.priceEstimate == null
          ? "No line price estimate will be saved."
          : `Line price estimate: $${input.priceEstimate.toFixed(2)}.`,
        "Financially locked work orders will fail closed at execution.",
      ],
      targetVersions: {
        [`work_order:${row.id}`]: row.updated_at ?? "missing",
      },
      metadata: { workOrderId: row.id, customId: row.custom_id },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for atomic job creation.");
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_add_work_order_line_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_work_order_id: input.workOrderId,
        p_description: input.description,
        p_job_type: input.jobType,
        p_urgency: input.urgency,
        p_labor_time: input.laborTime ?? null,
        p_price_estimate: input.priceEstimate ?? null,
        p_notes: input.notes ?? null,
      },
    );
    return WorkOrderLineCreateResultSchema.parse(data);
  },
});

export const holdWorkOrderTool = defineShopAssistantTool({
  name: "hold_work_order",
  domain: "work_orders",
  description:
    "Place a work order and its eligible active lines on operational hold.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageWorkOrders",
  confirmation: "required",
  inputSchema: z.object({
    workOrderId: z.string().uuid(),
    reason: z.string().trim().min(2).max(500),
  }),
  outputSchema: WorkOrderMutationSchema,
  async preview(input, context) {
    const row = await loadWorkOrder(
      input.workOrderId,
      context.actor.shopId,
      context.actor.supabase,
    );
    const status = normalizeStatus(row.status);
    if (!HOLDABLE_WORK_ORDER_STATUSES.has(status)) {
      throw new ShopAssistantHttpError(
        409,
        "Only active operational work orders can be placed on hold.",
      );
    }

    const label = workOrderLabel(row);
    const lines = await loadMutableWorkOrderLines({
      shopId: context.actor.shopId,
      workOrderId: row.id,
      statuses: HOLDABLE_LINE_STATUSES,
    });

    return {
      title: `Place ${label} on hold`,
      summary: `${label} will be placed on hold for: ${input.reason}`,
      consequences: [
        `${lines.length} eligible line(s) will be paused.`,
        "The action will fail closed if technician labor is still running.",
        "Completed, invoiced, and financially locked work orders cannot be reopened.",
      ],
      targetVersions: {
        [`work_order:${row.id}`]: row.updated_at ?? "missing",
        ...mutableLineTargetVersions(row.id, lines),
      },
      metadata: {
        workOrderId: row.id,
        customId: row.custom_id,
        currentStatus: row.status,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required for an atomic work-order hold.",
      );
    }

    const data = await runShopAssistantCommandRpc(
      "shop_assistant_hold_work_order_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_work_order_id: input.workOrderId,
        p_actor_user_id: context.actor.userId,
        p_reason: input.reason,
      },
    );
    return WorkOrderMutationSchema.parse(data);
  },
});

export const releaseWorkOrderHoldTool = defineShopAssistantTool({
  name: "release_work_order_hold",
  domain: "work_orders",
  description:
    "Release an operational hold and return held lines to awaiting work.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageWorkOrders",
  confirmation: "required",
  inputSchema: z.object({ workOrderId: z.string().uuid() }),
  outputSchema: WorkOrderMutationSchema,
  async preview(input, context) {
    const row = await loadWorkOrder(
      input.workOrderId,
      context.actor.shopId,
      context.actor.supabase,
    );
    if (normalizeStatus(row.status) !== "on_hold") {
      throw new ShopAssistantHttpError(
        409,
        "Only an on-hold work order can have its hold released.",
      );
    }

    const label = workOrderLabel(row);
    const lines = await loadMutableWorkOrderLines({
      shopId: context.actor.shopId,
      workOrderId: row.id,
      statuses: ["on_hold"],
    });
    return {
      title: `Release the hold on ${label}`,
      summary: `${label} will return to the queue and its held lines will return to awaiting.`,
      consequences: [
        `${lines.length} held line(s) will return to awaiting.`,
        "Technicians and advisors will see the work as available again.",
        "Completed, invoiced, and financially locked work orders are not eligible.",
      ],
      targetVersions: {
        [`work_order:${row.id}`]: row.updated_at ?? "missing",
        ...mutableLineTargetVersions(row.id, lines),
      },
      metadata: { workOrderId: row.id, customId: row.custom_id },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for an atomic hold release.");
    }

    const data = await runShopAssistantCommandRpc(
      "shop_assistant_release_work_order_hold_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_work_order_id: input.workOrderId,
        p_actor_user_id: context.actor.userId,
      },
    );
    return WorkOrderMutationSchema.parse(data);
  },
});

export const markWorkOrderReadyTool = defineShopAssistantTool({
  name: "mark_work_order_ready_to_invoice",
  domain: "work_orders",
  description:
    "Mark a same-shop work order ready to invoice after canonical line, quote, pricing, and attached-parts checks pass.",
  mode: "write",
  risk: "high",
  requiredCapability: "canManageWorkOrders",
  requiredAnyCapabilities: ["canAuthorizeQuotes"],
  allowedRoles: ["owner", "admin", "manager", "advisor", "service"],
  confirmation: "required",
  inputSchema: z.object({ workOrderId: z.string().uuid() }),
  outputSchema: WorkOrderReadyResultSchema,
  async preview(input, context) {
    const row = await loadWorkOrder(
      input.workOrderId,
      context.actor.shopId,
      context.actor.supabase,
    );
    if (normalizeStatus(row.status) === "ready_to_invoice") {
      throw new ShopAssistantHttpError(
        409,
        `${workOrderLabel(row)} is already ready to invoice.`,
      );
    }
    await verifyReadyToInvoicePricing(
      row.id,
      context.actor.shopId,
      context.actor.supabase,
    );
    const { count, error } = await context.actor.supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", row.id)
      .is("voided_at", null);
    if (error) throw new Error(error.message);

    const label = workOrderLabel(row);
    return {
      title: `Mark ${label} ready to invoice`,
      summary: `${label} will move to ready to invoice after all lifecycle checks pass.`,
      consequences: [
        `${count ?? 0} active work-order line(s) will be checked for completion.`,
        "All customer quote decisions must be resolved.",
        "The approved pricing and attached-parts totals will be checked again at execution.",
        "The work order becomes eligible for invoice finalization.",
      ],
      targetVersions: {
        [`work_order:${row.id}`]: row.updated_at ?? "missing",
      },
      metadata: { workOrderId: row.id, customId: row.custom_id },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required to mark a work order ready.");
    }
    const expectedVersion =
      context.targetVersions?.[`work_order:${input.workOrderId}`];
    if (!expectedVersion) {
      throw new ShopAssistantHttpError(
        409,
        "The confirmed work-order version is missing. Ask again to review its current state.",
      );
    }
    await verifyReadyToInvoicePricing(
      input.workOrderId,
      context.actor.shopId,
      context.actor.supabase,
    );
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_mark_work_order_ready_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_work_order_id: input.workOrderId,
        p_actor_user_id: context.actor.userId,
      },
    );
    const parsed = WorkOrderReadyResultSchema.parse(data);

    const event = await buildWorkOrderCompletedEvent(input.workOrderId);
    if (event) {
      await postStoryEventToShopReel(event).catch((storyError: unknown) => {
        console.error(
          "[shop-assistant] failed to sync completed work order",
          storyError,
        );
      });
    }
    await seedCompletedWorkOrderIntelligence({
      supabase: context.actor.supabase,
      shopId: context.actor.shopId,
      workOrderId: input.workOrderId,
      source: "ready_to_invoice",
    }).catch((intelligenceError: unknown) => {
      console.warn(
        "[shop-assistant] completed-repair learning failed",
        intelligenceError,
      );
    });

    return parsed;
  },
});
