import "server-only";

import { listTechnicianWorkCandidates } from "@/features/copilot/technician/server/assignedWork";
import { syncAssistantNotifications } from "@/features/agent/server/syncAssistantNotifications";
import type { PersistedAssistantNotification } from "@/features/agent/server/syncAssistantNotifications";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import type { ActorCapabilities } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getTechnicianLoadMetricsWithClient } from "@/features/shared/lib/stats/getTechnicianLoadMetricsCore";
import { getShopDayRange } from "@/features/shared/lib/utils/shopDayWindow";
import { ACTIVE_WORK_ORDER_STATUSES } from "@/features/work-orders/lib/work-order-status";
import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import type {
  ShopAssistantAlert,
  ShopAssistantMetrics,
  ShopAssistantState,
  ShopAssistantSuggestion,
} from "./types";

const READY_TO_INVOICE_STATUSES = ["completed", "ready_to_invoice"];

const EMPTY_METRICS = {
  openWorkOrders: 0,
  stalledWorkOrders: 0,
  overdueApprovals: 0,
  delayedParts: 0,
  idleTechnicians: 0,
  readyToInvoice: 0,
  todaysBookings: 0,
  shopUtilizationPct: 0,
};

type StateVisibility = {
  workOrders: boolean;
  approvals: boolean;
  parts: boolean;
  workforce: boolean;
  invoices: boolean;
  bookings: boolean;
};

function stateVisibility(actor: ShopAssistantActor): StateVisibility {
  const capabilities = actor.capabilities;
  return {
    workOrders:
      capabilities.canViewShopWideData ||
      capabilities.canManageWorkOrders ||
      capabilities.canAssignWork,
    approvals: capabilities.canAuthorizeQuotes,
    parts: capabilities.canManageParts,
    workforce: capabilities.canAssignWork || capabilities.canManageWorkforce,
    invoices: ["owner", "admin", "manager", "advisor", "service"].includes(
      actor.canonicalRole,
    ),
    bookings: capabilities.canManageScheduling,
  };
}

function visibleMetricKeys(
  visibility: StateVisibility,
): Array<keyof ShopAssistantMetrics> {
  const keys: Array<keyof ShopAssistantMetrics> = [];
  if (visibility.workOrders) {
    keys.push("openWorkOrders", "stalledWorkOrders");
  }
  if (visibility.approvals) keys.push("overdueApprovals");
  if (visibility.parts) keys.push("delayedParts");
  if (visibility.workforce) {
    keys.push("idleTechnicians", "shopUtilizationPct");
  }
  if (visibility.invoices) keys.push("readyToInvoice");
  if (visibility.bookings) keys.push("todaysBookings");
  return keys;
}

function canViewAlert(
  alert: ShopAssistantAlert,
  visibility: StateVisibility,
): boolean {
  if (alert.code === "approval_waiting" || alert.code === "quote_waiting") {
    return visibility.approvals;
  }
  if (alert.code === "parts_delivery_overdue") {
    return visibility.parts || visibility.workOrders;
  }
  if (alert.code === "invoice_ready") return visibility.invoices;
  if (
    alert.code.startsWith("tech_") ||
    alert.code === "shop_overloaded" ||
    alert.code === "shop_throughput_below_capacity"
  ) {
    return visibility.workforce;
  }
  if (alert.code.startsWith("optimization_")) {
    return visibility.invoices || visibility.workforce;
  }
  return visibility.workOrders;
}

