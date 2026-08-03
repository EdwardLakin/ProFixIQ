import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { defineShopAssistantTool } from "../types";

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

type WorkOrderRow = {
  id: string;
  custom_id: string | null;
  status: string | null;
  updated_at: string | null;
};

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

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

function rpcErrorMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

async function loadWorkOrder(
  workOrderId: string,
  shopId: string,
  supabase: SupabaseClient<any>,
): Promise<WorkOrderRow> {
  const { data, error } = await supabase
    .from("work_orders")
    .select("id, custom_id, status, updated_at")
    .eq("shop_id", shopId)
    .eq("id", workOrderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new ShopAssistantHttpError(404, "Work order not found in this shop.");
  return data as WorkOrderRow;
}

function workOrderLabel(row: WorkOrderRow): string {
  return row.custom_id ? `WO #${row.custom_id}` : `WO ${row.id.slice(0, 8)}`;
}

export const readWorkOrderTool = defineShopAssistantTool({
  name: "read_work_order",
  domain: "work_orders",
  description: "Read the current status of one shop-scoped work order.",
  mode: "read",
  risk: "low",
  requiredCapability: "canViewShopWideData",
  confirmation: "never",
  inputSchema: z.object({ workOrderId: z.string().uuid() }),
  outputSchema: WorkOrderSummarySchema,
  async execute(input, context) {
    const row = await loadWorkOrder(
      input.workOrderId,
      context.actor.shopId,
      context.actor.supabase,
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

export const holdWorkOrderTool = defineShopAssistantTool({
  name: "hold_work_order",
  domain: "work_orders",
  description: "Place a work order and its eligible active lines on operational hold.",
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
    const { count, error } = await context.actor.supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", row.id)
      .in("status", HOLDABLE_LINE_STATUSES);
    if (error) throw new Error(error.message);

    return {
      title: `Place ${label} on hold`,
      summary: `${label} will be placed on hold for: ${input.reason}`,
      consequences: [
        `${count ?? 0} eligible line(s) will be paused.`,
        "The action will fail closed if technician labor is still running.",
        "Completed, invoiced, and financially locked work orders cannot be reopened.",
      ],
      targetVersions: row.updated_at
        ? { [`work_order:${row.id}`]: row.updated_at }
        : {},
      metadata: {
        workOrderId: row.id,
        customId: row.custom_id,
        currentStatus: row.status,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for an atomic work-order hold.");
    }

    const rpc = context.actor.supabase as unknown as RpcClient;
    const { data, error } = await rpc.rpc(
      "shop_assistant_hold_work_order_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_work_order_id: input.workOrderId,
        p_actor_user_id: context.actor.userId,
        p_reason: input.reason,
      },
    );
    if (error) throw new Error(rpcErrorMessage(error));
    return WorkOrderMutationSchema.parse(data);
  },
});

export const releaseWorkOrderHoldTool = defineShopAssistantTool({
  name: "release_work_order_hold",
  domain: "work_orders",
  description: "Release an operational hold and return held lines to awaiting work.",
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
    return {
      title: `Release the hold on ${label}`,
      summary: `${label} will return to the queue and its held lines will return to awaiting.`,
      consequences: [
        "Technicians and advisors will see the work as available again.",
        "Completed, invoiced, and financially locked work orders are not eligible.",
      ],
      targetVersions: row.updated_at
        ? { [`work_order:${row.id}`]: row.updated_at }
        : {},
      metadata: { workOrderId: row.id, customId: row.custom_id },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for an atomic hold release.");
    }

    const rpc = context.actor.supabase as unknown as RpcClient;
    const { data, error } = await rpc.rpc(
      "shop_assistant_release_work_order_hold_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_work_order_id: input.workOrderId,
        p_actor_user_id: context.actor.userId,
      },
    );
    if (error) throw new Error(rpcErrorMessage(error));
    return WorkOrderMutationSchema.parse(data);
  },
});
