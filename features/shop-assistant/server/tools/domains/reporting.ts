import "server-only";

import { z } from "zod";

import { buildShopState } from "@/features/shop-assistant/server/state/buildShopState";
import { defineShopAssistantTool } from "../types";

export const readShopStateTool = defineShopAssistantTool({
  name: "read_shop_state",
  domain: "reporting",
  description: "Read the current deterministic shop operating state.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: [
    "canViewShopWideData",
    "canManageWorkOrders",
    "canManageParts",
    "canAssignWork",
  ],
  confirmation: "never",
  inputSchema: z.object({}),
  outputSchema: z.object({
    ok: z.literal(true),
    generatedAt: z.string(),
    headline: z.string(),
    metrics: z.record(z.string(), z.number()),
    alerts: z.array(
      z.object({
        id: z.string(),
        code: z.string(),
        level: z.string(),
        title: z.string(),
        message: z.string(),
        href: z.string().optional(),
      }),
    ),
    summary: z.string(),
  }),
  async execute(_input, context) {
    const state = await buildShopState(context.actor);
    const metrics = Object.fromEntries(
      state.visibleMetricKeys.map((key) => [key, state.metrics[key]]),
    );
    return {
      ok: true as const,
      generatedAt: state.generatedAt,
      headline: state.headline,
      metrics,
      alerts: state.alerts.map((alert) => ({
        id: alert.id,
        code: alert.code,
        level: alert.level,
        title: alert.title,
        message: alert.message,
        href: alert.href,
      })),
      summary: state.headline,
    };
  },
});

