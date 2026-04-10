// features/agent/server/getRoleDailySummary.ts

import type { ToolContext } from "../lib/toolTypes";
import { syncAssistantNotifications } from "./syncAssistantNotifications";
import { runGetBookings } from "../tools/getBookings";
import { runGetShopCurrentStatus } from "../tools/getShopCurrentStatus";
import { runGetStalledWorkOrders } from "../tools/getStalledWorkOrders";
import { runGetTechCurrentWork } from "../tools/getTechCurrentWork";

type SummaryLink = {
  label: string;
  href: string;
};

type DailySummaryNotification = {
  level: string;
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

type DailySummaryResult = {
  role: string;
  summaryText: string;
  actionItems: string[];
  links: SummaryLink[];
  notifications: DailySummaryNotification[];
  sourceSnapshot: Record<string, unknown>;
};

type StalledCitation = {
  label: string;
  href: string;
};

function normalizeRole(role: string | null | undefined): string {
  return (role ?? "owner").toLowerCase();
}

function dedupeStrings(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= limit) break;
  }

  return out;
}

function dedupeLinks(values: SummaryLink[], limit: number): SummaryLink[] {
  const seenHref = new Set<string>();
  const seenLabel = new Set<string>();
  const out: SummaryLink[] = [];

  for (const value of values) {
    const label = value.label.trim();
    const href = value.href.trim();
    if (!label || !href) continue;

    const hrefKey = href.toLowerCase();
    const labelKey = label.toLowerCase();

    if (seenHref.has(hrefKey) || seenLabel.has(labelKey)) continue;

    seenHref.add(hrefKey);
    seenLabel.add(labelKey);
    out.push({ label, href });

    if (out.length >= limit) break;
  }

  return out;
}

