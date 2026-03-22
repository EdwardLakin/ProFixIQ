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

type DailySummaryResult = {
  role: string;
  summaryText: string;
  actionItems: string[];
  links: SummaryLink[];
  notifications: Array<{
    level: string;
    code: string;
    title: string;
    message: string;
    href?: string;
    entityType?: string;
    entityId?: string;
  }>;
  sourceSnapshot: Record<string, unknown>;
};

function normalizeRole(role: string | null | undefined): string {
  return (role ?? "owner").toLowerCase();
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

  const notifications = persistedNotifications.map((item) => ({
    level: item.level,
    code: item.code,
    title: item.title,
    message: item.message,
    href: item.href ?? undefined,
    entityType: item.entity_type ?? undefined,
    entityId: item.entity_id ?? undefined,
  }));

  const bookings = await runGetBookings({ limit: 10 }, ctx);
  const stalled = await runGetStalledWorkOrders({}, ctx);
  const shopStatus = await runGetShopCurrentStatus({}, ctx);
  const techWork =
    role === "tech" || role === "technician" || role === "mechanic"
      ? await runGetTechCurrentWork({ techId: params.userId }, ctx)
      : null;

  const actionItems: string[] = [];
  const links: SummaryLink[] = [];

  for (const item of notifications.slice(0, 5)) {
    actionItems.push(item.title);
    if (item.href) {
      links.push({
        label: item.title,
        href: item.href,
      });
    }
  }

  const stalledCitations = Array.isArray(stalled.citations) ? stalled.citations : [];
  for (const citation of stalledCitations.slice(0, 3)) {
    links.push({
      label: citation.label,
      href: citation.href,
    });
  }

  let summaryText = "";

  if (role === "owner") {
    summaryText =
      `Owner summary: ${notifications.length} active alerts. ` +
      `${stalled.summary} ` +
      `${shopStatus.summary}`;
  } else if (role === "advisor") {
    summaryText =
      `Advisor summary: ${bookings.summary} ` +
      `${notifications.length} active alerts need attention.`;
  } else if (role === "manager") {
    summaryText =
      `Manager summary: ${shopStatus.summary} ` +
      `${stalled.summary}`;
  } else if (role === "tech" || role === "technician" || role === "mechanic") {
    summaryText =
      `Tech summary: ${techWork?.summary ?? "No assigned active work found."}`;
  } else if (role === "fleet") {
    summaryText =
      `Fleet summary: ${notifications.length} active alerts. ` +
      `${stalled.summary}`;
  } else {
    summaryText =
      `Daily summary: ${notifications.length} active alerts. ` +
      `${stalled.summary}`;
  }

  return {
    role,
    summaryText,
    actionItems,
    links,
    notifications,
    sourceSnapshot: {
      notificationsCount: notifications.length,
      bookingsSummary: bookings.summary,
      stalledSummary: stalled.summary,
      shopStatusSummary: shopStatus.summary,
      techWorkSummary: techWork?.summary ?? null,
    },
  };
}
