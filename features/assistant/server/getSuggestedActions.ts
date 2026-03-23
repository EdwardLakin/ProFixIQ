import { getRoleDailySummary } from "@/features/agent/server/getRoleDailySummary";
import { buildPlannerHref } from "../lib/buildPlannerHref";
import type {
  SuggestedActionItem,
  SuggestedActionsResponse,
} from "../types/suggested-actions";

type Params = {
  shopId: string;
  userId: string;
  role: string | null;
};

function normalizeRole(role: string | null | undefined): string {
  return (role ?? "owner").toLowerCase();
}

function levelRank(level: string): number {
  switch (level) {
    case "urgent":
      return 3;
    case "warning":
      return 2;
    default:
      return 1;
  }
}

function dedupe(items: SuggestedActionItem[]): SuggestedActionItem[] {
  const seen = new Set<string>();
  const out: SuggestedActionItem[] = [];

  for (const item of items) {
    const key = [
      item.title.trim().toLowerCase(),
      item.entityType ?? "",
      item.entityId ?? "",
      item.href,
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export async function getSuggestedActions(
  params: Params,
): Promise<SuggestedActionsResponse> {
  const role = normalizeRole(params.role);

  const summary = await getRoleDailySummary({
    shopId: params.shopId,
    userId: params.userId,
    role,
  });

  const items: SuggestedActionItem[] = [];

  for (const notification of summary.notifications) {
    const plannerHref = buildPlannerHref({
      planner: "ops",
      allowCreate: false,
      goal: `Resolve this issue: ${notification.title}. ${notification.message}`,
      workOrderId:
        notification.entityType === "work_order"
          ? notification.entityId
          : undefined,
    });

    items.push({
      id: `${notification.code}:${notification.entityId ?? notification.title}`,
      level:
        notification.level === "urgent" || notification.level === "warning"
          ? notification.level
          : "info",
      title: notification.title,
      description: notification.message,
      href: notification.href ?? "/agent/planner",
      plannerHref,
      sourceType: "notification",
      entityType:
        notification.entityType === "work_order" ||
        notification.entityType === "booking" ||
        notification.entityType === "customer" ||
        notification.entityType === "vehicle"
          ? notification.entityType
          : undefined,
      entityId: notification.entityId,
    });
  }

  for (const link of summary.links.slice(0, 4)) {
    items.push({
      id: `link:${link.href}`,
      level: "info",
      title: link.label,
      description: "Open related item",
      href: link.href,
      sourceType: "daily_summary",
    });
  }

  const ranked = dedupe(items).sort((a, b) => {
    const diff = levelRank(b.level) - levelRank(a.level);
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title);
  });

  return {
    role,
    items: ranked.slice(0, 8),
  };
}