async function buildMechanicState(
  actor: ShopAssistantActor,
): Promise<ShopAssistantState> {
  const assigned = await listTechnicianWorkCandidates({
    supabase: createAdminSupabase(),
    shopId: actor.shopId,
    technicianIds: [actor.userId, actor.profileId],
  });
  const heldLines = assigned.flatMap((workOrder) =>
    workOrder.lines
      .filter((line) => line.status === "on_hold")
      .map((line) => ({ workOrder, line })),
  );
  const alerts: ShopAssistantAlert[] = heldLines
    .slice(0, 8)
    .map(({ workOrder, line }) => ({
      id: `assigned-hold:${line.id}`,
      code: "assigned_job_on_hold",
      level: "warning",
      title: `${workOrder.customId ? `WO #${workOrder.customId}` : "Assigned work"} is on hold`,
      message:
        line.holdReason?.trim() || "Review the assigned job's hold reason.",
      href: `/work-orders/${workOrder.id}`,
      entityType: "work_order_line",
      entityId: line.id,
    }));
  const lineCount = assigned.reduce(
    (sum, workOrder) => sum + workOrder.lines.length,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    role: actor.canonicalRole,
    scopeLabel: "assigned work only",
    headline: `${lineCount} active job line(s) are assigned to you across ${assigned.length} work order(s).`,
    metrics: {
      ...EMPTY_METRICS,
      openWorkOrders: assigned.length,
      stalledWorkOrders: heldLines.length,
    },
    visibleMetricKeys: ["openWorkOrders", "stalledWorkOrders"],
    alerts,
    suggestions: [
      {
        id: "mechanic-assigned-work",
        domain: "technician",
        title: "Review my assigned work",
        description:
          "See only the active job lines canonically assigned to you.",
        prompt: "Show my assigned work and tell me what is next.",
        href: "/mobile",
      },
      ...(heldLines.length > 0
        ? [
            {
              id: "mechanic-held-work",
              domain: "technician" as const,
              title: "Review held assigned jobs",
              description: `${heldLines.length} assigned job line(s) are on hold.`,
              prompt: "Which of my assigned jobs are on hold and why?",
              href: "/mobile",
            },
          ]
        : []),
    ],
  };
}

async function buildFleetState(
  actor: ShopAssistantActor,
): Promise<ShopAssistantState> {
  const fleetActor = await resolveFleetActorContext(createAdminSupabase(), {
    userId: actor.userId,
    profileId: actor.profileId,
  });
  const fleetIds = fleetActor.fleetIds;
  if (fleetActor.shopId !== actor.shopId || fleetIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      role: actor.canonicalRole,
      scopeLabel: "fleet operations",
      headline: "No entitled fleet workspace is available to this account.",
      metrics: { ...EMPTY_METRICS },
      visibleMetricKeys: [],
      alerts: [],
      suggestions: [],
    };
  }

  const admin = createAdminSupabase();
  const [
    { count: openRequestCount, error: openRequestCountError },
    { count: urgentRequestCount, error: urgentRequestCountError },
    { data: urgentRequests, error: urgentRequestError },
    { count: unitCount, error: unitError },
  ] = await Promise.all([
    admin
      .from("fleet_service_requests")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .in("fleet_id", fleetIds)
      .not("status", "in", "(completed,cancelled,canceled,closed)"),
    admin
      .from("fleet_service_requests")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .in("fleet_id", fleetIds)
      .not("status", "in", "(completed,cancelled,canceled,closed)")
      .in("severity", ["safety", "compliance"]),
    admin
      .from("fleet_service_requests")
      .select("id, title, severity, status, vehicle_id, created_at")
      .eq("shop_id", actor.shopId)
      .in("fleet_id", fleetIds)
      .not("status", "in", "(completed,cancelled,canceled,closed)")
      .in("severity", ["safety", "compliance"])
      .order("created_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(8),
    admin
      .from("fleet_vehicles")
      .select("vehicle_id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .in("fleet_id", fleetIds)
      .or("active.is.null,active.eq.true"),
  ]);
  if (openRequestCountError) throw new Error(openRequestCountError.message);
  if (urgentRequestCountError) throw new Error(urgentRequestCountError.message);
  if (urgentRequestError) throw new Error(urgentRequestError.message);
  if (unitError) throw new Error(unitError.message);
  const openCount = openRequestCount ?? 0;
  const urgentCount = urgentRequestCount ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    role: actor.canonicalRole,
    scopeLabel: "entitled fleet operations",
    headline: `${openCount} open service request(s) across ${unitCount ?? 0} accessible fleet unit(s).`,
    metrics: {
      ...EMPTY_METRICS,
      openWorkOrders: openCount,
      stalledWorkOrders: urgentCount,
    },
    visibleMetricKeys: ["openWorkOrders", "stalledWorkOrders"],
    alerts: (urgentRequests ?? []).map((request) => ({
      id: `fleet-request:${request.id}`,
      code: "fleet_service_request_urgent",
      level: "warning",
      title: request.title,
      message: `${request.severity ?? "urgent"} • ${request.status}`,
      href: "/fleet/service-requests",
      entityType: "fleet_service_request",
      entityId: request.id,
    })),
    suggestions: [
      {
        id: "fleet-open-requests",
        domain: "fleet",
        title: "Review fleet service requests",
        description: `${openCount} open request(s) are in your fleet scope.`,
        prompt:
          "Show my fleet service requests and prioritize what needs attention.",
        href: "/fleet/service-requests",
      },
      {
        id: "fleet-units",
        domain: "fleet",
        title: "Review fleet units",
        description: `${unitCount ?? 0} unit(s) are accessible to this account.`,
        prompt: "List my fleet units.",
        href: "/fleet/units",
      },
    ],
  };
}

