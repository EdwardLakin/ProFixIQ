import "server-only";

import { z } from "zod";

import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getTechnicianLoadMetricsWithClient } from "@/features/shared/lib/stats/getTechnicianLoadMetricsCore";
import { ageHours } from "@/features/agent/server/flowHealth";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { defineShopAssistantTool, runShopAssistantCommandRpc } from "../types";

const TechnicianLoadSchema = z.object({
  technicianId: z.string().uuid(),
  name: z.string(),
  role: z.string().nullable(),
  activeJobs: z.number().int().nonnegative(),
  completedJobsToday: z.number().int().nonnegative(),
  utilizationPct: z.number(),
  shiftSecondsToday: z.number().nonnegative(),
});

const AssignmentResultSchema = z.object({
  ok: z.literal(true),
  workOrderId: z.string().uuid(),
  technicianId: z.string().uuid(),
  technicianName: z.string(),
  assignedLines: z.number().int().nonnegative(),
  summary: z.string(),
  href: z.string(),
});

const AssignmentRecommendationSchema = z.object({
  workOrderId: z.string().uuid(),
  customId: z.string().nullable(),
  status: z.string().nullable(),
  priority: z.number().nullable(),
  ageHours: z.number().nonnegative(),
  primaryJob: z.string().nullable(),
  unassignedJobs: z.number().int().positive(),
  estimatedHours: z.number().nonnegative(),
  recommendedTechnicianId: z.string().uuid().nullable(),
  recommendedTechnicianName: z.string().nullable(),
  reason: z.string(),
  href: z.string(),
});

