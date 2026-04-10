import { getServerSupabase } from "./supabase";
import { FLOW_HEALTH_THRESHOLDS, ageHours } from "./flowHealth";
import { getTechnicianLoadMetricsWithClient } from "@shared/lib/stats/getTechnicianLoadMetricsCore";
import { buildOptimizationOpportunities } from "@/features/optimization/server/buildOptimizationOpportunities";
import type { OptimizationOpportunity } from "@/features/optimization/types";

export type OpsNotificationLevel = "info" | "warning" | "urgent";

export type OpsNotificationCode =
  | "quote_waiting"
  | "approval_waiting"
  | "work_order_on_hold_too_long"
  | "work_order_waiting_too_long"
  | "parts_waiting_too_long"
  | "invoice_unsent_too_long"
  | "tech_overloaded"
  | "shop_overloaded"
  | "tech_underutilized_capacity"
  | "active_job_running_too_long"
  | "shop_throughput_below_capacity"
  | "optimization_pricing_normalization"
  | "optimization_inspection_coverage_gap"
  | "optimization_missed_revenue"
  | "optimization_review_queued_suggestions";

export type OpsNotification = {
  level: OpsNotificationLevel;
  code: OpsNotificationCode;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  createdAt?: string;
};

type WorkOrderRow = {
  id: string;
  custom_id: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type WorkOrderLineRow = {
  id: string;
  work_order_id: string | null;
  status: string | null;
  description: string | null;
  complaint: string | null;
  hold_reason: string | null;
  on_hold_since: string | null;
  updated_at: string | null;
};

type BoardRow = {
  work_order_id: string;
  custom_id: string | null;
  display_name: string | null;
  overall_stage: string | null;
  time_in_stage_seconds: number | null;
};

type PortalInvoiceRow = {
  work_order_id: string | null;
  status: string | null;
  invoice_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const SHOP_OVERLOAD_UTILIZATION_PCT = 90;
const SHOP_UNDERUTILIZATION_PCT = 40;
const TECH_OVERLOAD_UTILIZATION_PCT = 95;
const TECH_OVERLOAD_ACTIVE_JOBS = 3;
const LOW_THROUGHPUT_MIN_ELAPSED_HOURS = 6;
const LOW_THROUGHPUT_MIN_SHIFTED_TECHS = 2;
const LOW_THROUGHPUT_MAX_COMPLETIONS_PER_TECH = 0.5;

function secondsToHours(seconds: number | null | undefined): number {
  const parsed = Number(seconds ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed / 3600;
}

function woLabel(customId: string | null, id: string): string {
  return customId ? `WO #${customId}` : `WO ${id.slice(0, 8)}`;
}

function isInvoiceReadyToSend(status: string | null | undefined): boolean {
  const normalized = String(status ?? "")
    .toLowerCase()
    .replaceAll(" ", "_");

  return (
    normalized === "ready_to_invoice" ||
    normalized === "completed" ||
    normalized === "invoiced"
  );
}

function optimizationHref(opportunity: OptimizationOpportunity): string {
  if (opportunity.type === "pricing_normalization") {
    return opportunity.targetRefs?.menuItemId
      ? `/menu/item/${opportunity.targetRefs.menuItemId}`
      : "/dashboard";
  }
  if (opportunity.type === "inspection_coverage_gap") {
    return opportunity.targetRefs?.inspectionTemplateId
      ? `/inspections/templates?templateId=${encodeURIComponent(opportunity.targetRefs.inspectionTemplateId)}`
      : "/inspection_template_suggestions";
  }
  return "/menu_item_suggestions";
}

function toOptimizationCode(
  type: OptimizationOpportunity["type"],
): OpsNotificationCode {
  if (type === "pricing_normalization") {
    return "optimization_pricing_normalization";
  }
  if (type === "inspection_coverage_gap") {
    return "optimization_inspection_coverage_gap";
  }
  return "optimization_missed_revenue";
}

export async function getOpsNotifications(
  shopId: string,
): Promise<OpsNotification[]> {
  const supabase = getServerSupabase();

  const notifications: OpsNotification[] = [];

  const { data: workOrders, error: woError } = await supabase
    .from("work_orders")
    .select("id, custom_id, status, created_at, updated_at")
    .eq("shop_id", shopId)
    .in("status", [
      "awaiting",
      "awaiting_approval",
      "queued",
      "on_hold",
      "planned",
      "in_progress",
    ])
    .order("updated_at", { ascending: true })
    .limit(120);

  if (woError) {
    throw new Error(woError.message);
  }

  const { data: boardRows, error: boardError } = await supabase
    .from("v_work_order_board_cards_shop")
    .select("work_order_id, custom_id, display_name, overall_stage, time_in_stage_seconds")
    .eq("shop_id", shopId)
    .in("overall_stage", ["awaiting_approval", "waiting_parts"])
    .order("time_in_stage_seconds", { ascending: false })
    .limit(120);

  if (boardError) {
    throw new Error(boardError.message);
  }

  const { data: heldLines, error: lineError } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, status, description, complaint, hold_reason, on_hold_since, updated_at",
    )
    .eq("shop_id", shopId)
    .eq("status", "on_hold")
    .order("updated_at", { ascending: true })
    .limit(150);

  if (lineError) {
    throw new Error(lineError.message);
  }

  const { data: portalInvoices, error: invoiceError } = await supabase
    .from("v_portal_invoices")
    .select("work_order_id, status, invoice_sent_at, created_at, updated_at")
    .eq("shop_id", shopId)
    .is("invoice_sent_at", null)
    .order("updated_at", { ascending: true })
    .limit(120);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  const woRows = (workOrders ?? []) as WorkOrderRow[];
  const lineRows = (heldLines ?? []) as WorkOrderLineRow[];
  const stageRows = (boardRows ?? []) as BoardRow[];
  const unsentInvoices = (portalInvoices ?? []) as PortalInvoiceRow[];

  const workOrderById = new Map<string, WorkOrderRow>();
  for (const row of woRows) {
    workOrderById.set(row.id, row);
  }

  const seenApprovalFromBoard = new Set<string>();

  for (const row of stageRows) {
    const stage = String(row.overall_stage ?? "").toLowerCase();
    const hours = secondsToHours(row.time_in_stage_seconds);

    if (
      stage === "awaiting_approval" &&
      hours >= FLOW_HEALTH_THRESHOLDS.approvalWaitHours
    ) {
      seenApprovalFromBoard.add(row.work_order_id);
      notifications.push({
        level: "warning",
        code: "approval_waiting",
        title: "Approval waiting too long",
        message: `${woLabel(row.custom_id, row.work_order_id)} has been waiting for approval for ${hours.toFixed(1)} hours.`,
        href: `/quote-review/${row.work_order_id}`,
        entityType: "work_order",
        entityId: row.work_order_id,
      });
      continue;
    }

    if (stage === "waiting_parts" && hours >= FLOW_HEALTH_THRESHOLDS.partsWaitHours) {
      notifications.push({
        level: "warning",
        code: "parts_waiting_too_long",
        title: "Parts waiting too long",
        message: `${woLabel(row.custom_id, row.work_order_id)} has been waiting on parts for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.work_order_id}`,
        entityType: "work_order",
        entityId: row.work_order_id,
      });
    }
  }

  for (const row of woRows) {
    const hours = ageHours(row.updated_at);
    if (hours == null) continue;

    if (
      row.status === "awaiting_approval" &&
      hours >= FLOW_HEALTH_THRESHOLDS.approvalWaitHours &&
      !seenApprovalFromBoard.has(row.id)
    ) {
      notifications.push({
        level: "warning",
        code: "approval_waiting",
        title: "Approval waiting too long",
        message: `${woLabel(row.custom_id, row.id)} has been awaiting approval for ${hours.toFixed(1)} hours.`,
        href: `/quote-review/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
      continue;
    }

    if (row.status === "queued" && hours >= FLOW_HEALTH_THRESHOLDS.queuedWaitHours) {
      notifications.push({
        level: "warning",
        code: "work_order_waiting_too_long",
        title: "Queued too long",
        message: `${woLabel(row.custom_id, row.id)} has been queued for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
      continue;
    }

    if (row.status === "on_hold" && hours >= FLOW_HEALTH_THRESHOLDS.onHoldWaitHours) {
      notifications.push({
        level: "urgent",
        code: "work_order_on_hold_too_long",
        title: "Work order on hold too long",
        message: `${woLabel(row.custom_id, row.id)} has been on hold for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
    }
    if (
      row.status === "in_progress" &&
      hours >= FLOW_HEALTH_THRESHOLDS.unusuallyLongActiveJobHours
    ) {
      notifications.push({
        level: hours >= FLOW_HEALTH_THRESHOLDS.unusuallyLongActiveJobHours + 2 ? "urgent" : "warning",
        code: "active_job_running_too_long",
        title: "Unusually long active job",
        message: `${woLabel(row.custom_id, row.id)} has remained active for ${hours.toFixed(1)} hours without an update.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
    }
  }

  for (const line of lineRows) {
    const since = line.on_hold_since ?? line.updated_at;
    const hours = ageHours(since);
    if (hours == null || hours < FLOW_HEALTH_THRESHOLDS.onHoldWaitHours) continue;

    const workOrder = line.work_order_id
      ? workOrderById.get(line.work_order_id)
      : undefined;

    notifications.push({
      level: "urgent",
      code: "work_order_on_hold_too_long",
      title: "Held job line needs attention",
      message:
        `${workOrder ? woLabel(workOrder.custom_id, workOrder.id) : "Work order"}: ` +
        `${line.description ?? line.complaint ?? "Held line"} ` +
        `has been on hold for ${hours.toFixed(1)} hours` +
        `${line.hold_reason ? ` — ${line.hold_reason}` : ""}.`,
      href: line.work_order_id
        ? `/work-orders/${line.work_order_id}/focused-job/${line.id}`
        : undefined,
      entityType: "work_order_line",
      entityId: line.id,
      createdAt: since ?? undefined,
    });
  }

  for (const invoice of unsentInvoices) {
    if (!isInvoiceReadyToSend(invoice.status)) continue;

    const since = invoice.updated_at ?? invoice.created_at;
    const hours = ageHours(since);
    if (hours == null || hours < FLOW_HEALTH_THRESHOLDS.unsentInvoiceHours) continue;

    notifications.push({
      level: "warning",
      code: "invoice_unsent_too_long",
      title: "Invoice unsent too long",
      message: `A ready invoice has remained unsent for ${hours.toFixed(1)} hours.`,
      href: invoice.work_order_id
        ? `/work-orders/${invoice.work_order_id}`
        : "/portal/invoices",
      entityType: "invoice",
      entityId: invoice.work_order_id ?? undefined,
      createdAt: since ?? undefined,
    });
  }

  const loadMetrics = await getTechnicianLoadMetricsWithClient(supabase, shopId);
  const shiftedTechs = loadMetrics.rows.filter((row) => row.shiftSecondsToday > 0);
  const overloadedTechs = shiftedTechs.filter(
    (row) =>
      row.utilizationPct >= TECH_OVERLOAD_UTILIZATION_PCT ||
      row.currentActiveJobs >= TECH_OVERLOAD_ACTIVE_JOBS,
  );

  for (const row of overloadedTechs) {
    notifications.push({
      level: "warning",
      code: "tech_overloaded",
      title: "Technician overloaded",
      message: `${row.name} is at ${row.utilizationPct}% utilization with ${row.currentActiveJobs} active job(s). Rebalance upcoming work.`,
      href: "/dashboard",
      entityType: "profile",
      entityId: row.techId,
    });
  }

  if (
    loadMetrics.summary.shopUtilizationPct >= SHOP_OVERLOAD_UTILIZATION_PCT &&
    loadMetrics.summary.totalActiveJobs >= Math.max(2, loadMetrics.summary.totalTechnicians)
  ) {
    notifications.push({
      level: "urgent",
      code: "shop_overloaded",
      title: "Shop overloaded",
      message: `Shop load is ${loadMetrics.summary.shopUtilizationPct}% with ${loadMetrics.summary.totalActiveJobs} active jobs across ${loadMetrics.summary.totalTechnicians} technicians.`,
      href: "/dashboard",
      entityType: "shop",
      entityId: shopId,
    });
  }

  const underutilizedTechs = shiftedTechs.filter(
    (row) => row.currentActiveJobs === 0 && row.utilizationPct <= SHOP_UNDERUTILIZATION_PCT,
  );
  if (
    loadMetrics.summary.shopUtilizationPct <= SHOP_UNDERUTILIZATION_PCT &&
    underutilizedTechs.length > 0
  ) {
    notifications.push({
      level: "info",
      code: "tech_underutilized_capacity",
      title: "Underutilized technician capacity",
      message: `${underutilizedTechs.length} technician(s) have shift time available but no active jobs. Pull queued work forward.`,
      href: "/dashboard",
      entityType: "shop",
      entityId: shopId,
    });
  }

  const completedJobs = shiftedTechs.reduce((sum, row) => sum + row.completedJobsToday, 0);
  const elapsedHours = Math.max(
    0,
    (Date.now() - new Date(loadMetrics.dayStartIso).getTime()) / (1000 * 60 * 60),
  );
  const completedPerShiftedTech =
    shiftedTechs.length > 0 ? completedJobs / shiftedTechs.length : 0;

  if (
    elapsedHours >= LOW_THROUGHPUT_MIN_ELAPSED_HOURS &&
    shiftedTechs.length >= LOW_THROUGHPUT_MIN_SHIFTED_TECHS &&
    loadMetrics.summary.shopUtilizationPct >= 55 &&
    completedPerShiftedTech < LOW_THROUGHPUT_MAX_COMPLETIONS_PER_TECH
  ) {
    notifications.push({
      level: "warning",
      code: "shop_throughput_below_capacity",
      title: "Low throughput vs current shift capacity",
      message: `${shiftedTechs.length} shifted tech(s) have completed ${completedJobs} jobs so far (${completedPerShiftedTech.toFixed(1)} each) while utilization is ${loadMetrics.summary.shopUtilizationPct}%. Check blockers and handoffs.`,
      href: "/dashboard",
      entityType: "shop",
      entityId: shopId,
    });
  }

  try {
    const optimization = await buildOptimizationOpportunities({
      supabase,
      shopId,
      lookbackDays: 365,
      limit: 8,
    });
    const opportunities = optimization.groups.flatMap((group) => group.opportunities ?? []);
    const selected = opportunities
      .filter(
        (item) =>
          item.priorityBand === "critical" ||
          item.priorityBand === "high" ||
          (item.priorityBand === "medium" && item.confidence >= 0.72),
      )
      .slice(0, 3);

    for (const item of selected) {
      notifications.push({
        level: item.priorityBand === "critical" ? "urgent" : "warning",
        code: toOptimizationCode(item.type),
        title: item.title,
        message: item.summary,
        href: optimizationHref(item),
        entityType: "optimization_opportunity",
        entityId: item.id,
        createdAt: optimization.generatedAt,
      });
    }
  } catch (error) {
    console.warn("[ops notifications] optimization enrichment skipped", error);
  }

  const [{ count: menuSuggestionCount }, { count: inspectionSuggestionCount }] =
    await Promise.all([
      supabase
        .from("menu_item_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId),
      supabase
        .from("inspection_template_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId),
    ]);

  const totalQueuedSuggestions =
    (menuSuggestionCount ?? 0) + (inspectionSuggestionCount ?? 0);
  if (totalQueuedSuggestions > 0) {
    notifications.push({
      level: totalQueuedSuggestions >= 6 ? "warning" : "info",
      code: "optimization_review_queued_suggestions",
      title: "Queued ShopBoost suggestions need review",
      message: `${menuSuggestionCount ?? 0} service suggestions and ${inspectionSuggestionCount ?? 0} inspection suggestions are waiting for approval.`,
      href: "/menu_item_suggestions",
      entityType: "shop",
      entityId: shopId,
    });
  }

  notifications.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  return notifications;
}
