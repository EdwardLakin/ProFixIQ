import "server-only";

import { z } from "zod";

import { loadTechnicianWorkCandidateForWorkOrder } from "@/features/copilot/technician/server/assignedWork";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { defineShopAssistantTool, runShopAssistantCommandRpc } from "../types";

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
  location_id: string;
  qty_on_hand: number | null;
  reorder_point: number | null;
  reorder_qty: number | null;
  parts:
    | {
        name: string | null;
        sku: string | null;
        low_stock_threshold: number | null;
      }
    | Array<{
        name: string | null;
        sku: string | null;
        low_stock_threshold: number | null;
      }>
    | null;
};

function relatedPart(row: PartStockRow) {
  return Array.isArray(row.parts) ? (row.parts[0] ?? null) : row.parts;
}

type PartRequestItemRow = {
  id: string;
  description: string | null;
  qty_approved: number | null;
  qty_received: number | null;
  work_order_id: string | null;
  work_orders: { custom_id: string | null; shop_id: string | null } | null;
};

const PartRequestCreateResultSchema = z.object({
  ok: z.literal(true),
  requestId: z.string().uuid(),
  workOrderId: z.string().uuid(),
  workOrderLineId: z.string().uuid().nullable(),
  itemCount: z.number().int().positive(),
  summary: z.string(),
  href: z.string(),
});

const PartReceiptResultSchema = z.object({
  ok: z.literal(true),
  requestItemId: z.string().uuid(),
  quantity: z.number().positive(),
  summary: z.string(),
  href: z.string(),
});

const StockLocationListResultSchema = z.object({
  ok: z.literal(true),
  locations: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      href: z.string(),
    }),
  ),
  summary: z.string(),
  href: z.string(),
});

const InventoryPartCreateResultSchema = z.object({
  ok: z.literal(true),
  partId: z.string().uuid(),
  name: z.string(),
  sku: z.string().nullable(),
  quantityOnHand: z.number(),
  summary: z.string(),
  href: z.string(),
});

const InventoryStockResultSchema = z.object({
  ok: z.literal(true),
  partId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantityOnHand: z.number().nonnegative(),
  quantityChange: z.number(),
  summary: z.string(),
  href: z.string(),
});

const SupplierListResultSchema = z.object({
  ok: z.literal(true),
  suppliers: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      accountNumber: z.string().nullable(),
      href: z.string(),
    }),
  ),
  summary: z.string(),
  href: z.string(),
});

const PurchaseOrderLineInputSchema = z
  .object({
    partId: z.string().uuid().optional(),
    sku: z.string().trim().max(120).optional(),
    description: z.string().trim().max(500).optional(),
    quantity: z.number().finite().positive().max(1_000_000),
    unitCost: z.number().finite().nonnegative().max(100_000_000).optional(),
    locationId: z.string().uuid().optional(),
  })
  .superRefine((line, refinement) => {
    if (!line.partId && !line.description?.trim()) {
      refinement.addIssue({
        code: "custom",
        path: ["description"],
        message: "Each PO line needs a catalog part or description.",
      });
    }
  });

const PurchaseOrderMutationResultSchema = z.object({
  ok: z.literal(true),
  idempotent: z.boolean().optional(),
  purchaseOrderId: z.string().uuid(),
  poNumber: z.string(),
  status: z.string(),
  lineCount: z.number().int().positive(),
  subtotal: z.number().nonnegative(),
  summary: z.string(),
  href: z.string(),
});

const PurchaseOrderPlacementResultSchema = z.object({
  ok: z.literal(true),
  idempotent: z.boolean().optional(),
  purchaseOrderId: z.string().uuid(),
  poNumber: z.string(),
  status: z.string(),
  orderedAt: z.string().nullable(),
  summary: z.string(),
  href: z.string(),
});

const PurchaseOrderReceiptResultSchema = z.object({
  ok: z.literal(true),
  purchaseOrderId: z.string().uuid(),
  purchaseOrderLineId: z.string().uuid(),
  quantity: z.number().positive(),
  status: z.string(),
  closed: z.boolean(),
  summary: z.string(),
  href: z.string(),
});

type PurchaseOrderPlacementLineRow = {
  id: string;
  cancelled_qty: number;
  description: string | null;
  location_id: string | null;
  part_id: string | null;
  part_request_item_id: string | null;
  qty: number;
  received_qty: number;
  sku: string | null;
  unit_cost: number | null;
  work_order_part_id: string | null;
};

function purchaseOrderLineVersion(line: PurchaseOrderPlacementLineRow): string {
  return JSON.stringify({
    cancelledQty: Number(line.cancelled_qty ?? 0),
    description: line.description ?? null,
    locationId: line.location_id ?? null,
    partId: line.part_id ?? null,
    partRequestItemId: line.part_request_item_id ?? null,
    quantity: Number(line.qty ?? 0),
    receivedQuantity: Number(line.received_qty ?? 0),
    sku: line.sku ?? null,
    unitCost: line.unit_cost == null ? null : Number(line.unit_cost),
    workOrderPartId: line.work_order_part_id ?? null,
  });
}

