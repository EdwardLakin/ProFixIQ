import "server-only";

import { syncAssistantNotifications } from "@/features/agent/server/syncAssistantNotifications";
import type { PersistedAssistantNotification } from "@/features/agent/server/syncAssistantNotifications";
import type { ActorCapabilities } from "@/features/shared/lib/rbac";
import { getTechnicianLoadMetricsWithClient } from "@/features/shared/lib/stats/getTechnicianLoadMetricsCore";
import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import type {
  ShopAssistantAlert,
  ShopAssistantState,
  ShopAssistantSuggestion,
} from "./types";

const ACTIVE_WORK_ORDER_STATUSES = [
  "awaiting",
  "awaiting_approval",
  "planned",
  "queued",
  "in_progress",
  "on_hold",
];

const READY_TO_INVOICE_STATUSES = ["completed", "ready_to_invoice"];

const FINANCIAL_ALERT_CODES = new Set([
  "optimization_pricing_normalization",
  "optimization_missed_revenue",
]);

const BILLING_ALERT_CODES = new Set(["invoice_unsent_too_long"]);

function startOfUtcDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function endOfUtcDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

function mapNotificationCode(code: string): string {
  if (code === "parts_waiting_too_long") return "parts_delivery_overdue";
  if (code === "tech_underutilized_capacity") return "technician_idle";
  if (code === "invoice_unsent_too_long") return "invoice_ready";
  return code;
}

function notificationVisibleToActor(
  item: PersistedAssistantNotification,
  capabilities: ActorCapabilities,
): boolean {
  if (FINANCIAL_ALERT_CODES.has(item.code)) {
    return capabilities.canViewFinancials;
  }
  if (BILLING_ALERT_CODES.has(item.code)) {
    return capabilities.canManageBilling;
  }
  return true;
}

function notificationHref(
  item: PersistedAssistantNotification,
): string | undefined {
  if (item.code === "invoice_unsent_too_long") return "/billing";
  return item.href ?? undefined;
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
    href: notificationHref(item),
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

function countUniqueAlerts(alerts: ShopAssistantAlert[], codes: string[]): number {
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
      prompt: "Show the overdue approvals and the best customer follow-up order.",
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
      prompt: "Which queued jobs should be assigned to the available technicians?",
      href: "/dashboard",
    },
  );

  addSuggestion(
    suggestions,
    capabilities.canManageBilling && params.readyToInvoice > 0,
    {
      id: "finish-ready-invoices",
      domain: "invoices",
      title: "Finish ready invoices",
      description: `${params.readyToInvoice} work order(s) are completed or ready to invoice.`,
      prompt: "List the work orders ready to invoice and any remaining blockers.",
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
      prompt: "Prioritize the stalled work orders and recommend the next operational step for each.",
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
      description: "Ask for a concise operational summary across the records you can access.",
      prompt: "Give me the current shop status and the three most useful next steps.",
      href: "/assistant",
    });
  }

  return suggestions.slice(0, 6);
}

export async function buildShopState(
  actor: ShopAssistantActor,
): Promise<ShopAssistantState> {
  const now = new Date();

  const [persistedNotifications, loadMetrics] = await Promise.all([
    syncAssistantNotifications({
      shopId: actor.shopId,
      userId: actor.userId,
      role: actor.role,
    }).catch(() => [] as PersistedAssistantNotification[]),
    getTechnicianLoadMetricsWithClient(actor.supabase, actor.shopId).catch(
      () => null,
    ),
  ]);

  const dayStartIso = loadMetrics?.dayStartIso ?? startOfUtcDay(now);
  const dayEndIso = loadMetrics?.dayEndIso ?? endOfUtcDay(now);

  const [openResult, readyResult, bookingsResult] = await Promise.all([
    actor.supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .in("status", ACTIVE_WORK_ORDER_STATUSES),
    actor.supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .in("status", READY_TO_INVOICE_STATUSES),
    actor.supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .gte("starts_at", dayStartIso)
      .lt("starts_at", dayEndIso),
  ]);

  const idleTechnicians = (loadMetrics?.rows ?? []).filter(
    (row) =>
      row.shiftSecondsToday > 0 &&
      row.currentActiveJobs === 0 &&
      row.utilizationPct <= 40,
  );

  const mappedNotifications = persistedNotifications
    .filter((item) => notificationVisibleToActor(item, actor.capabilities))
    .map(mapNotification);
  const syntheticAlerts: ShopAssistantAlert[] = [];

  for (const row of idleTechnicians.slice(0, 4)) {
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
  if (readyToInvoice > 0 && actor.capabilities.canManageBilling) {
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
    headline: buildHeadline({
      role: actor.canonicalRole,
      openWorkOrders,
      alertCount: alerts.length,
      readyToInvoice,
      idleTechnicians: idleTechnicians.length,
    }),
    metrics,
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
