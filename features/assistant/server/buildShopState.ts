import { getOpsNotifications } from "@/features/agent/server/getOpsNotifications";
import { getServerSupabase } from "@/features/agent/server/supabase";
import { getShopDayRange } from "@shared/lib/utils/shopDayWindow";
import type {
  ShopAssistantAlert,
  ShopAssistantBaseState,
  ShopAssistantMetric,
} from "../types/shopState";

const OPEN_WORK_ORDER_STATUSES = [
  "awaiting",
  "awaiting_approval",
  "queued",
  "on_hold",
  "planned",
  "in_progress",
];

const STALLED_CODES = new Set([
  "work_order_on_hold_too_long",
  "work_order_waiting_too_long",
  "active_job_running_too_long",
]);

function normalizedInvoiceStatus(value: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

function metricTone(
  value: number,
  warningAt: number,
  criticalAt?: number,
): ShopAssistantMetric["tone"] {
  if (criticalAt !== undefined && value >= criticalAt) return "critical";
  if (value >= warningAt) return "warning";
  return value > 0 ? "info" : "neutral";
}

function uniqueEntityCount(
  alerts: ShopAssistantAlert[],
  predicate: (alert: ShopAssistantAlert) => boolean,
): number {
  const keys = new Set<string>();
  for (const alert of alerts) {
    if (!predicate(alert)) continue;
    keys.add(alert.entityId ?? `${alert.code}:${alert.message}`);
  }
  return keys.size;
}

function parseLeadingCount(message: string): number {
  const value = Number(message.match(/^\s*(\d+)/)?.[1] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dedupeAlerts(alerts: ShopAssistantAlert[]): ShopAssistantAlert[] {
  const seen = new Set<string>();
  const result: ShopAssistantAlert[] = [];

  for (const alert of alerts) {
    const key = [alert.code, alert.entityId ?? "", alert.message].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(alert);
  }

  return result;
}

export async function buildShopAssistantBaseState(
  shopId: string,
): Promise<ShopAssistantBaseState> {
  const supabase = getServerSupabase();

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("timezone")
    .eq("id", shopId)
    .maybeSingle();

  if (shopError) throw new Error(shopError.message);

  const day = getShopDayRange(shop?.timezone ?? "UTC");

  const [notifications, activeWorkOrders, bookingsToday, invoiceRows] =
    await Promise.all([
      getOpsNotifications(shopId),
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .in("status", OPEN_WORK_ORDER_STATUSES),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .gte("starts_at", day.start)
        .lt("starts_at", day.end),
      supabase
        .from("v_portal_invoices")
        .select("work_order_id, status, invoice_sent_at")
        .eq("shop_id", shopId)
        .is("invoice_sent_at", null)
        .limit(500),
    ]);

  if (activeWorkOrders.error) throw new Error(activeWorkOrders.error.message);
  if (bookingsToday.error) throw new Error(bookingsToday.error.message);
  if (invoiceRows.error) throw new Error(invoiceRows.error.message);

  const alerts = dedupeAlerts(
    notifications.map((notification, index) => ({
      id: `${notification.code}:${notification.entityId ?? index}`,
      level:
        notification.level === "urgent"
          ? ("critical" as const)
          : notification.level,
      code: notification.code,
      title: notification.title,
      message: notification.message,
      href: notification.href,
      entityType: notification.entityType,
      entityId: notification.entityId,
      createdAt: notification.createdAt,
    })),
  ).slice(0, 24);

  const stalled = uniqueEntityCount(alerts, (alert) =>
    STALLED_CODES.has(alert.code),
  );
  const approvals = uniqueEntityCount(
    alerts,
    (alert) =>
      alert.code === "approval_waiting" || alert.code === "quote_waiting",
  );
  const delayedParts = uniqueEntityCount(
    alerts,
    (alert) => alert.code === "parts_waiting_too_long",
  );
  const idleTechnicians = alerts
    .filter((alert) => alert.code === "tech_underutilized_capacity")
    .reduce(
      (maximum, alert) => Math.max(maximum, parseLeadingCount(alert.message)),
      0,
    );
  const readyToInvoice = (invoiceRows.data ?? []).filter((row) =>
    ["ready_to_invoice", "completed", "invoiced"].includes(
      normalizedInvoiceStatus(row.status),
    ),
  ).length;

  const metrics: ShopAssistantMetric[] = [
    {
      key: "active_work_orders",
      label: "Active work orders",
      value: activeWorkOrders.count ?? 0,
      tone: "info",
      href: "/work-orders",
    },
    {
      key: "stalled_work_orders",
      label: "Stalled work orders",
      value: stalled,
      tone: metricTone(stalled, 1, 4),
      href: "/work-orders",
    },
    {
      key: "overdue_approvals",
      label: "Overdue approvals",
      value: approvals,
      tone: metricTone(approvals, 1, 4),
      href: "/work-orders",
    },
    {
      key: "delayed_parts",
      label: "Delayed parts",
      value: delayedParts,
      tone: metricTone(delayedParts, 1, 4),
      href: "/parts",
    },
    {
      key: "idle_technicians",
      label: "Idle technicians",
      value: idleTechnicians,
      tone: metricTone(idleTechnicians, 1, 3),
      href: "/dashboard",
    },
    {
      key: "ready_to_invoice",
      label: "Ready to invoice",
      value: readyToInvoice,
      tone: metricTone(readyToInvoice, 1, 5),
      href: "/portal/invoices",
    },
    {
      key: "appointments_today",
      label: "Appointments today",
      value: bookingsToday.count ?? 0,
      tone: "info",
      href: "/dashboard/appointments",
    },
  ];

  const generatedAt = new Date();
  return {
    shopId,
    timezone: day.timezone,
    localDayKey: new Intl.DateTimeFormat("en-CA", {
      timeZone: day.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(generatedAt),
    generatedAt: generatedAt.toISOString(),
    staleAfter: new Date(generatedAt.getTime() + 60_000).toISOString(),
    metrics,
    alerts,
  };
}