async function loadPurchaseOrderPlacementLines(
  purchaseOrderId: string,
): Promise<PurchaseOrderPlacementLineRow[]> {
  const { data, error } = await createAdminSupabase()
    .from("purchase_order_lines")
    .select(
      "id, cancelled_qty, description, location_id, part_id, part_request_item_id, qty, received_qty, sku, unit_cost, work_order_part_id",
    )
    .eq("po_id", purchaseOrderId)
    .order("id", { ascending: true })
    .range(0, 500);
  if (error) throw new Error(error.message);
  return (data ?? []) as PurchaseOrderPlacementLineRow[];
}

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
    const rows: PartStockRow[] = [];
    const pageSize = 500;

    // Thresholds can come from either the stock location or its related part,
    // so the low-stock predicate must be evaluated after loading the rows.
    // Page the entire same-shop set in a deterministic composite order before
    // ranking; an arbitrary pre-filter cap can hide the lowest stock item.
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await context.actor.supabase
        .from("part_stock")
        .select(
          "part_id, location_id, qty_on_hand, reorder_point, reorder_qty, parts!inner(name, sku, low_stock_threshold, shop_id)",
        )
        .eq("parts.shop_id", context.actor.shopId)
        .order("part_id", { ascending: true })
        .order("location_id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as PartStockRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    const items: LowStockItem[] = [];

    for (const row of rows) {
      const partId = String(row.part_id ?? "").trim();
      if (!partId) continue;
      const part = relatedPart(row);

      const quantityOnHand = Number(row.qty_on_hand ?? 0);
      const threshold = Number(
        row.reorder_point ?? part?.low_stock_threshold ?? Number.NaN,
      );
      if (!Number.isFinite(threshold) || quantityOnHand > threshold) continue;

      const suggestedReorder = Math.max(
        1,
        Number(row.reorder_qty ?? threshold - quantityOnHand + 1),
      );
      items.push({
        partId,
        name:
          part?.name?.trim() ||
          part?.sku?.trim() ||
          `Part ${partId.slice(0, 8)}`,
        sku: part?.sku ?? null,
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
  description:
    "List approved part request quantities that have not been fully received.",
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
    const blockers: PartBlocker[] = [];
    const pageSize = 500;

    // PostgREST cannot compare qty_approved to qty_received through the
    // standard filter helpers. Page the stable same-shop order until enough
    // outstanding rows are found so completed recent items cannot hide older
    // blockers behind a pre-filter cap.
    for (let from = 0; blockers.length < input.limit; from += pageSize) {
      let query = context.actor.supabase
        .from("part_request_items")
        .select(
          "id, description, qty_approved, qty_received, work_order_id, work_orders(custom_id, shop_id)",
        )
        .eq("shop_id", context.actor.shopId)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (input.workOrderId) {
        query = query.eq("work_order_id", input.workOrderId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as PartRequestItemRow[];

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

      if (rows.length < pageSize) break;
    }

    return {
      ok: true as const,
      blockers,
      summary: `${blockers.length} part request item(s) still have unreceived quantity.`,
      href: "/parts/requests",
    };
  },
});

export const listStockLocationsTool = defineShopAssistantTool({
  name: "list_stock_locations",
  domain: "inventory",
  description:
    "List same-shop inventory locations and their exact IDs for receiving or stock adjustments.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageParts",
  confirmation: "never",
  inputSchema: z.object({
    query: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(50).default(50),
  }),
  outputSchema: StockLocationListResultSchema,
  async execute(input, context) {
    const admin = createAdminSupabase();
    let query = admin
      .from("stock_locations")
      .select("id, code, name")
      .eq("shop_id", context.actor.shopId)
      .order("name", { ascending: true })
      .limit(input.limit);
    const token = input.query
      ?.replace(/[^a-zA-Z0-9 _-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (token) {
      query = query.or(`name.ilike.%${token}%,code.ilike.%${token}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const locations = (data ?? []).map((location) => ({
      id: location.id,
      code: location.code,
      name: location.name,
      href: `/parts/inventory?location=${encodeURIComponent(location.id)}`,
    }));
    return {
      ok: true as const,
      locations,
      summary: `${locations.length} inventory location(s) are available.`,
      href: "/parts/inventory",
    };
  },
});

export const findSuppliersTool = defineShopAssistantTool({
  name: "find_suppliers",
  domain: "inventory",
  description:
    "Find active same-shop purchasing suppliers by name, email, phone, or account number.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageParts",
  confirmation: "never",
  inputSchema: z.object({
    query: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: SupplierListResultSchema,
  async execute(input, context) {
    let query = context.actor.supabase
      .from("suppliers")
      .select("id, name, email, phone, account_no")
      .eq("shop_id", context.actor.shopId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(input.limit);
    const token = input.query
      ?.replace(/[^a-zA-Z0-9@.+ _-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (token) {
      query = query.or(
        [
          `name.ilike.%${token}%`,
          `email.ilike.%${token}%`,
          `phone.ilike.%${token}%`,
          `account_no.ilike.%${token}%`,
        ].join(","),
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const suppliers = (data ?? []).map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      email: supplier.email ?? null,
      phone: supplier.phone ?? null,
      accountNumber: supplier.account_no ?? null,
      href: `/parts/vendors?supplier=${encodeURIComponent(supplier.id)}`,
    }));
    return {
      ok: true as const,
      suppliers,
      summary: `${suppliers.length} active supplier(s) matched.`,
      href: "/parts/vendors",
    };
  },
});

export const readPurchaseOrderTool = defineShopAssistantTool({
  name: "read_purchase_order",
  domain: "inventory",
  description:
    "Read one same-shop purchase order, its supplier, totals, and exact line IDs with ordered and received quantities.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageParts",
  confirmation: "never",
  inputSchema: z.object({ purchaseOrderId: z.string().uuid() }),
  outputSchema: z.object({
    ok: z.literal(true),
    purchaseOrder: z.object({
      id: z.string().uuid(),
      poNumber: z.string(),
      status: z.string(),
      supplierId: z.string().uuid(),
      supplierName: z.string(),
      workOrderId: z.string().uuid().nullable(),
      subtotal: z.number().nullable(),
      total: z.number().nullable(),
      expectedAt: z.string().nullable(),
      orderedAt: z.string().nullable(),
      lines: z.array(
        z.object({
          id: z.string().uuid(),
          partId: z.string().uuid().nullable(),
          description: z.string(),
          sku: z.string().nullable(),
          quantity: z.number(),
          receivedQuantity: z.number(),
          remainingQuantity: z.number().nonnegative(),
          unitCost: z.number().nullable(),
          locationId: z.string().uuid().nullable(),
        }),
      ),
    }),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const admin = createAdminSupabase();
    const [{ data: purchaseOrder, error: purchaseOrderError }, linesResult] =
      await Promise.all([
        admin
          .from("purchase_orders")
          .select(
            "id, po_number, status, supplier_id, work_order_id, subtotal, total, expected_at, ordered_at, suppliers!inner(name)",
          )
          .eq("shop_id", context.actor.shopId)
          .eq("id", input.purchaseOrderId)
          .maybeSingle(),
        admin
          .from("purchase_order_lines")
          .select(
            "id, po_id, part_id, description, sku, qty, received_qty, cancelled_qty, unit_cost, location_id",
          )
          .eq("po_id", input.purchaseOrderId)
          .order("created_at", { ascending: true }),
      ]);
    if (purchaseOrderError) throw new Error(purchaseOrderError.message);
    if (linesResult.error) throw new Error(linesResult.error.message);
    if (!purchaseOrder) {
      throw new ShopAssistantHttpError(
        404,
        "Purchase order not found in this shop.",
      );
    }
    const supplier = Array.isArray(purchaseOrder.suppliers)
      ? purchaseOrder.suppliers[0]
      : purchaseOrder.suppliers;
    const lines = (linesResult.data ?? []).map((line) => {
      const quantity = Number(line.qty ?? 0);
      const receivedQuantity = Number(line.received_qty ?? 0);
      const cancelledQuantity = Number(line.cancelled_qty ?? 0);
      return {
        id: line.id,
        partId: line.part_id ?? null,
        description: line.description?.trim() || line.sku?.trim() || "PO line",
        sku: line.sku ?? null,
        quantity,
        receivedQuantity,
        remainingQuantity: Math.max(
          0,
          quantity - cancelledQuantity - receivedQuantity,
        ),
        unitCost: line.unit_cost == null ? null : Number(line.unit_cost),
        locationId: line.location_id ?? null,
      };
    });
    const poNumber = purchaseOrder.po_number || purchaseOrder.id.slice(0, 8);
    return {
      ok: true as const,
      purchaseOrder: {
        id: purchaseOrder.id,
        poNumber,
        status: purchaseOrder.status,
        supplierId: purchaseOrder.supplier_id,
        supplierName: supplier?.name ?? "Supplier",
        workOrderId: purchaseOrder.work_order_id ?? null,
        subtotal:
          purchaseOrder.subtotal == null
            ? null
            : Number(purchaseOrder.subtotal),
        total: purchaseOrder.total == null ? null : Number(purchaseOrder.total),
        expectedAt: purchaseOrder.expected_at ?? null,
        orderedAt: purchaseOrder.ordered_at ?? null,
        lines,
      },
      summary: `${poNumber} is ${purchaseOrder.status} with ${lines.length} line(s).`,
      href: `/parts/po/${purchaseOrder.id}`,
    };
  },
});

export const createPartRequestTool = defineShopAssistantTool({
  name: "create_part_request",
  domain: "inventory",
  description:
    "Request one or more parts for a same-shop work order; technicians may request only for a job line assigned to them.",
  mode: "write",
  risk: "medium",
  requiredAnyCapabilities: [
    "canManageParts",
    "canManageWorkOrders",
    "canPerformAssignedWork",
  ],
  confirmation: "required",
  inputSchema: z.object({
    workOrderId: z.string().uuid(),
    workOrderLineId: z.string().uuid().optional(),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(500),
          qty: z.number().positive().max(10_000).default(1),
          partNumber: z.string().trim().max(120).optional(),
          manufacturer: z.string().trim().max(120).optional(),
        }),
      )
      .min(1)
      .max(100),
    notes: z.string().trim().max(2000).optional(),
  }),
  outputSchema: PartRequestCreateResultSchema,
  async preview(input, context) {
    const readClient =
      context.actor.canonicalRole === "mechanic"
        ? createAdminSupabase()
        : context.actor.supabase;
    const { data: workOrder, error: workOrderError } = await readClient
      .from("work_orders")
      .select("id, custom_id, status, updated_at")
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

    if (input.workOrderLineId) {
      const { data: line, error: lineError } = await readClient
        .from("work_order_lines")
        .select("id")
        .eq("shop_id", context.actor.shopId)
        .eq("work_order_id", input.workOrderId)
        .eq("id", input.workOrderLineId)
        .maybeSingle();
      if (lineError) throw new Error(lineError.message);
      if (!line) {
        throw new ShopAssistantHttpError(
          404,
          "Work-order line not found for this work order and shop.",
        );
      }
    }

    if (context.actor.canonicalRole === "mechanic") {
      if (!input.workOrderLineId) {
        throw new ShopAssistantHttpError(
          400,
          "Choose the assigned job line that needs these parts.",
        );
      }
      const assigned = await loadTechnicianWorkCandidateForWorkOrder({
        supabase: createAdminSupabase(),
        shopId: context.actor.shopId,
        technicianIds: [context.actor.profileId, context.actor.userId],
        workOrderId: input.workOrderId,
      });
      if (!assigned?.lineIds.includes(input.workOrderLineId)) {
        throw new ShopAssistantHttpError(
          403,
          "Technicians can request parts only for an assigned, active job line.",
        );
      }
    }

    const label = workOrder.custom_id
      ? `WO #${workOrder.custom_id}`
      : `WO ${workOrder.id.slice(0, 8)}`;
    return {
      title: `Request ${input.items.length} part item(s)`,
      summary: `Create a parts request for ${label}.`,
      consequences: [
        ...input.items
          .slice(0, 5)
          .map(
            (item) =>
              `${item.qty} × ${item.description}${
                item.partNumber ? ` (${item.partNumber})` : ""
              }`,
          ),
        ...(input.items.length > 5
          ? [`Plus ${input.items.length - 5} additional item(s).`]
          : []),
        "The request and its items will be created together after confirmation.",
      ],
      targetVersions: {
        [`work_order:${workOrder.id}`]: workOrder.updated_at ?? "missing",
      },
      metadata: {
        workOrderId: workOrder.id,
        workOrderLineId: input.workOrderLineId ?? null,
        itemCount: input.items.length,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for atomic parts requests.");
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_create_part_request_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_work_order_id: input.workOrderId,
        p_work_order_line_id: input.workOrderLineId ?? null,
        p_items: input.items,
        p_notes: input.notes ?? null,
      },
    );
    return PartRequestCreateResultSchema.parse(data);
  },
});

export const receivePartRequestItemTool = defineShopAssistantTool({
  name: "receive_part_request_item",
  domain: "inventory",
  description:
    "Receive a quantity for an existing same-shop part request item into a stock location.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageParts",
  allowedRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
  confirmation: "required",
  inputSchema: z.object({
    itemId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantity: z.number().positive().max(100_000),
    purchaseOrderId: z.string().uuid().optional(),
  }),
  outputSchema: PartReceiptResultSchema,
  async preview(input, context) {
    const [itemResult, locationResult] = await Promise.all([
      context.actor.supabase
        .from("part_request_items")
        .select(
          "id, request_id, part_id, description, qty, qty_requested, qty_approved, qty_ordered, qty_received, updated_at",
        )
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.itemId)
        .maybeSingle(),
      context.actor.supabase
        .from("stock_locations")
        .select("id, name, code")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.locationId)
        .maybeSingle(),
    ]);
    if (itemResult.error) throw new Error(itemResult.error.message);
    if (locationResult.error) throw new Error(locationResult.error.message);
    if (!itemResult.data) {
      throw new ShopAssistantHttpError(
        404,
        "Part request item not found in this shop.",
      );
    }
    if (!itemResult.data.part_id) {
      throw new ShopAssistantHttpError(
        409,
        "Link this request item to an inventory part before receiving it into stock.",
      );
    }
    if (!locationResult.data) {
      throw new ShopAssistantHttpError(
        404,
        "Stock location not found in this shop.",
      );
    }

    if (input.purchaseOrderId) {
      const [purchaseOrderResult, lineResult] = await Promise.all([
        context.actor.supabase
          .from("purchase_orders")
          .select("id, status")
          .eq("shop_id", context.actor.shopId)
          .eq("id", input.purchaseOrderId)
          .maybeSingle(),
        context.actor.supabase
          .from("purchase_order_lines")
          .select("id, qty, received_qty, cancelled_qty")
          .eq("po_id", input.purchaseOrderId)
          .eq("part_request_item_id", input.itemId)
          .eq("part_id", itemResult.data.part_id),
      ]);
      if (purchaseOrderResult.error) {
        throw new Error(purchaseOrderResult.error.message);
      }
      if (lineResult.error) throw new Error(lineResult.error.message);
      if (!purchaseOrderResult.data) {
        throw new ShopAssistantHttpError(
          404,
          "Purchase order not found in this shop.",
        );
      }
      if (purchaseOrderResult.data.status !== "open") {
        throw new ShopAssistantHttpError(
          409,
          "Only an open purchase order can receive parts.",
        );
      }
      const outstandingLines = (lineResult.data ?? []).filter(
        (line) =>
          Number(line.received_qty ?? 0) <
          Math.max(0, Number(line.qty ?? 0) - Number(line.cancelled_qty ?? 0)),
      );
      if (outstandingLines.length === 0) {
        throw new ShopAssistantHttpError(
          404,
          "No outstanding PO line is linked to this request item.",
        );
      }
      if (outstandingLines.length > 1) {
        throw new ShopAssistantHttpError(
          409,
          "More than one PO line matches this request item. Choose the exact purchase-order line instead.",
        );
      }
      const line = outstandingLines[0];
      const lineRemaining = Math.max(
        0,
        Number(line.qty ?? 0) -
          Number(line.cancelled_qty ?? 0) -
          Number(line.received_qty ?? 0),
      );
      if (input.quantity > lineRemaining + 0.000001) {
        throw new ShopAssistantHttpError(
          409,
          `Only ${lineRemaining} unit(s) remain on the linked PO line.`,
        );
      }
    }

    const item = itemResult.data;
    const orderedOrApproved = Math.max(
      Number(item.qty_ordered ?? 0),
      Number(item.qty_approved ?? 0),
      Number(item.qty_requested ?? 0),
      Number(item.qty ?? 0),
    );
    const received = Number(item.qty_received ?? 0);
    const estimatedRemaining = Math.max(0, orderedOrApproved - received);
    if (input.quantity > estimatedRemaining + 0.000001) {
      throw new ShopAssistantHttpError(
        409,
        `Only ${estimatedRemaining} unit(s) remain to be received for this request item.`,
      );
    }

    const description = item.description?.trim() || "requested part";
    const location =
      locationResult.data.name?.trim() ||
      locationResult.data.code?.trim() ||
      "the selected stock location";
    return {
      title: `Receive ${input.quantity} × ${description}`,
      summary: `Receive this quantity into ${location}.`,
      consequences: [
        `The request item's received quantity will increase by ${input.quantity}.`,
        "A durable, idempotent stock movement will be recorded.",
        input.purchaseOrderId
          ? "The single linked purchase-order line will be reconciled and the PO may close if fully received."
          : "No purchase order was selected, so this receipt changes the request and stock ledger only.",
      ],
      targetVersions: {
        [`part_request_item:${item.id}`]: item.updated_at ?? "missing",
      },
      metadata: {
        requestId: item.request_id,
        estimatedRemaining,
        locationId: locationResult.data.id,
        purchaseOrderId: input.purchaseOrderId ?? null,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for atomic parts receiving.");
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_receive_part_request_item_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_item_id: input.itemId,
        p_location_id: input.locationId,
        p_quantity: input.quantity,
        p_purchase_order_id: input.purchaseOrderId ?? null,
      },
    );
    return PartReceiptResultSchema.parse(data);
  },
});

const InventoryPartInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().min(1).max(120).optional(),
    partNumber: z.string().trim().min(1).max(120).optional(),
    manufacturer: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    cost: z.number().nonnegative().max(10_000_000).optional(),
    price: z.number().nonnegative().max(10_000_000).optional(),
    initialQuantity: z.number().nonnegative().max(10_000_000).default(0),
    locationId: z.string().uuid().optional(),
    lowStockThreshold: z.number().nonnegative().max(10_000_000).optional(),
    reorderQuantity: z.number().nonnegative().max(10_000_000).optional(),
  })
  .superRefine((input, refinement) => {
    if (input.initialQuantity > 0 && !input.locationId) {
      refinement.addIssue({
        code: "custom",
        path: ["locationId"],
        message: "A stock location is required for an initial quantity.",
      });
    }
  });

export const createInventoryPartTool = defineShopAssistantTool({
  name: "create_inventory_part",
  domain: "inventory",
  description:
    "Create a same-shop inventory catalog part and optionally set its initial on-hand quantity at one location.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageParts",
  allowedRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
  confirmation: "required",
  inputSchema: InventoryPartInputSchema,
  outputSchema: InventoryPartCreateResultSchema,
  async preview(input, context) {
    const admin = createAdminSupabase();
    let duplicateQuery = admin
      .from("parts")
      .select("id, name, sku, part_number")
      .eq("shop_id", context.actor.shopId);
    duplicateQuery = input.sku
      ? duplicateQuery.eq("sku", input.sku)
      : input.partNumber
        ? duplicateQuery.eq("part_number", input.partNumber)
        : duplicateQuery.ilike("name", input.name);
    const duplicateResult = await duplicateQuery.limit(2);
    if (duplicateResult.error) throw new Error(duplicateResult.error.message);
    if ((duplicateResult.data ?? []).length > 0) {
      const duplicate = duplicateResult.data?.[0];
      throw new ShopAssistantHttpError(
        409,
        `A matching inventory part already exists: ${duplicate?.name ?? input.name}${
          duplicate?.sku ? ` (${duplicate.sku})` : ""
        }.`,
      );
    }

    let locationName: string | null = null;
    if (input.locationId) {
      const { data: location, error } = await admin
        .from("stock_locations")
        .select("id, name, code")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.locationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!location) {
        throw new ShopAssistantHttpError(
          404,
          "Inventory location not found in this shop.",
        );
      }
      locationName = location.name?.trim() || location.code?.trim() || null;
    }

    return {
      title: `Create inventory part ${input.name}`,
      summary: `Add ${input.name} to this shop's parts catalog.`,
      consequences: [
        input.sku ? `SKU: ${input.sku}.` : "No SKU will be assigned.",
        input.price == null
          ? "No default selling price will be assigned."
          : `Default selling price: $${input.price.toFixed(2)}.`,
        input.locationId
          ? `Set ${input.initialQuantity} on hand at ${locationName ?? "the selected location"}.`
          : "No location stock snapshot will be created.",
      ],
      metadata: {
        sku: input.sku ?? null,
        partNumber: input.partNumber ?? null,
        locationId: input.locationId ?? null,
        initialQuantity: input.initialQuantity,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required for atomic inventory creation.",
      );
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_create_inventory_part_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_name: input.name,
        p_sku: input.sku ?? null,
        p_part_number: input.partNumber ?? null,
        p_manufacturer: input.manufacturer ?? null,
        p_category: input.category ?? null,
        p_description: input.description ?? null,
        p_cost: input.cost ?? null,
        p_price: input.price ?? null,
        p_initial_quantity: input.initialQuantity,
        p_location_id: input.locationId ?? null,
        p_low_stock_threshold: input.lowStockThreshold ?? null,
        p_reorder_quantity: input.reorderQuantity ?? null,
      },
    );
    return InventoryPartCreateResultSchema.parse(data);
  },
});

export const setInventoryStockTool = defineShopAssistantTool({
  name: "set_inventory_stock",
  domain: "inventory",
  description:
    "Set the counted on-hand quantity for one same-shop inventory part at one stock location, recording an auditable adjustment.",
  mode: "write",
  risk: "high",
  requiredCapability: "canManageParts",
  allowedRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
  confirmation: "required",
  inputSchema: z.object({
    partId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantityOnHand: z.number().nonnegative().max(10_000_000),
    reason: z.string().trim().min(3).max(500),
  }),
  outputSchema: InventoryStockResultSchema,
  async preview(input, context) {
    const admin = createAdminSupabase();
    const [partResult, locationResult, stockResult] = await Promise.all([
      admin
        .from("parts")
        .select("id, name, sku")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.partId)
        .maybeSingle(),
      admin
        .from("stock_locations")
        .select("id, name, code")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.locationId)
        .maybeSingle(),
      admin
        .from("part_stock")
        .select("qty_on_hand, qty_reserved")
        .eq("part_id", input.partId)
        .eq("location_id", input.locationId)
        .maybeSingle(),
    ]);
    if (partResult.error) throw new Error(partResult.error.message);
    if (locationResult.error) throw new Error(locationResult.error.message);
    if (stockResult.error) throw new Error(stockResult.error.message);
    if (!partResult.data) {
      throw new ShopAssistantHttpError(
        404,
        "Inventory part not found in this shop.",
      );
    }
    if (!locationResult.data) {
      throw new ShopAssistantHttpError(
        404,
        "Inventory location not found in this shop.",
      );
    }
    const current = Number(stockResult.data?.qty_on_hand ?? 0);
    const reserved = Number(stockResult.data?.qty_reserved ?? 0);
    if (input.quantityOnHand < reserved) {
      throw new ShopAssistantHttpError(
        409,
        `The counted quantity cannot be below ${reserved}, which is already reserved.`,
      );
    }
    const delta = input.quantityOnHand - current;
    const partLabel = partResult.data.sku
      ? `${partResult.data.name} (${partResult.data.sku})`
      : partResult.data.name;
    const locationLabel =
      locationResult.data.name?.trim() || locationResult.data.code;
    return {
      title: `Set ${partLabel} stock to ${input.quantityOnHand}`,
      summary: `Adjust ${locationLabel} from ${current} to ${input.quantityOnHand} on hand.`,
      consequences: [
        `The stock change will be ${delta >= 0 ? "+" : ""}${delta}.`,
        `Reason: ${input.reason}`,
        "A tenant-scoped, idempotent stock movement will preserve the audit trail.",
      ],
      targetVersions: {
        [`inventory_stock:${input.partId}:${input.locationId}`]:
          String(current),
      },
      metadata: { current, reserved, delta },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for atomic stock adjustments.");
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_set_inventory_stock_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_part_id: input.partId,
        p_location_id: input.locationId,
        p_quantity_on_hand: input.quantityOnHand,
        p_reason: input.reason,
      },
    );
    return InventoryStockResultSchema.parse(data);
  },
});

