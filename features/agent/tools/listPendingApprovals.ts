// features/agent/tools/listPendingApprovals.ts
import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

export const ListPendingApprovalsIn = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});
export type ListPendingApprovalsIn = z.infer<typeof ListPendingApprovalsIn>;

export const ListPendingApprovalsOut = z.object({
  items: z.array(
    z.object({
      workOrderId: z.string().uuid(),
      customId: z.string().nullable(),
      customerName: z.string().nullable(),
      vehicleSummary: z.string().nullable(),
      estimatedTotal: z.number().nullable(),
      lines: z.array(
        z.object({
          id: z.string().uuid(),
          description: z.string().nullable(),
          jobType: z.string().nullable(),
          laborTime: z.number().nullable(),
          status: z.string().nullable(),
          approvalState: z.string().nullable(),
          notes: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type ListPendingApprovalsOut = z.infer<typeof ListPendingApprovalsOut>;

export const toolListPendingApprovals: ToolDef<
  ListPendingApprovalsIn,
  ListPendingApprovalsOut
> = {
  name: "list_pending_approvals",
  description:
    "Lists work orders and job lines that require advisor approval in this shop.",
  inputSchema: ListPendingApprovalsIn,
  outputSchema: ListPendingApprovalsOut,
  async run(input, ctx) {
    const supabase = getServerSupabase();
    const limit = input.limit ?? 20;

    const { data, error } = await supabase
      .from("work_order_lines")
      .select(
        `
        id,
        description,
        job_type,
        labor_time,
        status,
        approval_state,
        notes,
        work_orders!inner (
          id,
          custom_id,
          estimated_total,
          customer:customers (
            first_name, last_name
          ),
          vehicle:vehicles (
            year, make, model, unit_number, license_plate
          )
        )
      `,
      )
      .eq("work_orders.shop_id", ctx.shopId)
      .eq("approval_state", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    const byWo = new Map<string, ListPendingApprovalsOut["items"][number]>();

    for (const row of data ?? []) {
      const wo = (row as any).work_orders;
      if (!byWo.has(wo.id)) {
        const vehicle = wo.vehicle ?? {};
        const customer = wo.customer ?? {};
        const vehicleSummaryParts = [
          vehicle.year,
          vehicle.make,
          vehicle.model,
          vehicle.unit_number || vehicle.license_plate,
        ]
          .filter(Boolean)
          .join(" ");

        const customerName = [customer.first_name, customer.last_name]
          .filter(Boolean)
          .join(" ");

        byWo.set(wo.id, {
          workOrderId: wo.id,
          customId: wo.custom_id ?? null,
          customerName: customerName || null,
          vehicleSummary: vehicleSummaryParts || null,
          estimatedTotal: wo.estimated_total ?? null,
          lines: [],
        });
      }

      const bucket = byWo.get(wo.id)!;
      bucket.lines.push({
        id: row.id,
        description: row.description ?? null,
        jobType: row.job_type ?? null,
        laborTime: row.labor_time ?? null,
        status: row.status ?? null,
        approvalState: row.approval_state ?? null,
        notes: row.notes ?? null,
      });
    }

    return { items: Array.from(byWo.values()) };
  },
};