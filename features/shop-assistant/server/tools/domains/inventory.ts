import "server-only";

import { z } from "zod";

import { defineShopAssistantTool } from "../types";

const LowStockItemSchema = z.object({
  partId: z.string().uuid(),
  name: z.string(),
  sku: z.string().nullable(),
  quantityOnHand: z.number(),
  threshold: z.number(),
  suggestedReorder: z.number(),
  href: z.string(),
});

type LowStockItem = z.infer<typeof LowStockItemSchema>;

const PartBlockerSchema = z.object({
  requestItemId: z.string().uuid(),
  description: z.string(),
  approvedQuantity: z.number(),
  receivedQuantity: z.number(),
  remainingQuantity: z.number(),
  workOrderId: z.string().uuid().nullable(),
  workOrderLabel: z.string().nullable(),
  href: z.string(),
});

type PartBlocker = z.infer<typeof PartBlockerSchema>;

type PartStockRow = {
  part_id: string;
  qty_on_hand: number | null;
  reorder_point: number | null;
  reorder_qty: number | null;
  parts:
    | {
        name: string | null;
        sku: string | null;
        low_stock_threshold: number | null;
      }
    | null;
};

type PartRequestItemRow = {
  id: string;
  description: string | null;
  qty_approved: number | null;
  qty_received: number | null;
  work_order_id: string | null;
  work_orders: { custom_id: string | null; shop_id: string | null } | null;
};

export const listLowStockPartsTool = defineShopAssistantTool({
  name: "list_low_stock_parts",
  domain: "inventory",
  description: "List parts at or below their configured reorder threshold.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageParts",
  confirmation: "never",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    items: z.array(LowStockItemSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const { data, error } = await context.actor.supabase
      .from("part_stock")
      .select(
        "part_id, qty_on_hand, reorder_point, reorder_qty, parts(name, sku, low_stock_threshold, shop_id)",
      )
      .eq("parts.shop_id", context.actor.shopId)
      .limit(300);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as PartStockRow[];
    const items: LowStockItem[] = [];

    for (const row of rows) {
      const partId = String(row.part_id ?? "").trim();
      if (!partId) continue;

      const quantityOnHand = Number(row.qty_on_hand ?? 0);
      const threshold = Number(
        row.reorder_point ?? row.parts?.low_stock_threshold ?? Number.NaN,
      );
      if (!Number.isFinite(threshold) || quantityOnHand > threshold) continue;

      const suggestedReorder = Math.max(
        1,
        Number(row.reorder_qty ?? threshold - quantityOnHand + 1),
      );
      items.push({
        partId,
        name:
          row.parts?.name?.trim() ||
          row.parts?.sku?.trim() ||
          `Part ${partId.slice(0, 8)}`,
        sku: row.parts?.sku ?? null,
        quantityOnHand,
        threshold,
        suggestedReorder: Number.isFinite(suggestedReorder)
          ? suggestedReorder
          : 1,
        href: `/parts/inventory?part=${encodeURIComponent(partId)}`,
      });
    }

    items.sort((left, right) => left.quantityOnHand - right.quantityOnHand);
    const limitedItems = items.slice(0, input.limit);

    return {
      ok: true as const,
      items: limitedItems,
      summary: `${limitedItems.length} part(s) are at or below their reorder threshold.`,
      href: "/parts/inventory",
    };
  },
});

export const listPartsBlockersTool = defineShopAssistantTool({
  name: "list_parts_blockers",
  domain: "inventory",
  description: "List approved part request quantities that have not been fully received.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageParts",
  confirmation: "never",
  inputSchema: z.object({
    workOrderId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    blockers: z.array(PartBlockerSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    let query = context.actor.supabase
      .from("part_request_items")
      .select(
        "id, description, qty_approved, qty_received, work_order_id, work_orders(custom_id, shop_id)",
      )
      .eq("shop_id", context.actor.shopId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (input.workOrderId) query = query.eq("work_order_id", input.workOrderId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as PartRequestItemRow[];
    const blockers: PartBlocker[] = [];

    for (const row of rows) {
      const requestItemId = String(row.id ?? "").trim();
      if (!requestItemId) continue;

      const approvedQuantity = Number(row.qty_approved ?? 0);
      const receivedQuantity = Number(row.qty_received ?? 0);
      const remainingQuantity = Math.max(
        0,
        approvedQuantity - receivedQuantity,
      );
      if (remainingQuantity <= 0) continue;

      const customId = row.work_orders?.custom_id?.trim() || null;
      const workOrderId = row.work_order_id?.trim() || null;
      blockers.push({
        requestItemId,
        description: row.description?.trim() || "Requested part",
        approvedQuantity,
        receivedQuantity,
        remainingQuantity,
        workOrderId,
        workOrderLabel: customId ? `WO #${customId}` : null,
        href: workOrderId ? `/work-orders/${workOrderId}` : "/parts/requests",
      });

      if (blockers.length >= input.limit) break;
    }

    return {
      ok: true as const,
      blockers,
      summary: `${blockers.length} part request item(s) still have unreceived quantity.`,
      href: "/parts/requests",
    };
  },
});
