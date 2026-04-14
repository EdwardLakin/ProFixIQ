
import { getRoleDailySummary } from "@/features/agent/server/getRoleDailySummary";
import { canonicalizeRole, getActorCapabilities } from "@/features/shared/lib/rbac";
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

type AllowedEntityType =
  | "work_order"
  | "work_order_line"
  | "booking"
  | "customer"
  | "vehicle"
  | "invoice"
  | "shop";

function levelRank(level: string): number {
  switch (level) {
    case "urgent":
    case "critical":
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

function isTechScopedRole(role: string): boolean {
  return role === "mechanic";
}

function normalizeEntityType(value: string | undefined): AllowedEntityType | undefined {
  if (
    value === "work_order" ||
    value === "work_order_line" ||
    value === "booking" ||
    value === "customer" ||
    value === "vehicle" ||
    value === "invoice" ||
    value === "shop"
  ) {
    return value;
  }
  return undefined;
}

function canSeeEntity(
  caps: ReturnType<typeof getActorCapabilities>,
  entityType: AllowedEntityType,
): boolean {
  switch (entityType) {
    case "work_order":
    case "work_order_line":
      return caps.canManageWorkOrders || caps.canRunInspections;
    case "customer":
      return caps.canViewShopWideData || caps.canAuthorizeQuotes;
    case "vehicle":
      return caps.canRunInspections || caps.canViewShopWideData || caps.canViewFleetOnlyData;
    case "booking":
      return caps.canManageScheduling || caps.canAuthorizeQuotes || caps.canViewFleetOnlyData;
    case "invoice":
      return caps.canViewShopWideData || caps.canAuthorizeQuotes;
    case "shop":
      return caps.canViewShopWideData;
    default:
      return false;
  }
}

function buildContextItems(
  role: string | null,
  context?: SuggestedActionContext,
): SuggestedActionItem[] {
  if (!context) return [];

  const caps = getActorCapabilities({ role });
  const canonicalRole = canonicalizeRole(role);
  const techScoped = isTechScopedRole(canonicalRole);

  const items: SuggestedActionItem[] = [];

  if (context.workOrderId && canSeeEntity(caps, "work_order")) {
    items.push({
      id: `context:wo:${context.workOrderId}:primary`,
      level: techScoped ? "warning" : "warning",
      title: techScoped ? "Open this assigned job" : "Review this work order",
      description: techScoped
        ? "Open the current job and act on the next technician-facing step."
        : "Open this work order in Planner with record context.",
      href: `/work-orders/${context.workOrderId}`,
      plannerHref: buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        autorun: true,
        workOrderId: context.workOrderId,
        customerId: context.customerId,
        vehicleId: context.vehicleId,
        goal: techScoped
          ? "Review this assigned work order and suggest the next technician action"
          : "Review this work order and suggest next actions",
      }),
      sourceType: "context",
      entityType: "work_order",
      entityId: context.workOrderId,
    });

    items.push({
      id: `context:wo:${context.workOrderId}:blockers`,
      level: "info",
      title: techScoped ? "Check blocker on this job" : "Check approval blockers",
      description: techScoped
        ? "Review whether this job is blocked by hold status, parts, or missing handoff."
        : "Review whether this work order is blocked by approval, hold status, or parts.",
      href: `/work-orders/${context.workOrderId}`,
      plannerHref: buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        autorun: true,
        workOrderId: context.workOrderId,
        customerId: context.customerId,
        vehicleId: context.vehicleId,
        goal: techScoped
          ? "Check why this assigned job is blocked and suggest the best next technician step"
          : "Check why this work order is blocked and suggest the best next step",
      }),
      sourceType: "context",
      entityType: "work_order",
      entityId: context.workOrderId,
    });
  }

  if (!techScoped && context.customerId && canSeeEntity(caps, "customer")) {
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

  if (context.vehicleId && canSeeEntity(caps, "vehicle")) {
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

  if (!techScoped && context.bookingId && canSeeEntity(caps, "booking")) {
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

function canIncludeNotification(args: {
  role: string;
  caps: ReturnType<typeof getActorCapabilities>;
  entityType?: AllowedEntityType;
  entityId?: string;
  context?: SuggestedActionContext;
}): boolean {
  const { role, caps, entityType, entityId, context } = args;

  if (!entityType) {
    return caps.canViewShopWideData || !isTechScopedRole(role);
  }

  if (!canSeeEntity(caps, entityType)) return false;

  if (isTechScopedRole(role)) {
    if (entityType === "work_order" || entityType === "work_order_line") {
      if (!context?.workOrderId) return true;
      return entityId === context.workOrderId || entityType === "work_order_line";
    }
    return false;
  }

  return true;
}

function canIncludeLink(args: {
  role: string;
  caps: ReturnType<typeof getActorCapabilities>;
  href: string;
}): boolean {
  const { role, caps, href } = args;

  if (isTechScopedRole(role)) {
    return href.includes("/work-orders/") || href.includes("/focused-job/");
  }

  if (caps.canViewShopWideData) return true;
  return href.includes("/work-orders/") || href.includes("/customers/") || href.includes("/dashboard/appointments");
}

export async function getSuggestedActions(
  params: Params,
): Promise<SuggestedActionsResponse> {
  const role = canonicalizeRole(params.role);
  const caps = getActorCapabilities({ role: params.role });

  const summary = await getRoleDailySummary({
    shopId: params.shopId,
    userId: params.userId,
    role,
  });

  const items: SuggestedActionItem[] = [...buildContextItems(params.role, params.context)];

  for (const notification of summary.notifications) {
    const entityType = normalizeEntityType(notification.entityType);
    const entityId = notification.entityId;

    if (
      !canIncludeNotification({
        role,
        caps,
        entityType,
        entityId,
        context: params.context,
      })
    ) {
      continue;
    }

    const plannerHref = buildPlannerHref({
      planner: "ops",
      allowCreate: false,
      autorun: true,
      goal: `Resolve this issue: ${notification.title}. ${notification.message}`,
      workOrderId:
        entityType === "work_order" || entityType === "work_order_line"
          ? (params.context?.workOrderId ?? entityId)
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
        notification.level === "critical" || notification.level === "warning"
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
    if (!canIncludeLink({ role, caps, href: link.href })) continue;

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