function mapNotificationCode(code: string): string {
  if (code === "parts_waiting_too_long") return "parts_delivery_overdue";
  if (code === "tech_underutilized_capacity") return "technician_idle";
  if (code === "invoice_unsent_too_long") return "invoice_ready";
  return code;
}

function mapNotification(
  item: PersistedAssistantNotification,
): ShopAssistantAlert {
  return {
    id: item.id,
    code: mapNotificationCode(item.code),
    level:
      item.level === "critical"
        ? "critical"
        : item.level === "warning"
          ? "warning"
          : "info",
    title: item.title,
    message: item.message,
    href: item.href ?? undefined,
    entityType: item.entity_type ?? undefined,
    entityId: item.entity_id ?? undefined,
  };
}

function dedupeAlerts(alerts: ShopAssistantAlert[], limit = 12) {
  const seen = new Set<string>();
  const output: ShopAssistantAlert[] = [];

  for (const alert of alerts) {
    const key = [
      alert.code,
      alert.entityType ?? "none",
      alert.entityId ?? alert.title,
    ]
      .join(":")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(alert);
    if (output.length >= limit) break;
  }

  return output;
}

function countUniqueAlerts(
  alerts: ShopAssistantAlert[],
  codes: string[],
): number {
  const keys = new Set<string>();
  for (const alert of alerts) {
    if (!codes.includes(alert.code)) continue;
    keys.add(alert.entityId ?? `${alert.code}:${alert.title}`);
  }
  return keys.size;
}

function buildHeadline(params: {
  role: ShopAssistantActor["canonicalRole"];
  openWorkOrders: number;
  alertCount: number;
  readyToInvoice: number;
  idleTechnicians: number;
}): string {
  const { role, openWorkOrders, alertCount, readyToInvoice, idleTechnicians } =
    params;

  if (role === "parts") {
    return alertCount > 0
      ? `${alertCount} parts and workflow signals need review.`
      : "Parts flow is current across the shop.";
  }
  if (role === "advisor" || role === "service") {
    return `${openWorkOrders} open work orders and ${readyToInvoice} ready billing opportunities are in view.`;
  }
  if (role === "lead_hand" || role === "foreman") {
    return `${openWorkOrders} open work orders with ${idleTechnicians} technician(s) currently available.`;
  }
  if (role === "fleet_manager" || role === "dispatcher") {
    return `${openWorkOrders} active shop work orders are visible with ${alertCount} operational signals.`;
  }
  return alertCount > 0
    ? `${alertCount} shop signals need attention across ${openWorkOrders} open work orders.`
    : `The shop is current across ${openWorkOrders} open work orders.`;
}

function addSuggestion(
  output: ShopAssistantSuggestion[],
  condition: boolean,
  suggestion: ShopAssistantSuggestion,
) {
  if (condition && !output.some((item) => item.id === suggestion.id)) {
    output.push(suggestion);
  }
}

