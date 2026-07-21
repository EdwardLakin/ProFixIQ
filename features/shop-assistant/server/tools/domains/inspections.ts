import "server-only";

import { z } from "zod";

import { defineShopAssistantTool } from "../types";

const InspectionSchema = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid().nullable(),
  workOrderLineId: z.string().uuid().nullable(),
  status: z.string().nullable(),
  completed: z.boolean(),
  locked: z.boolean(),
  finalizedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  href: z.string(),
});

export const listInspectionsTool = defineShopAssistantTool({
  name: "list_inspections",
  domain: "inspections",
  description: "List inspection lifecycle records without entering technician diagnostic mode.",
  mode: "read",
  risk: "low",
  requiredCapability: "canRunInspections",
  confirmation: "never",
  inputSchema: z.object({
    workOrderId: z.string().uuid().optional(),
    status: z.string().optional(),
    onlyOpen: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    inspections: z.array(InspectionSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    let query = context.actor.supabase
      .from("inspections")
      .select(
        "id, work_order_id, work_order_line_id, status, completed, locked, finalized_at, updated_at",
      )
      .eq("shop_id", context.actor.shopId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(input.limit);
    if (input.workOrderId) query = query.eq("work_order_id", input.workOrderId);
    if (input.status) query = query.eq("status", input.status);
    if (input.onlyOpen) query = query.eq("completed", false);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const inspections = (data ?? []).map((row) => ({
      id: row.id,
      workOrderId: row.work_order_id ?? null,
      workOrderLineId: row.work_order_line_id ?? null,
      status: row.status ?? null,
      completed: Boolean(row.completed),
      locked: Boolean(row.locked),
      finalizedAt: row.finalized_at ?? null,
      updatedAt: row.updated_at ?? null,
      href: row.work_order_id
        ? `/work-orders/${row.work_order_id}`
        : "/inspection/saved",
    }));

    return {
      ok: true as const,
      inspections,
      summary: `${inspections.length} inspection record(s) matched.`,
      href: "/inspection/saved",
    };
  },
});
