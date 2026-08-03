import "server-only";

import { z } from "zod";

import { defineShopAssistantTool } from "../types";

const InvoiceCandidateSchema = z.object({
  workOrderId: z.string().uuid(),
  customId: z.string().nullable(),
  status: z.string().nullable(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  updatedAt: z.string().nullable(),
  href: z.string(),
});

export const listReadyInvoicesTool = defineShopAssistantTool({
  name: "list_ready_invoices",
  domain: "invoices",
  description: "List completed or ready-to-invoice work orders for billing review.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageBilling",
  confirmation: "never",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    workOrders: z.array(InvoiceCandidateSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const { data, error } = await context.actor.supabase
      .from("work_orders")
      .select("id, custom_id, status, customer_id, customer_name, updated_at")
      .eq("shop_id", context.actor.shopId)
      .in("status", ["completed", "ready_to_invoice"])
      .order("updated_at", { ascending: true, nullsFirst: false })
      .limit(input.limit);
    if (error) throw new Error(error.message);

    const workOrders = (data ?? []).map((row) => ({
      workOrderId: row.id,
      customId: row.custom_id ?? null,
      status: row.status ?? null,
      customerId: row.customer_id ?? null,
      customerName: row.customer_name ?? null,
      updatedAt: row.updated_at ?? null,
      href: `/work-orders/invoice/${row.id}`,
    }));

    return {
      ok: true as const,
      workOrders,
      summary: `${workOrders.length} work order(s) are ready for invoice review.`,
      href: "/billing",
    };
  },
});

export const readInvoiceStatusTool = defineShopAssistantTool({
  name: "read_invoice_status",
  domain: "invoices",
  description: "Read the latest invoice lifecycle state for a work order.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageBilling",
  confirmation: "never",
  inputSchema: z.object({ workOrderId: z.string().uuid() }),
  outputSchema: z.object({
    ok: z.literal(true),
    workOrderId: z.string().uuid(),
    invoiceId: z.string().uuid().nullable(),
    status: z.string().nullable(),
    total: z.number().nullable(),
    issuedAt: z.string().nullable(),
    sentAt: z.string().nullable(),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const { data: workOrder, error: workOrderError } = await context.actor.supabase
      .from("work_orders")
      .select("id, custom_id")
      .eq("shop_id", context.actor.shopId)
      .eq("id", input.workOrderId)
      .maybeSingle();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!workOrder) throw new Error("Work order not found in this shop.");

    const { data, error } = await context.actor.supabase
      .from("invoices")
      .select("id, status, total, issued_at, sent_at, created_at")
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", input.workOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const label = workOrder.custom_id
      ? `WO #${workOrder.custom_id}`
      : `WO ${workOrder.id.slice(0, 8)}`;
    return {
      ok: true as const,
      workOrderId: workOrder.id,
      invoiceId: data?.id ?? null,
      status: data?.status ?? null,
      total: data?.total == null ? null : Number(data.total),
      issuedAt: data?.issued_at ?? null,
      sentAt: data?.sent_at ?? null,
      summary: data
        ? `${label} has an invoice in ${data.status ?? "unknown"} status.`
        : `${label} does not have a persisted invoice yet.`,
      href: `/work-orders/invoice/${workOrder.id}`,
    };
  },
});