function buildSuggestions(params: {
  capabilities: ActorCapabilities;
  overdueApprovals: number;
  delayedParts: number;
  idleTechnicians: number;
  readyToInvoice: number;
  stalledWorkOrders: number;
  todaysBookings: number;
}): ShopAssistantSuggestion[] {
  const { capabilities } = params;
  const suggestions: ShopAssistantSuggestion[] = [];

  addSuggestion(
    suggestions,
    capabilities.canAuthorizeQuotes && params.overdueApprovals > 0,
    {
      id: "review-overdue-approvals",
      domain: "work_orders",
      title: "Clear overdue approvals",
      description: `${params.overdueApprovals} approval(s) are holding up work.`,
      prompt:
        "Show the overdue approvals and the best customer follow-up order.",
      href: "/quote-review",
    },
  );

  addSuggestion(
    suggestions,
    capabilities.canManageParts && params.delayedParts > 0,
    {
      id: "review-delayed-parts",
      domain: "inventory",
      title: "Review delayed parts",
      description: `${params.delayedParts} job(s) have delayed parts signals.`,
      prompt: "Show delayed parts and the affected work orders.",
      href: "/parts/requests",
    },
  );

  addSuggestion(
    suggestions,
    capabilities.canAssignWork && params.idleTechnicians > 0,
    {
      id: "rebalance-idle-capacity",
      domain: "workforce",
      title: "Use available technician capacity",
      description: `${params.idleTechnicians} shifted technician(s) have no active job.`,
      prompt:
        "Which queued jobs should be assigned to the available technicians?",
      href: "/dashboard",
    },
  );

  addSuggestion(
    suggestions,
    capabilities.canManageWorkOrders &&
      capabilities.canAuthorizeQuotes &&
      params.readyToInvoice > 0,
    {
      id: "finish-ready-invoices",
      domain: "invoices",
      title: "Finish ready invoices",
      description: `${params.readyToInvoice} work order(s) are completed or ready to invoice.`,
      prompt:
        "List the work orders ready to invoice and any remaining blockers.",
      href: "/billing",
    },
  );

  addSuggestion(
    suggestions,
    capabilities.canManageWorkOrders && params.stalledWorkOrders > 0,
    {
      id: "unstick-stalled-work",
      domain: "work_orders",
      title: "Unstick stalled work",
      description: `${params.stalledWorkOrders} work order(s) have exceeded a workflow threshold.`,
      prompt:
        "Prioritize the stalled work orders and recommend the next operational step for each.",
      href: "/work-orders/view",
    },
  );

  addSuggestion(
    suggestions,
    capabilities.canManageScheduling && params.todaysBookings > 0,
    {
      id: "review-todays-bookings",
      domain: "scheduling",
      title: "Review today’s appointments",
      description: `${params.todaysBookings} appointment(s) are scheduled for the current shop day.`,
      prompt: "Summarize today's appointments and flag scheduling conflicts.",
      href: "/dashboard/appointments",
    },
  );

  if (suggestions.length === 0) {
    suggestions.push({
      id: "shop-status-check",
      domain: "reporting",
      title: "Review the current shop status",
      description:
        "Ask for a concise operational summary across the records you can access.",
      prompt:
        "Give me the current shop status and the three most useful next steps.",
      href: "/assistant",
    });
  }

  return suggestions.slice(0, 6);
}

