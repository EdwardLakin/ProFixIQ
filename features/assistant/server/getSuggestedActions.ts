import { getRoleDailySummary } from "@/features/agent/server/getRoleDailySummary";
import { buildPlannerHref } from "../lib/buildPlannerHref";
import type {
  SuggestedActionContext,
  SuggestedActionItem,
  SuggestedActionsResponse,
} from "../types/suggested-actions";

type Params = {
  shopId: string;
  userId: string;
  role: string | null;
  context?: SuggestedActionContext;
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
      item.plannerHref ?? "",
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function buildContextItems(
  context?: SuggestedActionContext,
): SuggestedActionItem[] {
  if (!context) return [];

  const items: SuggestedActionItem[] = [];

  if (context.workOrderId) {
    items.push({
      id: `context:wo:${context.workOrderId}:review`,
      level: "warning",
      title: "Review this work order",
      description: "Open this work order in Planner with record context.",
      href: `/work-orders/${context.workOrderId}`,
      plannerHref: buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        autorun: true,
        workOrderId: context.workOrderId,
        customerId: context.customerId,
        vehicleId: context.vehicleId,
        goal: "Review this work order and suggest next actions",
      }),
      sourceType: "context",
      entityType: "work_order",
      entityId: context.workOrderId,
    });

    items.push({
      id: `context:wo:${context.workOrderId}:approval`,
      level: "info",
      title: "Check approval blockers",
      description:
        "Review whether this work order is blocked by approval, hold status, or parts.",
      href: `/work-orders/${context.workOrderId}`,
      plannerHref: buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        autorun: true,
        workOrderId: context.workOrderId,
        customerId: context.customerId,
        vehicleId: context.vehicleId,
        goal: "Check why this work order is blocked and suggest the best next step",
      }),
      sourceType: "context",
      entityType: "work_order",
      entityId: context.workOrderId,
    });
  }

  if (context.customerId) {
    items.push({
      id: `context:customer:${context.customerId}:history`,
      level: "info",
      title: "Review this customer's history",
      description: "Ask Assistant for prior visits, approvals, and recent work.",
      href: `/assistant?customerId=${encodeURIComponent(context.customerId)}&pageType=customer&pageTitle=Customer`,
      plannerHref: buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        autorun: true,
        goal: "Review this customer history and suggest next actions",
        customerId: context.customerId,
        customerQuery: context.customerId,
        vehicleId: context.vehicleId,
        workOrderId: context.workOrderId,
      }),
      sourceType: "context",
      entityType: "customer",
      entityId: context.customerId,
    });

    items.push({
      id: `context:customer:${context.customerId}:followup`,
      level: "warning",
      title: "Plan customer follow-up",
      description: "Decide whether this customer needs booking follow-up, quote follow-up, or outreach.",
      href: `/customers/${context.customerId}`,
      plannerHref: buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        autorun: true,
        goal: "Plan the best next follow-up for this customer",
        customerId: context.customerId,
        customerQuery: context.customerId,
        vehicleId: context.vehicleId,
        workOrderId: context.workOrderId,
      }),
      sourceType: "context",
      entityType: "customer",
      entityId: context.customerId,
    });
  }

  if (context.vehicleId) {
    items.push({
      id: `context:vehicle:${context.vehicleId}:history`,
      level: "info",
      title: "Review this vehicle history",
      description: "See prior work, repeated issues, and likely next service actions.",
      href: `/assistant?vehicleId=${encodeURIComponent(context.vehicleId)}&pageType=vehicle&pageTitle=Vehicle`,
      plannerHref: buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        autorun: true,
        goal: "Review this vehicle history and suggest next actions",
        vehicleId: context.vehicleId,
        customerId: context.customerId,
        workOrderId: context.workOrderId,
      }),
      sourceType: "context",
      entityType: "vehicle",
      entityId: context.vehicleId,
    });
  }

  if (context.bookingId) {
    items.push({
      id: `context:booking:${context.bookingId}:review`,
      level: "info",
      title: "Review this booking",
      description: "Check whether this booking should be confirmed, moved, or converted into shop work.",
      href: `/assistant?bookingId=${encodeURIComponent(context.bookingId)}&pageType=booking&pageTitle=Booking`,
      plannerHref: buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        autorun: true,
        bookingId: context.bookingId,
        customerId: context.customerId,
        vehicleId: context.vehicleId,
        workOrderId: context.workOrderId,
        goal: "Review this booking and recommend the best next action",
      }),
      sourceType: "context",
      entityType: "booking",
      entityId: context.bookingId,
    });
  }

  return items;
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

  const items: SuggestedActionItem[] = [...buildContextItems(params.context)];

  for (const notification of summary.notifications) {
    const entityType =
      notification.entityType === "work_order" ||
      notification.entityType === "booking" ||
      notification.entityType === "customer" ||
      notification.entityType === "vehicle"
        ? notification.entityType
        : undefined;

    const entityId = notification.entityId;

    const plannerHref = buildPlannerHref({
      planner: "ops",
      allowCreate: false,
      autorun: true,
      goal: `Resolve this issue: ${notification.title}. ${notification.message}`,
      workOrderId:
        entityType === "work_order"
          ? entityId
          : params.context?.workOrderId,
      bookingId:
        entityType === "booking"
          ? entityId
          : params.context?.bookingId,
      customerId:
        entityType === "customer"
          ? entityId
          : params.context?.customerId,
      vehicleId:
        entityType === "vehicle"
          ? entityId
          : params.context?.vehicleId,
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
      entityType,
      entityId,
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
