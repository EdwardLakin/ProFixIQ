import "server-only";

import { z } from "zod";

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

async function loadWorkOrder(
  workOrderId: string,
  shopId: string,
  supabase: Parameters<typeof defineShopAssistantTool>[0] extends never
    ? never
    : any,
): Promise<WorkOrderRow> {
  const { data, error } = await supabase
    .from("work_orders")
    .select("id, custom_id, status, updated_at")
    .eq("shop_id", shopId)
    .eq("id", workOrderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Work order not found in this shop.");
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
  description: "Place a work order and its active lines on operational hold.",
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
    const label = workOrderLabel(row);
    const { count } = await context.actor.supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", row.id)
      .in("status", [
        "awaiting",
        "awaiting_approval",
        "planned",
        "queued",
        "in_progress",
      ]);

    return {
      title: `Place ${label} on hold`,
      summary: `${label} will be placed on hold for: ${input.reason}`,
      consequences: [
        `${count ?? 0} active line(s) will be paused.`,
        "The work order will leave the active queue until the hold is released.",
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
    const row = await loadWorkOrder(
      input.workOrderId,
      context.actor.shopId,
      context.actor.supabase,
    );
    const expectedVersion = context.targetVersions?.[`work_order:${row.id}`];
    if (expectedVersion && row.updated_at !== expectedVersion) {
      throw new Error(
        "The work order changed after the preview. Review the latest state before confirming again.",
      );
    }

    const now = new Date().toISOString();
    let workOrderUpdate = context.actor.supabase
      .from("work_orders")
      .update({ status: "on_hold", updated_at: now })
      .eq("shop_id", context.actor.shopId)
      .eq("id", row.id);
    if (expectedVersion) {
      workOrderUpdate = workOrderUpdate.eq("updated_at", expectedVersion);
    }
    const { data: updatedWorkOrder, error: workOrderError } =
      await workOrderUpdate
        .select("id, custom_id, status, updated_at")
        .maybeSingle();

    if (workOrderError) throw new Error(workOrderError.message);
    if (!updatedWorkOrder) {
      throw new Error(
        "The work order changed before the hold could be applied. Review and try again.",
      );
    }

    const { data: updatedLines, error: lineError } = await context.actor.supabase
      .from("work_order_lines")
      .update({
        status: "on_hold",
        hold_reason: input.reason,
        on_hold_since: now,
        updated_at: now,
      })
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", row.id)
      .in("status", [
        "awaiting",
        "awaiting_approval",
        "planned",
        "queued",
        "in_progress",
      ])
      .select("id");

    if (lineError) throw new Error(lineError.message);
    const label = workOrderLabel(row);
    return {
      ok: true as const,
      workOrderId: row.id,
      customId: row.custom_id,
      status: "on_hold",
      affectedLines: updatedLines?.length ?? 0,
      summary: `${label} is now on hold for ${input.reason}.`,
      href: `/work-orders/${row.id}`,
    };
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
    const label = workOrderLabel(row);
    return {
      title: `Release the hold on ${label}`,
      summary: `${label} will return to the queue and its held lines will return to awaiting.`,
      consequences: ["Technicians and advisors will see the work as available again."],
      targetVersions: row.updated_at
        ? { [`work_order:${row.id}`]: row.updated_at }
        : {},
      metadata: { workOrderId: row.id, customId: row.custom_id },
    };
  },
  async execute(input, context) {
    const row = await loadWorkOrder(
      input.workOrderId,
      context.actor.shopId,
      context.actor.supabase,
    );
    const expectedVersion = context.targetVersions?.[`work_order:${row.id}`];
    if (expectedVersion && row.updated_at !== expectedVersion) {
      throw new Error(
        "The work order changed after the preview. Review the latest state before confirming again.",
      );
    }

    const now = new Date().toISOString();
    const { data: updatedWorkOrder, error: workOrderError } = await context.actor.supabase
      .from("work_orders")
      .update({ status: "queued", updated_at: now })
      .eq("shop_id", context.actor.shopId)
      .eq("id", row.id)
      .select("id")
      .maybeSingle();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!updatedWorkOrder) throw new Error("Work order could not be released.");

    const { data: updatedLines, error: lineError } = await context.actor.supabase
      .from("work_order_lines")
      .update({
        status: "awaiting",
        hold_reason: null,
        on_hold_since: null,
        updated_at: now,
      })
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", row.id)
      .eq("status", "on_hold")
      .select("id");
    if (lineError) throw new Error(lineError.message);

    const label = workOrderLabel(row);
    return {
      ok: true as const,
      workOrderId: row.id,
      customId: row.custom_id,
      status: "queued",
      affectedLines: updatedLines?.length ?? 0,
      summary: `${label} is back in the queue.`,
      href: `/work-orders/${row.id}`,
    };
  },
});