function parseHoursFromMessage(message: string): number | null {
  const match = message.match(/for\s+(\d+(?:\.\d+)?)\s*hours?/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function extractWorkOrderLabel(value: {
  title: string;
  message: string;
  href?: string;
}): string | null {
  const messageMatch = value.message.match(/WO\s+#?([A-Z0-9-]+)/i);
  if (messageMatch?.[1] && !looksLikeUuid(messageMatch[1])) {
    return messageMatch[1];
  }

  const titleMatch = value.title.match(/WO\s+#?([A-Z0-9-]+)/i);
  if (titleMatch?.[1] && !looksLikeUuid(titleMatch[1])) {
    return titleMatch[1];
  }

  const hrefCustomIdMatch =
    value.href?.match(/woId=([A-Z0-9-]+)/i) ??
    value.href?.match(/work-orders\/([A-Z]{1,4}\d{3,})/i) ??
    value.href?.match(/quote-review\/([A-Z]{1,4}\d{3,})/i);

  if (hrefCustomIdMatch?.[1] && !looksLikeUuid(hrefCustomIdMatch[1])) {
    return hrefCustomIdMatch[1];
  }

  return null;
}

function topUrgentAlerts(
  notifications: DailySummaryNotification[],
  limit: number,
): Array<{ title: string; hours: number | null; workOrderLabel: string | null }> {
  return notifications
    .map((item) => ({
      title: item.title,
      hours: parseHoursFromMessage(item.message),
      workOrderLabel: extractWorkOrderLabel(item),
      levelRank:
        item.level === "urgent" || item.level === "critical"
          ? 3
          : item.level === "warning"
            ? 2
            : 1,
    }))
    .sort((a, b) => {
      if (b.levelRank !== a.levelRank) return b.levelRank - a.levelRank;
      return (b.hours ?? 0) - (a.hours ?? 0);
    })
    .slice(0, limit)
    .map(({ title, hours, workOrderLabel }) => ({
      title,
      hours,
      workOrderLabel,
    }));
}

function countByCode(
  notifications: DailySummaryNotification[],
): Record<string, number> {
  return notifications.reduce<Record<string, number>>((acc, item) => {
    acc[item.code] = (acc[item.code] ?? 0) + 1;
    return acc;
  }, {});
}

function buildLoadSignalActionItems(
  notifications: DailySummaryNotification[],
): string[] {
  const counts = countByCode(notifications);
  const items: string[] = [];

  if ((counts.shop_overloaded ?? 0) > 0 || (counts.tech_overloaded ?? 0) > 0) {
    items.push("Utilization is running hot — rebalance queued work to available technicians.");
  }

  if ((counts.tech_underutilized_capacity ?? 0) > 0) {
    items.push("Idle technician capacity detected — pull ready jobs forward and reassign now.");
  }

  if (
    (counts.active_job_running_too_long ?? 0) > 0 ||
    (counts.shop_throughput_below_capacity ?? 0) > 0
  ) {
    items.push("Throughput drag detected — clear blockers on long-running jobs and tighten handoffs.");
  }

  return dedupeStrings(items, 2);
}

function buildOwnerSummary(params: {
  notifications: DailySummaryNotification[];
}): string {
  const counts = countByCode(params.notifications);
  const total = params.notifications.length;
  const top = topUrgentAlerts(params.notifications, 3);
  const loadSignals = buildLoadSignalActionItems(params.notifications);

  const lines: string[] = [];
  lines.push(`${total} alerts need attention today.`);

  const breakdown: string[] = [];
  if ((counts.approval_waiting ?? 0) > 0) {
    breakdown.push(`${counts.approval_waiting} waiting on approval`);
  }
  if ((counts.work_order_on_hold_too_long ?? 0) > 0) {
    breakdown.push(`${counts.work_order_on_hold_too_long} on hold too long`);
  }
  if ((counts.work_order_waiting_too_long ?? 0) > 0) {
    breakdown.push(`${counts.work_order_waiting_too_long} queued too long`);
  }
  if ((counts.parts_waiting_too_long ?? 0) > 0) {
    breakdown.push(`${counts.parts_waiting_too_long} waiting on parts too long`);
  }
  if ((counts.invoice_unsent_too_long ?? 0) > 0) {
    breakdown.push(`${counts.invoice_unsent_too_long} invoices unsent too long`);
  }
  if ((counts.tech_overloaded ?? 0) > 0) {
    breakdown.push(`${counts.tech_overloaded} technician overloaded`);
  }
  if ((counts.shop_overloaded ?? 0) > 0) {
    breakdown.push(`${counts.shop_overloaded} shop overloaded`);
  }
  if ((counts.tech_underutilized_capacity ?? 0) > 0) {
    breakdown.push(
      `${counts.tech_underutilized_capacity} underutilized capacity alerts`,
    );
  }
  if ((counts.active_job_running_too_long ?? 0) > 0) {
    breakdown.push(`${counts.active_job_running_too_long} active jobs running too long`);
  }
  if ((counts.shop_throughput_below_capacity ?? 0) > 0) {
    breakdown.push(`${counts.shop_throughput_below_capacity} throughput below capacity`);
  }
  if ((counts.optimization_pricing_normalization ?? 0) > 0) {
    breakdown.push(`${counts.optimization_pricing_normalization} pricing standardization opportunities`);
  }
  if ((counts.optimization_inspection_coverage_gap ?? 0) > 0) {
    breakdown.push(`${counts.optimization_inspection_coverage_gap} inspection coverage opportunities`);
  }
  if ((counts.optimization_missed_revenue ?? 0) > 0) {
    breakdown.push(`${counts.optimization_missed_revenue} missed-revenue opportunities`);
  }
  if ((counts.optimization_review_queued_suggestions ?? 0) > 0) {
    breakdown.push(`${counts.optimization_review_queued_suggestions} queued ShopBoost review reminders`);
  }

  if (breakdown.length > 0) {
    lines.push("");
    for (const item of breakdown.slice(0, 4)) {
      lines.push(`• ${item}`);
    }
  }

  if (top.length > 0) {
    lines.push("");
    lines.push("Most urgent:");
    for (const item of top) {
      const wo = item.workOrderLabel ? `WO #${item.workOrderLabel} ` : "";
      const hours = item.hours != null ? ` (${Math.round(item.hours)}h)` : "";
      lines.push(`• ${wo}${item.title}${hours}`);
    }
  }

  if (loadSignals.length > 0) {
    lines.push("");
    lines.push("Load signals:");
    for (const item of loadSignals) {
      lines.push(`• ${item}`);
    }
  }

  return lines.join("\n");
}

function buildAdvisorSummary(params: {
  bookingsSummary: string;
  notifications: DailySummaryNotification[];
}): string {
  const counts = countByCode(params.notifications);
  const loadSignals = buildLoadSignalActionItems(params.notifications);
  const parts: string[] = [];

  if ((counts.approval_waiting ?? 0) > 0) {
    parts.push(`${counts.approval_waiting} approvals waiting`);
  }
  if ((counts.work_order_on_hold_too_long ?? 0) > 0) {
    parts.push(`${counts.work_order_on_hold_too_long} work orders on hold too long`);
  }
  if ((counts.work_order_waiting_too_long ?? 0) > 0) {
    parts.push(`${counts.work_order_waiting_too_long} queued too long`);
  }
  if ((counts.parts_waiting_too_long ?? 0) > 0) {
    parts.push(`${counts.parts_waiting_too_long} jobs waiting on parts too long`);
  }
  if ((counts.invoice_unsent_too_long ?? 0) > 0) {
    parts.push(`${counts.invoice_unsent_too_long} invoices unsent too long`);
  }
  if ((counts.active_job_running_too_long ?? 0) > 0) {
    parts.push(`${counts.active_job_running_too_long} active jobs running too long`);
  }
  if ((counts.shop_overloaded ?? 0) > 0) {
    parts.push(`${counts.shop_overloaded} shop overload alerts`);
  }
  if ((counts.shop_throughput_below_capacity ?? 0) > 0) {
    parts.push(`${counts.shop_throughput_below_capacity} throughput below capacity`);
  }
  if ((counts.optimization_pricing_normalization ?? 0) > 0) {
    parts.push(`${counts.optimization_pricing_normalization} pricing optimization actions`);
  }
  if ((counts.optimization_inspection_coverage_gap ?? 0) > 0) {
    parts.push(`${counts.optimization_inspection_coverage_gap} inspection optimization actions`);
  }
  if ((counts.optimization_missed_revenue ?? 0) > 0) {
    parts.push(`${counts.optimization_missed_revenue} missed-revenue actions`);
  }

  const lines: string[] = [];
  lines.push("Advisor snapshot for today.");
  if (params.bookingsSummary.trim()) {
    lines.push("");
    lines.push(params.bookingsSummary.trim());
  }
  if (parts.length > 0) {
    lines.push("");
    for (const item of parts.slice(0, 4)) {
      lines.push(`• ${item}`);
    }
  }

  if (loadSignals.length > 0) {
    lines.push("");
    lines.push(`• ${loadSignals[0]}`);
  }

  return lines.join("\n");
}

function buildManagerSummary(params: {
  shopStatusSummary: string;
  notifications: DailySummaryNotification[];
}): string {
  const counts = countByCode(params.notifications);
  const loadSignals = buildLoadSignalActionItems(params.notifications);
  const lines: string[] = [];

  lines.push("Manager snapshot for today.");

  if (params.shopStatusSummary.trim()) {
    lines.push("");
    lines.push(params.shopStatusSummary.trim());
  }

  const items: string[] = [];
  if ((counts.work_order_on_hold_too_long ?? 0) > 0) {
    items.push(`${counts.work_order_on_hold_too_long} jobs on hold too long`);
  }
  if ((counts.work_order_waiting_too_long ?? 0) > 0) {
    items.push(`${counts.work_order_waiting_too_long} queued too long`);
  }
  if ((counts.parts_waiting_too_long ?? 0) > 0) {
    items.push(`${counts.parts_waiting_too_long} waiting on parts too long`);
  }
  if ((counts.invoice_unsent_too_long ?? 0) > 0) {
    items.push(`${counts.invoice_unsent_too_long} invoices unsent too long`);
  }
  if ((counts.tech_overloaded ?? 0) > 0) {
    items.push(`${counts.tech_overloaded} technician overloaded`);
  }
  if ((counts.shop_overloaded ?? 0) > 0) {
    items.push(`${counts.shop_overloaded} shop overloaded`);
  }
  if ((counts.tech_underutilized_capacity ?? 0) > 0) {
    items.push(`${counts.tech_underutilized_capacity} underutilized capacity alerts`);
  }
  if ((counts.active_job_running_too_long ?? 0) > 0) {
    items.push(`${counts.active_job_running_too_long} active jobs running too long`);
  }
  if ((counts.shop_throughput_below_capacity ?? 0) > 0) {
    items.push(`${counts.shop_throughput_below_capacity} throughput below capacity`);
  }
  if ((counts.optimization_pricing_normalization ?? 0) > 0) {
    items.push(`${counts.optimization_pricing_normalization} pricing optimization opportunities`);
  }
  if ((counts.optimization_inspection_coverage_gap ?? 0) > 0) {
    items.push(`${counts.optimization_inspection_coverage_gap} inspection optimization opportunities`);
  }
  if ((counts.optimization_missed_revenue ?? 0) > 0) {
    items.push(`${counts.optimization_missed_revenue} missed-revenue opportunities`);
  }

  if (items.length > 0) {
    lines.push("");
    for (const item of items.slice(0, 4)) {
      lines.push(`• ${item}`);
    }
  }

  if (loadSignals.length > 0) {
    lines.push("");
    for (const item of loadSignals) {
      lines.push(`• ${item}`);
    }
  }

  return lines.join("\n");
}

function buildTechSummary(params: {
  techWorkSummary: string | null;
  notifications: DailySummaryNotification[];
}): string {
  const counts = countByCode(params.notifications);
  const lines: string[] = [];

  lines.push("Tech snapshot for today.");

  lines.push("");
  lines.push(params.techWorkSummary?.trim() || "No assigned active work found.");

  const items: string[] = [];
  if ((counts.work_order_on_hold_too_long ?? 0) > 0) {
    items.push(`${counts.work_order_on_hold_too_long} held jobs need review`);
  }
  if ((counts.approval_waiting ?? 0) > 0) {
    items.push(`${counts.approval_waiting} approvals waiting`);
  }
  if ((counts.parts_waiting_too_long ?? 0) > 0) {
    items.push(`${counts.parts_waiting_too_long} jobs waiting on parts too long`);
  }
  if ((counts.optimization_review_queued_suggestions ?? 0) > 0) {
    items.push(`${counts.optimization_review_queued_suggestions} queued suggestions pending advisor review`);
  }

  if (items.length > 0) {
    lines.push("");
    for (const item of items.slice(0, 3)) {
      lines.push(`• ${item}`);
    }
  }

  return lines.join("\n");
}

function buildFleetSummary(params: {
  notifications: DailySummaryNotification[];
}): string {
  const counts = countByCode(params.notifications);
  const lines: string[] = [];

  lines.push(`${params.notifications.length} fleet-related alerts need attention today.`);

  const items: string[] = [];
  if ((counts.work_order_waiting_too_long ?? 0) > 0) {
    items.push(`${counts.work_order_waiting_too_long} queued too long`);
  }
  if ((counts.work_order_on_hold_too_long ?? 0) > 0) {
    items.push(`${counts.work_order_on_hold_too_long} on hold too long`);
  }
  if ((counts.approval_waiting ?? 0) > 0) {
    items.push(`${counts.approval_waiting} approvals waiting`);
  }
  if ((counts.parts_waiting_too_long ?? 0) > 0) {
    items.push(`${counts.parts_waiting_too_long} jobs waiting on parts too long`);
  }
  if ((counts.optimization_missed_revenue ?? 0) > 0) {
    items.push(`${counts.optimization_missed_revenue} missed-revenue opportunities`);
  }

  if (items.length > 0) {
    lines.push("");
    for (const item of items.slice(0, 4)) {
      lines.push(`• ${item}`);
    }
  }

  return lines.join("\n");
}

export async function getRoleDailySummary(params: {
  shopId: string;
  userId: string;
  role: string | null;
}): Promise<DailySummaryResult> {
  const role = normalizeRole(params.role);
  const ctx: ToolContext = {
    shopId: params.shopId,
    userId: params.userId,
  };

  const persistedNotifications = await syncAssistantNotifications({
    shopId: params.shopId,
    userId: params.userId,
    role,
  });

  const notifications: DailySummaryNotification[] = persistedNotifications.map(
    (item) => ({
      level: item.level,
      code: item.code,
      title: item.title,
      message: item.message,
      href: item.href ?? undefined,
      entityType: item.entity_type ?? undefined,
      entityId: item.entity_id ?? undefined,
    }),
  );

  const bookings = await runGetBookings({ limit: 10 }, ctx);
  const stalled = await runGetStalledWorkOrders({}, ctx);
  const shopStatus = await runGetShopCurrentStatus({}, ctx);
  const techWork =
    role === "tech" || role === "technician" || role === "mechanic"
      ? await runGetTechCurrentWork({ techId: params.userId }, ctx)
      : null;

  const actionItems = dedupeStrings(
    notifications.map((item) => item.title),
    5,
  );

  const links: SummaryLink[] = dedupeLinks(
    [
      ...notifications
        .filter((item) => Boolean(item.href))
        .map((item) => ({
          label: extractWorkOrderLabel(item)
            ? `WO #${extractWorkOrderLabel(item)} • ${item.title}`
            : item.title,
          href: item.href as string,
        })),
      ...((Array.isArray(stalled.citations)
        ? stalled.citations
        : []) as StalledCitation[]).map((citation) => ({
        label: citation.label,
        href: citation.href,
      })),
    ],
    6,
  );

  let summaryText = "";

  if (role === "owner") {
    summaryText = buildOwnerSummary({ notifications });
  } else if (role === "advisor") {
    summaryText = buildAdvisorSummary({
      bookingsSummary: bookings.summary,
      notifications,
    });
  } else if (role === "manager") {
    summaryText = buildManagerSummary({
      shopStatusSummary: shopStatus.summary,
      notifications,
    });
  } else if (role === "tech" || role === "technician" || role === "mechanic") {
    summaryText = buildTechSummary({
      techWorkSummary: techWork?.summary ?? null,
      notifications,
    });
  } else if (role === "fleet") {
    summaryText = buildFleetSummary({ notifications });
  } else {
    summaryText = buildOwnerSummary({ notifications });
  }

  const notificationCounts = countByCode(notifications);

  return {
    role,
    summaryText,
    actionItems,
    links,
    notifications: notifications.slice(0, 4),
    sourceSnapshot: {
      notificationsCount: notifications.length,
      loadSignals: {
        shopOverloaded: notificationCounts.shop_overloaded ?? 0,
        techOverloaded: notificationCounts.tech_overloaded ?? 0,
        idleCapacity: notificationCounts.tech_underutilized_capacity ?? 0,
        throughputIssues: notificationCounts.shop_throughput_below_capacity ?? 0,
      },
      optimizationSignals: {
        pricing: notificationCounts.optimization_pricing_normalization ?? 0,
        inspectionCoverage: notificationCounts.optimization_inspection_coverage_gap ?? 0,
        missedRevenue: notificationCounts.optimization_missed_revenue ?? 0,
        queuedSuggestions: notificationCounts.optimization_review_queued_suggestions ?? 0,
      },
      bookingsSummary: bookings.summary,
      stalledSummary: stalled.summary,
      shopStatusSummary: shopStatus.summary,
      techWorkSummary: techWork?.summary ?? null,
    },
  };
}