export async function buildShopState(
  actor: ShopAssistantActor,
): Promise<ShopAssistantState> {
  if (actor.canonicalRole === "mechanic") {
    return buildMechanicState(actor);
  }
  if (
    actor.canonicalRole === "fleet_manager" ||
    actor.canonicalRole === "dispatcher"
  ) {
    return buildFleetState(actor);
  }

  const now = new Date();
  const visibility = stateVisibility(actor);

  const [persistedNotifications, loadMetrics, shopResult] = await Promise.all([
    syncAssistantNotifications({
      shopId: actor.shopId,
      userId: actor.userId,
      role: actor.role,
    }).catch(() => [] as PersistedAssistantNotification[]),
    visibility.workforce
      ? getTechnicianLoadMetricsWithClient(actor.supabase, actor.shopId).catch(
          () => null,
        )
      : Promise.resolve(null),
    visibility.bookings
      ? actor.supabase
          .from("shops")
          .select("timezone")
          .eq("id", actor.shopId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const shopDay = getShopDayRange(
    shopResult.data?.timezone?.trim() || "UTC",
    now,
  );
  const dayStartIso = loadMetrics?.dayStartIso ?? shopDay.start;
  const dayEndIso = loadMetrics?.dayEndIso ?? shopDay.end;

  const [openResult, readyResult, bookingsResult] = await Promise.all([
    visibility.workOrders
      ? actor.supabase
          .from("work_orders")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", actor.shopId)
          .eq("record_type", "work_order")
          .in("status", [...ACTIVE_WORK_ORDER_STATUSES])
      : Promise.resolve({ count: 0, error: null }),
    visibility.invoices
      ? actor.supabase
          .from("work_orders")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", actor.shopId)
          .in("status", READY_TO_INVOICE_STATUSES)
      : Promise.resolve({ count: 0, error: null }),
    visibility.bookings
      ? actor.supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", actor.shopId)
          .gte("starts_at", dayStartIso)
          .lt("starts_at", dayEndIso)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  const idleTechnicians = (loadMetrics?.rows ?? []).filter(
    (row) =>
      row.shiftSecondsToday > 0 &&
      row.currentActiveJobs === 0 &&
      row.utilizationPct <= 40,
  );

  const mappedNotifications = persistedNotifications
    .map(mapNotification)
    .filter((alert) => canViewAlert(alert, visibility));
  const syntheticAlerts: ShopAssistantAlert[] = [];

  for (const row of visibility.workforce ? idleTechnicians.slice(0, 4) : []) {
    syntheticAlerts.push({
      id: `technician-idle:${row.techId}`,
      code: "technician_idle",
      level: "info",
      title: `${row.name} has available capacity`,
      message: `${row.name} is on shift with no active job and ${row.utilizationPct}% utilization.`,
      href: "/dashboard",
      entityType: "profile",
      entityId: row.techId,
    });
  }

  const readyToInvoice = readyResult.error ? 0 : Number(readyResult.count ?? 0);
  if (visibility.invoices && readyToInvoice > 0) {
    syntheticAlerts.push({
      id: "invoice-ready:shop",
      code: "invoice_ready",
      level: "warning",
      title: "Work is ready for billing",
      message: `${readyToInvoice} completed or ready work order(s) should be reviewed for invoicing.`,
      href: "/billing",
      entityType: "shop",
      entityId: actor.shopId,
    });
  }

  const alerts = dedupeAlerts([...mappedNotifications, ...syntheticAlerts]);
  const stalledWorkOrders = countUniqueAlerts(alerts, [
    "work_order_waiting_too_long",
    "work_order_on_hold_too_long",
    "active_job_running_too_long",
  ]);
  const overdueApprovals = countUniqueAlerts(alerts, ["approval_waiting"]);
  const delayedParts = countUniqueAlerts(alerts, ["parts_delivery_overdue"]);
  const todaysBookings = bookingsResult.error
    ? 0
    : Number(bookingsResult.count ?? 0);
  const openWorkOrders = openResult.error ? 0 : Number(openResult.count ?? 0);

  const metrics = {
    openWorkOrders,
    stalledWorkOrders,
    overdueApprovals,
    delayedParts,
    idleTechnicians: idleTechnicians.length,
    readyToInvoice,
    todaysBookings,
    shopUtilizationPct: loadMetrics?.summary.shopUtilizationPct ?? 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    role: actor.canonicalRole,
    scopeLabel: `${actor.canonicalRole.replaceAll("_", " ")} operations`,
    headline: buildHeadline({
      role: actor.canonicalRole,
      openWorkOrders,
      alertCount: alerts.length,
      readyToInvoice,
      idleTechnicians: idleTechnicians.length,
    }),
    metrics,
    visibleMetricKeys: visibleMetricKeys(visibility),
    alerts,
    suggestions: buildSuggestions({
      capabilities: actor.capabilities,
      overdueApprovals,
      delayedParts,
      idleTechnicians: idleTechnicians.length,
      readyToInvoice,
      stalledWorkOrders,
      todaysBookings,
    }),
  };
}
