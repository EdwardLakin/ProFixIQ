import "server-only";

import { z } from "zod";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getTechnicianLoadMetricsWithClient } from "@/features/shared/lib/stats/getTechnicianLoadMetricsCore";
import { defineShopAssistantTool } from "../types";

const TechnicianLoadSchema = z.object({
  technicianId: z.string().uuid(),
  name: z.string(),
  role: z.string().nullable(),
  activeJobs: z.number().int().nonnegative(),
  completedJobsToday: z.number().int().nonnegative(),
  utilizationPct: z.number(),
  shiftSecondsToday: z.number().nonnegative(),
});

export const listTechnicianLoadTool = defineShopAssistantTool({
  name: "list_technician_load",
  domain: "workforce",
  description: "Read current technician load and available capacity.",
  mode: "read",
  risk: "low",
  requiredCapability: "canViewShopWideData",
  confirmation: "never",
  inputSchema: z.object({
    includeOffShift: z.boolean().default(false),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    technicians: z.array(TechnicianLoadSchema),
    shopUtilizationPct: z.number(),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const load = await getTechnicianLoadMetricsWithClient(
      context.actor.supabase,
      context.actor.shopId,
    );
    const technicians = load.rows
      .filter((row) => input.includeOffShift || row.shiftSecondsToday > 0)
      .map((row) => ({
        technicianId: row.techId,
        name: row.name,
        role: row.role,
        activeJobs: row.currentActiveJobs,
        completedJobsToday: row.completedJobsToday,
        utilizationPct: row.utilizationPct,
        shiftSecondsToday: row.shiftSecondsToday,
      }));

    return {
      ok: true as const,
      technicians,
      shopUtilizationPct: load.summary.shopUtilizationPct,
      summary: `${technicians.length} technician(s) are included in the current load view.`,
      href: "/dashboard",
    };
  },
});

export const assignWorkOrderTool = defineShopAssistantTool({
  name: "assign_work_order",
  domain: "workforce",
  description: "Assign all unassigned job lines on one work order to a same-shop technician.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canAssignWork",
  confirmation: "required",
  inputSchema: z.object({
    workOrderId: z.string().uuid(),
    technicianId: z.string().uuid(),
    onlyUnassigned: z.boolean().default(true),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    workOrderId: z.string().uuid(),
    technicianId: z.string().uuid(),
    technicianName: z.string(),
    assignedLines: z.number().int().nonnegative(),
    summary: z.string(),
    href: z.string(),
  }),
  async preview(input, context) {
    const admin = createAdminSupabase();
    const [{ data: workOrder, error: workOrderError }, { data: technician, error: technicianError }] =
      await Promise.all([
        admin
          .from("work_orders")
          .select("id, custom_id, shop_id, updated_at")
          .eq("id", input.workOrderId)
          .eq("shop_id", context.actor.shopId)
          .maybeSingle(),
        admin
          .from("profiles")
          .select("id, shop_id, role, full_name")
          .eq("id", input.technicianId)
          .eq("shop_id", context.actor.shopId)
          .maybeSingle(),
      ]);
    if (workOrderError) throw new Error(workOrderError.message);
    if (technicianError) throw new Error(technicianError.message);
    if (!workOrder) throw new Error("Work order not found in this shop.");
    if (!technician) throw new Error("Technician not found in this shop.");
    if (!new Set(["mechanic", "tech", "foreman", "lead_hand"]).has(String(technician.role ?? "").toLowerCase())) {
      throw new Error("Selected profile is not assignable as a technician.");
    }

    let countQuery = admin
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", workOrder.id)
      .eq("line_type", "job");
    if (input.onlyUnassigned) countQuery = countQuery.is("assigned_tech_id", null);
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    const label = workOrder.custom_id
      ? `WO #${workOrder.custom_id}`
      : `WO ${workOrder.id.slice(0, 8)}`;
    return {
      title: `Assign ${label} to ${technician.full_name ?? "technician"}`,
      summary: `${count ?? 0} job line(s) will be assigned to ${technician.full_name ?? "the selected technician"}.`,
      consequences: [
        input.onlyUnassigned
          ? "Existing technician assignments will remain unchanged."
          : "Existing primary technician assignments may be replaced.",
      ],
      targetVersions: workOrder.updated_at
        ? { [`work_order:${workOrder.id}`]: workOrder.updated_at }
        : {},
      metadata: {
        workOrderId: workOrder.id,
        technicianId: technician.id,
        technicianName: technician.full_name,
      },
    };
  },
  async execute(input, context) {
    const admin = createAdminSupabase();
    const [{ data: workOrder, error: workOrderError }, { data: technician, error: technicianError }] =
      await Promise.all([
        admin
          .from("work_orders")
          .select("id, custom_id, shop_id, updated_at")
          .eq("id", input.workOrderId)
          .eq("shop_id", context.actor.shopId)
          .maybeSingle(),
        admin
          .from("profiles")
          .select("id, shop_id, role, full_name")
          .eq("id", input.technicianId)
          .eq("shop_id", context.actor.shopId)
          .maybeSingle(),
      ]);
    if (workOrderError) throw new Error(workOrderError.message);
    if (technicianError) throw new Error(technicianError.message);
    if (!workOrder) throw new Error("Work order not found in this shop.");
    if (!technician) throw new Error("Technician not found in this shop.");
    if (!new Set(["mechanic", "tech", "foreman", "lead_hand"]).has(String(technician.role ?? "").toLowerCase())) {
      throw new Error("Selected profile is not assignable as a technician.");
    }

    const expectedVersion = context.targetVersions?.[`work_order:${workOrder.id}`];
    if (expectedVersion && workOrder.updated_at !== expectedVersion) {
      throw new Error(
        "The work order changed after the preview. Review the latest assignments before confirming again.",
      );
    }

    let update = admin
      .from("work_order_lines")
      .update({ assigned_tech_id: technician.id })
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", workOrder.id)
      .eq("line_type", "job");
    if (input.onlyUnassigned) update = update.is("assigned_tech_id", null);
    const { data: updatedRows, error: updateError } = await update.select("id");
    if (updateError) throw new Error(updateError.message);

    if ((updatedRows?.length ?? 0) > 0) {
      const { error: bridgeError } = await admin
        .from("work_order_line_technicians")
        .upsert(
          (updatedRows ?? []).map((row) => ({
            work_order_line_id: row.id,
            technician_id: technician.id,
            assigned_by: context.actor.userId,
          })),
          { onConflict: "work_order_line_id,technician_id" },
        );
      if (bridgeError) throw new Error(bridgeError.message);
    }

    const label = workOrder.custom_id
      ? `WO #${workOrder.custom_id}`
      : `WO ${workOrder.id.slice(0, 8)}`;
    return {
      ok: true as const,
      workOrderId: workOrder.id,
      technicianId: technician.id,
      technicianName: technician.full_name ?? "Technician",
      assignedLines: updatedRows?.length ?? 0,
      summary: `${label} assigned ${updatedRows?.length ?? 0} line(s) to ${technician.full_name ?? "the selected technician"}.`,
      href: `/work-orders/${workOrder.id}`,
    };
  },
});