type AssignmentWorkOrderRow = {
  id: string;
  custom_id: string | null;
  status: string | null;
  priority: number | null;
  is_waiter: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type AssignmentLineRow = {
  id: string;
  work_order_id: string;
  description: string | null;
  labor_time: number | null;
  assigned_tech_id: string | null;
  line_status: string | null;
  status: string | null;
  priority: number | null;
  job_priority: string | null;
};

function isAssignableTechnicianRole(role: string | null | undefined): boolean {
  const canonical = canonicalizeRole(role);
  return (
    canonical === "mechanic" ||
    canonical === "lead_hand" ||
    canonical === "foreman"
  );
}

const TERMINAL_ASSIGNMENT_STATUSES = new Set([
  "completed",
  "done",
  "declined",
  "deferred",
  "cancelled",
  "canceled",
  "void",
  "voided",
  "ready_to_invoice",
  "invoiced",
]);

function normalizedStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

export const listTechnicianLoadTool = defineShopAssistantTool({
  name: "list_technician_load",
  domain: "workforce",
  description: "Read current technician load and available capacity.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canAssignWork", "canManageWorkforce"],
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

export const recommendWorkAssignmentsTool = defineShopAssistantTool({
  name: "recommend_work_assignments",
  domain: "workforce",
  description:
    "Rank queued work orders and pair them with available on-shift technicians without changing any assignment.",
  mode: "read",
  risk: "low",
  requiredCapability: "canAssignWork",
  confirmation: "never",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(25).default(10),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    recommendations: z.array(AssignmentRecommendationSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const workOrders: AssignmentWorkOrderRow[] = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await context.actor.supabase
        .from("work_orders")
        .select(
          "id, custom_id, status, priority, is_waiter, created_at, updated_at",
        )
        .eq("shop_id", context.actor.shopId)
        .in("status", [
          "awaiting",
          "planned",
          "queued",
          "active",
          "in_progress",
        ])
        .order("created_at", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as AssignmentWorkOrderRow[];
      workOrders.push(...page);
      if (page.length < pageSize) break;
    }

    const lines: AssignmentLineRow[] = [];
    const workOrderIds = workOrders.map((row) => row.id);
    // Bound each PostgREST URL and page every matching line. Ranking only a
    // partial work-order or line set can recommend a lower-priority job while
    // urgent work remains outside the arbitrary cap.
    for (
      let chunkStart = 0;
      chunkStart < workOrderIds.length;
      chunkStart += 100
    ) {
      const workOrderChunk = workOrderIds.slice(chunkStart, chunkStart + 100);
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await context.actor.supabase
          .from("work_order_lines")
          .select(
            "id, work_order_id, description, labor_time, assigned_tech_id, line_status, status, priority, job_priority",
          )
          .eq("shop_id", context.actor.shopId)
          .eq("line_type", "job")
          .is("voided_at", null)
          .in("work_order_id", workOrderChunk)
          .order("work_order_id", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as AssignmentLineRow[];
        lines.push(...page);
        if (page.length < pageSize) break;
      }
    }

    const linesByWorkOrder = new Map<string, AssignmentLineRow[]>();
    for (const line of lines) {
      const existing = linesByWorkOrder.get(line.work_order_id);
      if (existing) existing.push(line);
      else linesByWorkOrder.set(line.work_order_id, [line]);
    }

    const load = await getTechnicianLoadMetricsWithClient(
      context.actor.supabase,
      context.actor.shopId,
    );
    const availableTechnicians = load.rows
      .filter((row) => row.shiftSecondsToday > 0)
      .sort(
        (left, right) =>
          left.currentActiveJobs - right.currentActiveJobs ||
          left.utilizationPct - right.utilizationPct ||
          left.name.localeCompare(right.name),
      );
    const projectedJobs = new Map(
      availableTechnicians.map((technician) => [
        technician.techId,
        technician.currentActiveJobs,
      ]),
    );
    const rows = workOrders
      .map((workOrder) => {
        const eligibleLines = (linesByWorkOrder.get(workOrder.id) ?? []).filter(
          (line) => {
            if (line.assigned_tech_id) return false;
            const status =
              normalizedStatus(line.line_status) ||
              normalizedStatus(line.status);
            return !TERMINAL_ASSIGNMENT_STATUSES.has(status);
          },
        );
        if (eligibleLines.length === 0) return null;
        const age = ageHours(workOrder.updated_at ?? workOrder.created_at) ?? 0;
        const linePriority = Math.max(
          ...eligibleLines.map((line) =>
            Number(
              line.priority ??
                (/urgent|critical/i.test(line.job_priority ?? "") ? 10 : 0),
            ),
          ),
        );
        return {
          workOrder,
          eligibleLines,
          age,
          score:
            Number(workOrder.priority ?? 0) * 100 +
            linePriority * 25 +
            (workOrder.is_waiter ? 250 : 0) +
            Math.min(age, 240),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((left, right) => right.score - left.score || right.age - left.age)
      .slice(0, input.limit);

    const recommendations = rows.map((row) => {
      const technician = [...availableTechnicians].sort(
        (left, right) =>
          Number(projectedJobs.get(left.techId) ?? 0) -
            Number(projectedJobs.get(right.techId) ?? 0) ||
          left.utilizationPct - right.utilizationPct,
      )[0];
      if (technician) {
        projectedJobs.set(
          technician.techId,
          Number(projectedJobs.get(technician.techId) ?? 0) + 1,
        );
      }
      const estimatedHours = row.eligibleLines.reduce(
        (sum, line) => sum + Math.max(0, Number(line.labor_time ?? 0)),
        0,
      );
      return {
        workOrderId: row.workOrder.id,
        customId: row.workOrder.custom_id ?? null,
        status: row.workOrder.status ?? null,
        priority:
          row.workOrder.priority == null
            ? null
            : Number(row.workOrder.priority),
        ageHours: Math.round(row.age * 10) / 10,
        primaryJob: row.eligibleLines[0]?.description?.trim() || null,
        unassignedJobs: row.eligibleLines.length,
        estimatedHours,
        recommendedTechnicianId: technician?.techId ?? null,
        recommendedTechnicianName: technician?.name ?? null,
        reason: technician
          ? `${row.workOrder.is_waiter ? "Waiter priority; " : ""}${row.eligibleLines.length} unassigned job(s), ${Math.round(row.age)} hours in the current state; ${technician.name} has the lowest projected active load.`
          : `${row.eligibleLines.length} unassigned job(s) need review, but no on-shift technician capacity was found.`,
        href: `/work-orders/${row.workOrder.id}`,
      };
    });

    return {
      ok: true as const,
      recommendations,
      summary: `${recommendations.length} queued work order(s) were ranked against current on-shift capacity. No assignments were changed.`,
      href: "/work-orders",
    };
  },
});

export const assignWorkOrderTool = defineShopAssistantTool({
  name: "assign_work_order",
  domain: "workforce",
  description:
    "Assign all eligible job lines on one work order to a same-shop technician.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canAssignWork",
  confirmation: "required",
  inputSchema: z.object({
    workOrderId: z.string().uuid(),
    technicianId: z.string().uuid(),
    onlyUnassigned: z.boolean().default(true),
  }),
  outputSchema: AssignmentResultSchema,
  async preview(input, context) {
    const admin = createAdminSupabase();
    const [
      { data: workOrder, error: workOrderError },
      { data: technician, error: technicianError },
    ] = await Promise.all([
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
    if (!workOrder) {
      throw new ShopAssistantHttpError(
        404,
        "Work order not found in this shop.",
      );
    }
    if (!technician) {
      throw new ShopAssistantHttpError(
        404,
        "Technician not found in this shop.",
      );
    }
    if (!isAssignableTechnicianRole(technician.role)) {
      throw new ShopAssistantHttpError(
        400,
        "Selected profile is not assignable as a technician.",
      );
    }

    const eligibleLines: Array<{ id: string; updated_at: string | null }> = [];
    for (let from = 0; ; from += 500) {
      let lineQuery = admin
        .from("work_order_lines")
        .select("id, updated_at, status, line_status, assigned_tech_id")
        .eq("shop_id", context.actor.shopId)
        .eq("work_order_id", workOrder.id)
        .is("voided_at", null)
        .or("line_type.is.null,line_type.eq.job")
        .order("id", { ascending: true })
        .range(from, from + 499);
      if (input.onlyUnassigned) {
        lineQuery = lineQuery.is("assigned_tech_id", null);
      }
      const { data: page, error: lineError } = await lineQuery;
      if (lineError) throw new Error(lineError.message);
      for (const line of page ?? []) {
        if (
          TERMINAL_ASSIGNMENT_STATUSES.has(normalizedStatus(line.status)) ||
          TERMINAL_ASSIGNMENT_STATUSES.has(normalizedStatus(line.line_status))
        ) {
          continue;
        }
        eligibleLines.push({ id: line.id, updated_at: line.updated_at });
      }
      if ((page ?? []).length < 500) break;
    }
    if (eligibleLines.length === 0) {
      throw new ShopAssistantHttpError(
        409,
        "This work order has no eligible job lines to assign.",
      );
    }

    const label = workOrder.custom_id
      ? `WO #${workOrder.custom_id}`
      : `WO ${workOrder.id.slice(0, 8)}`;
    return {
      title: `Assign ${label} to ${technician.full_name ?? "technician"}`,
      summary: `${eligibleLines.length} job line(s) will be assigned to ${technician.full_name ?? "the selected technician"}.`,
      consequences: [
        input.onlyUnassigned
          ? "Existing technician assignments will remain unchanged."
          : "Existing primary technician assignments may be replaced.",
        "Primary assignments and technician bridge records will be committed atomically.",
      ],
      targetVersions: Object.fromEntries([
        [
          `work_order:${workOrder.id}`,
          workOrder.updated_at ?? "missing",
        ] as const,
        [
          `work_order_line_count:${workOrder.id}`,
          String(eligibleLines.length),
        ] as const,
        ...eligibleLines.map(
          (line) =>
            [
              `work_order_line:${line.id}`,
              line.updated_at ?? "missing",
            ] as const,
        ),
      ]),
      metadata: {
        workOrderId: workOrder.id,
        technicianId: technician.id,
        technicianName: technician.full_name,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for atomic work assignment.");
    }

    const data = await runShopAssistantCommandRpc(
      "shop_assistant_assign_work_order_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_work_order_id: input.workOrderId,
        p_technician_id: input.technicianId,
        p_actor_user_id: context.actor.userId,
        p_only_unassigned: input.onlyUnassigned,
      },
    );
    return AssignmentResultSchema.parse(data);
  },
});