export const createPurchaseOrderTool = defineShopAssistantTool({
  name: "create_purchase_order",
  domain: "inventory",
  description:
    "Create one same-shop draft purchase order with validated supplier, catalog or free-text lines, optional work-order anchor, costs, and receiving locations.",
  mode: "write",
  risk: "high",
  requiredCapability: "canManageParts",
  allowedRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
  confirmation: "required",
  inputSchema: z.object({
    supplierId: z.string().uuid(),
    workOrderId: z.string().uuid().optional(),
    expectedAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).optional(),
    lines: z.array(PurchaseOrderLineInputSchema).min(1).max(50),
  }),
  outputSchema: PurchaseOrderMutationResultSchema,
  async preview(input, context) {
    const admin = createAdminSupabase();
    const partIds = [
      ...new Set(input.lines.flatMap((line) => line.partId ?? [])),
    ];
    const locationIds = [
      ...new Set(input.lines.flatMap((line) => line.locationId ?? [])),
    ];
    const [supplierResult, workOrderResult, partsResult, locationsResult] =
      await Promise.all([
        admin
          .from("suppliers")
          .select("id, name, is_active")
          .eq("shop_id", context.actor.shopId)
          .eq("id", input.supplierId)
          .maybeSingle(),
        input.workOrderId
          ? admin
              .from("work_orders")
              .select("id, custom_id")
              .eq("shop_id", context.actor.shopId)
              .eq("id", input.workOrderId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        partIds.length
          ? admin
              .from("parts")
              .select("id, name, sku, default_cost, cost")
              .eq("shop_id", context.actor.shopId)
              .in("id", partIds)
          : Promise.resolve({ data: [], error: null }),
        locationIds.length
          ? admin
              .from("stock_locations")
              .select("id, name, code")
              .eq("shop_id", context.actor.shopId)
              .in("id", locationIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    const lookupError =
      supplierResult.error ??
      workOrderResult.error ??
      partsResult.error ??
      locationsResult.error;
    if (lookupError) throw new Error(lookupError.message);
    if (!supplierResult.data || supplierResult.data.is_active === false) {
      throw new ShopAssistantHttpError(
        404,
        "Active supplier not found in this shop.",
      );
    }
    if (input.workOrderId && !workOrderResult.data) {
      throw new ShopAssistantHttpError(
        404,
        "Work order not found in this shop.",
      );
    }
    if ((partsResult.data ?? []).length !== partIds.length) {
      throw new ShopAssistantHttpError(
        404,
        "One or more purchase-order parts were not found in this shop.",
      );
    }
    if ((locationsResult.data ?? []).length !== locationIds.length) {
      throw new ShopAssistantHttpError(
        404,
        "One or more receiving locations were not found in this shop.",
      );
    }
    const parts = new Map(
      (partsResult.data ?? []).map((part) => [part.id, part] as const),
    );
    const subtotal = input.lines.reduce((sum, line) => {
      const part = line.partId ? parts.get(line.partId) : null;
      const unitCost =
        line.unitCost ?? Number(part?.default_cost ?? part?.cost ?? 0);
      return sum + line.quantity * unitCost;
    }, 0);
    return {
      title: `Create purchase order for ${supplierResult.data.name}`,
      summary: `Create a ${input.lines.length}-line draft PO with an estimated subtotal of $${subtotal.toFixed(2)}.`,
      consequences: [
        "A draft purchase order and all lines will be created atomically.",
        "Catalog parts and receiving locations are validated against this shop.",
        "The supplier is not contacted until the PO is separately placed.",
        input.workOrderId
          ? `The PO will be anchored to ${workOrderResult.data?.custom_id ? `WO #${workOrderResult.data.custom_id}` : "the selected work order"}.`
          : "The PO will not be anchored to one work order.",
      ],
      metadata: {
        supplierId: input.supplierId,
        supplierName: supplierResult.data.name,
        lineCount: input.lines.length,
        subtotal,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required to create a purchase order.");
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_create_purchase_order_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_supplier_id: input.supplierId,
        p_work_order_id: input.workOrderId ?? null,
        p_expected_at: input.expectedAt ?? null,
        p_notes: input.notes ?? null,
        p_lines: input.lines,
      },
    );
    return PurchaseOrderMutationResultSchema.parse(data);
  },
});

export const placePurchaseOrderTool = defineShopAssistantTool({
  name: "place_purchase_order",
  domain: "inventory",
  description:
    "Place a validated non-empty draft purchase order, using canonical quote-contact auditing when the PO came from a supplier quote.",
  mode: "write",
  risk: "high",
  requiredCapability: "canManageParts",
  allowedRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
  confirmation: "required",
  inputSchema: z.object({
    purchaseOrderId: z.string().uuid(),
    contactChannel: z.enum(["email", "phone"]).optional(),
  }),
  outputSchema: PurchaseOrderPlacementResultSchema,
  async preview(input, context) {
    const admin = createAdminSupabase();
    const [purchaseOrderResult, linesResult] = await Promise.all([
      admin
        .from("purchase_orders")
        .select(
          "id, po_number, status, ordered_at, received_at, expected_at, notes, shipping_total, subtotal, tax_total, total, supplier_quote_request_id, supplier_id, supplier_contact_channel, supplier_contacted_at, supplier_contacted_by, work_order_id, suppliers!inner(id, name, email, phone, is_active, account_no)",
        )
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.purchaseOrderId)
        .maybeSingle(),
      loadPurchaseOrderPlacementLines(input.purchaseOrderId),
    ]);
    if (purchaseOrderResult.error) {
      throw new Error(purchaseOrderResult.error.message);
    }
    const purchaseOrder = purchaseOrderResult.data;
    if (!purchaseOrder) {
      throw new ShopAssistantHttpError(
        404,
        "Purchase order not found in this shop.",
      );
    }
    if (purchaseOrder.status !== "draft") {
      throw new ShopAssistantHttpError(
        409,
        "Only a draft purchase order can be placed.",
      );
    }
    if (linesResult.length > 500) {
      throw new ShopAssistantHttpError(
        409,
        "This purchase order has more than 500 lines. Review and place a smaller purchase order directly.",
      );
    }
    const activeLineCount = linesResult.filter(
      (line) => Number(line.qty ?? 0) - Number(line.cancelled_qty ?? 0) > 0,
    ).length;
    if (!activeLineCount) {
      throw new ShopAssistantHttpError(
        409,
        "Add at least one active line before placing this purchase order.",
      );
    }
    const supplier = Array.isArray(purchaseOrder.suppliers)
      ? purchaseOrder.suppliers[0]
      : purchaseOrder.suppliers;
    if (!supplier || !supplier.is_active) {
      throw new ShopAssistantHttpError(
        409,
        "The purchase-order supplier is no longer active in this shop.",
      );
    }
    if (!purchaseOrder.supplier_quote_request_id && input.contactChannel) {
      throw new ShopAssistantHttpError(
        409,
        "Supplier contact can only be audited while placing a quote-backed purchase order.",
      );
    }
    const contactChannel = purchaseOrder.supplier_quote_request_id
      ? (input.contactChannel ??
        (supplier?.email ? "email" : supplier?.phone ? "phone" : null))
      : (input.contactChannel ?? null);
    if (purchaseOrder.supplier_quote_request_id && !contactChannel) {
      throw new ShopAssistantHttpError(
        409,
        "The quoted supplier needs an email address or phone number before this PO can be placed.",
      );
    }
    const poNumber = purchaseOrder.po_number || purchaseOrder.id.slice(0, 8);
    return {
      title: `Place ${poNumber}`,
      summary: `Open this ${activeLineCount}-line purchase order with ${supplier?.name ?? "the supplier"}.`,
      consequences: [
        "The PO status will change from draft to open.",
        "Its ordered timestamp will be recorded.",
        contactChannel
          ? `Supplier contact will be audited through ${contactChannel}.`
          : "No supplier-contact delivery is performed for this manually created PO.",
      ],
      targetVersions: {
        [`purchase_order:${purchaseOrder.id}`]: JSON.stringify({
          expectedAt: purchaseOrder.expected_at ?? null,
          notes: purchaseOrder.notes ?? null,
          orderedAt: purchaseOrder.ordered_at ?? null,
          poNumber: purchaseOrder.po_number ?? null,
          receivedAt: purchaseOrder.received_at ?? null,
          shippingTotal:
            purchaseOrder.shipping_total == null
              ? null
              : Number(purchaseOrder.shipping_total),
          status: purchaseOrder.status,
          subtotal:
            purchaseOrder.subtotal == null
              ? null
              : Number(purchaseOrder.subtotal),
          supplierContactChannel:
            purchaseOrder.supplier_contact_channel ?? null,
          supplierContactedAt: purchaseOrder.supplier_contacted_at ?? null,
          supplierContactedBy: purchaseOrder.supplier_contacted_by ?? null,
          supplierId: purchaseOrder.supplier_id,
          supplierQuoteRequestId:
            purchaseOrder.supplier_quote_request_id ?? null,
          taxTotal:
            purchaseOrder.tax_total == null
              ? null
              : Number(purchaseOrder.tax_total),
          total:
            purchaseOrder.total == null ? null : Number(purchaseOrder.total),
          workOrderId: purchaseOrder.work_order_id ?? null,
        }),
        [`purchase_order_line_count:${purchaseOrder.id}`]: String(
          linesResult.length,
        ),
        ...Object.fromEntries(
          linesResult.map((line) => [
            `purchase_order_line:${line.id}`,
            purchaseOrderLineVersion(line),
          ]),
        ),
        [`purchase_order_supplier:${supplier.id}`]: JSON.stringify({
          accountNumber: supplier.account_no ?? null,
          email: supplier.email ?? null,
          isActive: supplier.is_active,
          name: supplier.name,
          phone: supplier.phone ?? null,
        }),
        [`purchase_order_contact_channel:${purchaseOrder.id}`]:
          contactChannel ?? "",
      },
      metadata: { contactChannel, poNumber, activeLineCount },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required to place a purchase order.");
    }
    const contactVersionKey = `purchase_order_contact_channel:${input.purchaseOrderId}`;
    if (
      !Object.prototype.hasOwnProperty.call(
        context.targetVersions ?? {},
        contactVersionKey,
      )
    ) {
      throw new ShopAssistantHttpError(
        409,
        "The confirmed supplier contact method is missing. Ask again to review this purchase order.",
      );
    }
    const confirmedContactChannel =
      context.targetVersions?.[contactVersionKey] ?? "";
    const contactChannel =
      confirmedContactChannel === "email" || confirmedContactChannel === "phone"
        ? confirmedContactChannel
        : null;
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_place_purchase_order_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_purchase_order_id: input.purchaseOrderId,
        p_contact_channel: contactChannel,
      },
    );
    return PurchaseOrderPlacementResultSchema.parse(data);
  },
});

