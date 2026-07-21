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
  requiredCapability: "canViewShopWideData",
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
    return {
      ok: true as const,
      generatedAt: state.generatedAt,
      headline: state.headline,
      metrics: state.metrics,
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
  description: "Read a bounded financial and throughput snapshot for a recent date window.",
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
        .in("status", ["issued_pending_send", "sent", "paid", "partially_paid"]),
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