export const readBusinessSnapshotTool = defineShopAssistantTool({
  name: "read_business_snapshot",
  domain: "business_analytics",
  description:
    "Read a bounded financial and throughput snapshot for a recent date window.",
  mode: "read",
  risk: "low",
  requiredCapability: "canViewFinancials",
  confirmation: "never",
  inputSchema: z.object({
    lookbackDays: z.number().int().min(1).max(365).default(30),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    lookbackDays: z.number().int(),
    createdWorkOrders: z.number().int().nonnegative(),
    completedWorkOrders: z.number().int().nonnegative(),
    issuedInvoices: z.number().int().nonnegative(),
    issuedRevenue: z.number().nonnegative(),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const since = new Date(
      Date.now() - input.lookbackDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [created, completed, invoices] = await Promise.all([
      context.actor.supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", context.actor.shopId)
        .gte("created_at", since),
      context.actor.supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", context.actor.shopId)
        .in("status", ["completed", "ready_to_invoice", "invoiced"])
        .gte("updated_at", since),
      context.actor.supabase
        .from("invoices")
        .select("id, total, status, issued_at")
        .eq("shop_id", context.actor.shopId)
        .gte("issued_at", since)
        .in("status", [
          "issued",
          "issued_pending_send",
          "sent",
          "paid",
          "partially_paid",
        ]),
    ]);

    if (created.error) throw new Error(created.error.message);
    if (completed.error) throw new Error(completed.error.message);
    if (invoices.error) throw new Error(invoices.error.message);

    const issuedInvoices = invoices.data?.length ?? 0;
    const issuedRevenue = (invoices.data ?? []).reduce(
      (sum, invoice) => sum + Number(invoice.total ?? 0),
      0,
    );
    const createdWorkOrders = Number(created.count ?? 0);
    const completedWorkOrders = Number(completed.count ?? 0);

    return {
      ok: true as const,
      lookbackDays: input.lookbackDays,
      createdWorkOrders,
      completedWorkOrders,
      issuedInvoices,
      issuedRevenue,
      summary: `${createdWorkOrders} work orders were created, ${completedWorkOrders} reached a completed billing state, and ${issuedInvoices} invoices totaling ${issuedRevenue.toFixed(2)} were issued in the last ${input.lookbackDays} day(s).`,
      href: "/dashboard",
    };
  },
});

const DailyChangeSchema = z.object({
  id: z.string(),
  domain: z.enum([
    "work_orders",
    "scheduling",
    "inventory",
    "invoices",
    "workforce",
  ]),
  at: z.string(),
  label: z.string(),
  detail: z.string().nullable(),
  href: z.string(),
});

export const readDailyActivityTool = defineShopAssistantTool({
  name: "read_daily_activity",
  domain: "reporting",
  description:
    "Read bounded work-order, booking, parts, invoice, and technician activity changes projected to the actor's role.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: [
    "canViewShopWideData",
    "canManageScheduling",
    "canManageBilling",
    "canViewFinancials",
    "canAssignWork",
    "canManageWorkOrders",
    "canManageParts",
    "canManageWorkforce",
  ],
  confirmation: "never",
  inputSchema: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    startsAt: z.string(),
    endsAt: z.string(),
    counts: z.object({
      workOrderChanges: z.number().int().nonnegative(),
      bookingChanges: z.number().int().nonnegative(),
      inventoryChanges: z.number().int().nonnegative(),
      invoiceChanges: z.number().int().nonnegative(),
      technicianChanges: z.number().int().nonnegative(),
    }),
    changes: z.array(DailyChangeSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    if (
      new Date(input.startsAt).getTime() >= new Date(input.endsAt).getTime()
    ) {
      throw new Error("Activity range end must be after its start.");
    }
    const canSchedule = context.actor.capabilities.canManageScheduling;
    const canWorkOrders =
      context.actor.capabilities.canViewShopWideData ||
      context.actor.capabilities.canManageWorkOrders;
    const canParts = context.actor.capabilities.canManageParts;
    const canInvoice = [
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
    ].includes(context.actor.canonicalRole);
    const canWorkforce =
      context.actor.capabilities.canAssignWork ||
      context.actor.capabilities.canManageWorkforce;

    const [
      workOrderResult,
      bookingResult,
      inventoryResult,
      invoiceResult,
      technicianResult,
    ] = await Promise.all([
      canWorkOrders
        ? context.actor.supabase
            .from("work_orders")
            .select("id, custom_id, status, updated_at", { count: "exact" })
            .eq("shop_id", context.actor.shopId)
            .gte("updated_at", input.startsAt)
            .lt("updated_at", input.endsAt)
            .order("updated_at", { ascending: false })
            .limit(input.limit)
        : Promise.resolve({ data: [], error: null, count: 0 }),
      canSchedule
        ? context.actor.supabase
            .from("bookings")
            .select("id, starts_at, status, updated_at, work_order_id", {
              count: "exact",
            })
            .eq("shop_id", context.actor.shopId)
            .gte("updated_at", input.startsAt)
            .lt("updated_at", input.endsAt)
            .order("updated_at", { ascending: false })
            .limit(input.limit)
        : Promise.resolve({ data: [], error: null, count: 0 }),
      canParts
        ? context.actor.supabase
            .from("part_request_items")
            .select("id, description, status, updated_at, work_order_id", {
              count: "exact",
            })
            .eq("shop_id", context.actor.shopId)
            .gte("updated_at", input.startsAt)
            .lt("updated_at", input.endsAt)
            .order("updated_at", { ascending: false })
            .limit(input.limit)
        : Promise.resolve({ data: [], error: null, count: 0 }),
      canInvoice
        ? context.actor.supabase
            .from("invoices")
            .select("id, invoice_number, status, updated_at, work_order_id", {
              count: "exact",
            })
            .eq("shop_id", context.actor.shopId)
            .gte("updated_at", input.startsAt)
            .lt("updated_at", input.endsAt)
            .order("updated_at", { ascending: false })
            .limit(input.limit)
        : Promise.resolve({ data: [], error: null, count: 0 }),
      canWorkforce
        ? context.actor.supabase
            .from("work_order_line_labor_segments")
            .select(
              "id, started_at, ended_at, updated_at, work_order_id, technician_id",
              { count: "exact" },
            )
            .eq("shop_id", context.actor.shopId)
            .gte("updated_at", input.startsAt)
            .lt("updated_at", input.endsAt)
            .order("updated_at", { ascending: false })
            .limit(input.limit)
        : Promise.resolve({ data: [], error: null, count: 0 }),
    ]);
    if (workOrderResult.error) throw new Error(workOrderResult.error.message);
    if (bookingResult.error) throw new Error(bookingResult.error.message);
    if (inventoryResult.error) throw new Error(inventoryResult.error.message);
    if (invoiceResult.error) throw new Error(invoiceResult.error.message);
    if (technicianResult.error) throw new Error(technicianResult.error.message);

    const changes = [
      ...(workOrderResult.data ?? []).map((row) => ({
        id: `work-order:${row.id}`,
        domain: "work_orders" as const,
        at: row.updated_at ?? input.startsAt,
        label: `${row.custom_id ? `WO #${row.custom_id}` : "Work order"} ${row.status ?? "updated"}`,
        detail: null,
        href: `/work-orders/${row.id}`,
      })),
      ...(bookingResult.data ?? []).map((row) => ({
        id: `booking:${row.id}`,
        domain: "scheduling" as const,
        at: row.updated_at,
        label: `Appointment ${row.status ?? "updated"}`,
        detail: `Starts ${row.starts_at}`,
        href: row.work_order_id
          ? `/work-orders/${row.work_order_id}`
          : "/dashboard/appointments",
      })),
      ...(inventoryResult.data ?? []).map((row) => ({
        id: `part-request-item:${row.id}`,
        domain: "inventory" as const,
        at: row.updated_at,
        label: `${row.description} ${row.status ?? "updated"}`,
        detail: "Part request activity",
        href: row.work_order_id
          ? `/work-orders/${row.work_order_id}`
          : "/parts/requests",
      })),
      ...(invoiceResult.data ?? []).map((row) => ({
        id: `invoice:${row.id}`,
        domain: "invoices" as const,
        at: row.updated_at,
        label: `${row.invoice_number ? `Invoice ${row.invoice_number}` : "Invoice"} ${row.status ?? "updated"}`,
        detail: null,
        href: row.work_order_id
          ? `/work-orders/invoice/${row.work_order_id}`
          : "/billing",
      })),
      ...(technicianResult.data ?? []).map((row) => ({
        id: `labor:${row.id}`,
        domain: "workforce" as const,
        at: row.updated_at,
        label: row.ended_at
          ? "Technician stopped a job"
          : "Technician started a job",
        detail: `Technician ${row.technician_id.slice(0, 8)}`,
        href: `/work-orders/${row.work_order_id}`,
      })),
    ]
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, input.limit);

    const counts = {
      workOrderChanges: workOrderResult.count ?? 0,
      bookingChanges: bookingResult.count ?? 0,
      inventoryChanges: inventoryResult.count ?? 0,
      invoiceChanges: invoiceResult.count ?? 0,
      technicianChanges: technicianResult.count ?? 0,
    };
    const visibleCounts = [
      canWorkOrders ? `${counts.workOrderChanges} work-order` : null,
      canSchedule ? `${counts.bookingChanges} booking` : null,
      canParts ? `${counts.inventoryChanges} parts` : null,
      canInvoice ? `${counts.invoiceChanges} invoice` : null,
      canWorkforce ? `${counts.technicianChanges} technician` : null,
    ].filter((value): value is string => Boolean(value));
    return {
      ok: true as const,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      counts,
      changes,
      summary: `${visibleCounts.join(", ")} activity change(s) were recorded in the requested shop-local window.`,
      href: "/assistant",
    };
  },
});
