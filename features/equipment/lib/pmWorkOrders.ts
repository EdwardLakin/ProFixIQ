import { COMPLETED_REPAIR_STATUSES } from "@/features/menu-repair-items/lib/completedRepair";
import {
  convertDistance,
  todayIso,
  type PmCompletion,
  type PmPlan,
} from "@/features/equipment/lib/pm";
import {
  isActiveWorkOrderStatus,
  normalizeWorkOrderStatus,
} from "@/features/work-orders/lib/work-order-status";

/**
 * Equipment PM ↔ work order links.
 *
 * A link records that a work order is doing a PM plan, so the plan card can
 * show the open work order (nobody starts a duplicate) and, once it is
 * completed, offer to record the PM completion with the work order's facts
 * prefilled. A person always confirms the completion; nothing is recorded
 * automatically.
 */

/** Where a linked work order is in its lifecycle (from the canonical statuses). */
export type PmWorkOrderState = "open" | "completed" | "closed" | "unknown";

export type PmWorkOrderLink = {
  id: string;
  planId: string;
  linkedAt: string;
  workOrder: {
    id: string;
    /** "WO-1042", or "Work order" when the caller cannot see it. */
    label: string;
    href: string | null;
    status: string | null;
    state: PmWorkOrderState;
    /** Odometer recorded on the work order (km). */
    odometerKm: number | null;
    /** Engine hours recorded on the work order. */
    engineHours: number | null;
    /** Date (YYYY-MM-DD) the work order was last updated. */
    updatedOn: string | null;
  };
};

export type AssetPmWorkOrders = {
  links: PmWorkOrderLink[];
  /** Existing work-order create page with the asset prefilled, when the caller may create one. */
  createWorkOrderHref: string | null;
  canLink: boolean;
  canUnlink: boolean;
};

/**
 * Completed means the repair is done: completed, ready to invoice or invoiced
 * (the canonical completed-repair statuses, legacy spellings normalized).
 * Otherwise open follows the canonical active-status contract. Anything else
 * (cancelled) is closed.
 */
export function pmWorkOrderState(status: string | null | undefined): PmWorkOrderState {
  if (status === null || status === undefined || !String(status).trim()) return "unknown";
  // Completed is checked first: ready-to-invoice still counts as active for
  // the shop's open-work totals, but the repair itself is done.
  const canonical = normalizeWorkOrderStatus(status);
  if ((COMPLETED_REPAIR_STATUSES as readonly string[]).includes(canonical)) return "completed";
  if (isActiveWorkOrderStatus(status)) return "open";
  return "closed";
}

/**
 * The existing create page with the asset's vehicle and customer prefilled and
 * a way back to the asset. Null without a customer (the create page needs one).
 */
export function pmCreateWorkOrderHref(input: {
  baseHref: string | null;
  assetId: string;
}): string | null {
  if (!input.baseHref) return null;
  const [path, query = ""] = input.baseHref.split("?");
  const params = new URLSearchParams(query);
  params.set("returnTo", `/equipment/${input.assetId}`);
  return `${path}?${params.toString()}`;
}

/** True once a completion that is not voided references the work order. */
export function pmWorkOrderRecorded(history: PmCompletion[], workOrderId: string): boolean {
  return history.some((completion) => !completion.voided && completion.workOrder?.id === workOrderId);
}

export type PmCompletionPrefill = {
  workOrderId: string;
  workOrderLabel: string;
  completedOn: string | null;
  assetHours: number | null;
  /** In the plan's distance unit. */
  distance: number | null;
};

/**
 * Facts from a completed work order for the completion form: its id, the
 * odometer (converted to the plan's unit), engine hours and last-updated date
 * as recorded on the work order (never later than today). The technician
 * reviews and confirms them.
 */
export function pmCompletionPrefill(
  link: PmWorkOrderLink,
  plan: Pick<PmPlan, "distanceUnit">,
  now = Date.now(),
): PmCompletionPrefill {
  const { workOrder } = link;
  const today = todayIso(now);
  const distance =
    workOrder.odometerKm !== null && plan.distanceUnit
      ? Math.round(convertDistance(workOrder.odometerKm, "km", plan.distanceUnit) * 10) / 10
      : null;
  return {
    workOrderId: workOrder.id,
    workOrderLabel: workOrder.label,
    completedOn: workOrder.updatedOn ? (workOrder.updatedOn > today ? today : workOrder.updatedOn) : null,
    assetHours: workOrder.engineHours !== null ? Math.round(workOrder.engineHours) : null,
    distance,
  };
}