export const receivePurchaseOrderLineTool = defineShopAssistantTool({
  name: "receive_purchase_order_line",
  domain: "inventory",
  description:
    "Receive an exact quantity against one purchase-order line using the canonical catalog or free-text receipt lifecycle.",
  mode: "write",
  risk: "high",
  requiredCapability: "canManageParts",
  allowedRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
  confirmation: "required",
  inputSchema: z.object({
    purchaseOrderId: z.string().uuid(),
    purchaseOrderLineId: z.string().uuid(),
    quantity: z.number().finite().positive().max(1_000_000),
    locationId: z.string().uuid().optional(),
  }),
  outputSchema: PurchaseOrderReceiptResultSchema,
  async preview(input, context) {
    const admin = createAdminSupabase();
    const { data: line, error } = await admin
      .from("purchase_order_lines")
      .select(
        "id, po_id, part_id, description, sku, qty, received_qty, cancelled_qty, location_id, purchase_orders!inner(shop_id, po_number, status)",
      )
      .eq("id", input.purchaseOrderLineId)
      .eq("po_id", input.purchaseOrderId)
      .eq("purchase_orders.shop_id", context.actor.shopId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!line) {
      throw new ShopAssistantHttpError(
        404,
        "Purchase-order line not found in this shop.",
      );
    }
    const purchaseOrder = Array.isArray(line.purchase_orders)
      ? line.purchase_orders[0]
      : line.purchase_orders;
    if (purchaseOrder?.status !== "open") {
      throw new ShopAssistantHttpError(
        409,
        "Only an open purchase order can receive parts. Place the purchase order first.",
      );
    }
    const remaining = Math.max(
      0,
      Number(line.qty ?? 0) -
        Number(line.cancelled_qty ?? 0) -
        Number(line.received_qty ?? 0),
    );
    if (input.quantity > remaining + 0.000001) {
      throw new ShopAssistantHttpError(
        409,
        `Only ${remaining} remains to receive on this PO line.`,
      );
    }
    const locationId = input.locationId ?? line.location_id ?? null;
    if (line.part_id && !locationId) {
      throw new ShopAssistantHttpError(
        400,
        "A stock location is required to receive a catalog part.",
      );
    }
    if (locationId) {
      const { data: location, error: locationError } = await admin
        .from("stock_locations")
        .select("id")
        .eq("shop_id", context.actor.shopId)
        .eq("id", locationId)
        .maybeSingle();
      if (locationError) throw new Error(locationError.message);
      if (!location) {
        throw new ShopAssistantHttpError(
          404,
          "Receiving location not found in this shop.",
        );
      }
    }
    const label = line.description?.trim() || line.sku?.trim() || "PO line";
    return {
      title: `Receive ${input.quantity} × ${label}`,
      summary: `Receive this quantity against ${purchaseOrder?.po_number ?? "the purchase order"}.`,
      consequences: [
        `The line received quantity will increase from ${Number(line.received_qty ?? 0)} to ${Number(line.received_qty ?? 0) + input.quantity}.`,
        line.part_id
          ? "On-hand inventory will increase at the selected stock location."
          : "This free-text receipt will not create catalog inventory.",
        "The PO closes automatically only when every active line is fully received.",
      ],
      targetVersions: {
        [`purchase_order_line:${line.id}`]: [
          line.qty,
          line.received_qty,
          line.cancelled_qty,
          purchaseOrder?.status ?? "",
        ].join(":"),
      },
      metadata: { partId: line.part_id, locationId, remaining },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required to receive a purchase-order line.",
      );
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_receive_purchase_order_line_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_purchase_order_id: input.purchaseOrderId,
        p_purchase_order_line_id: input.purchaseOrderLineId,
        p_quantity: input.quantity,
        p_location_id: input.locationId ?? null,
      },
    );
    return PurchaseOrderReceiptResultSchema.parse(data);
  },
});
