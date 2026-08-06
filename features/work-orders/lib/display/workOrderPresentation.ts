import {
  formatDecisionStatus,
  type DecisionStatusView,
} from "@/features/shared/lib/decisionStatus";
import {
  normalizeWorkOrderLineStatus,
  type WorkOrderLineStatus,
} from "@/features/work-orders/lib/line-status";
import { normalizeWorkOrderStatus } from "@/features/work-orders/lib/work-order-status";

const NON_ACTIVE_LINE_STATUSES = new Set<WorkOrderLineStatus>([
  "completed",
  "ready_to_invoice",
  "invoiced",
  "declined",
  "deferred",
]);

export function formatWorkOrderHeaderStatus(
  status: string | null | undefined,
  paymentStatus?: string | null,
): DecisionStatusView {
  const normalized = normalizeWorkOrderStatus(status);
  const decisionStatus = formatDecisionStatus({ workStatus: normalized });
  const normalizedPaymentStatus = String(paymentStatus ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (normalizedPaymentStatus === "paid") {
    return { ...decisionStatus, label: "Paid", variant: "success" };
  }

  if (normalized === "ready_to_invoice") {
    return { ...decisionStatus, label: "Ready to invoice" };
  }

  if (normalized === "invoiced") {
    return { ...decisionStatus, label: "Invoiced" };
  }

  if (normalized === "cancelled") {
    return { ...decisionStatus, label: "Cancelled", variant: "danger" };
  }

  return decisionStatus;
}

export function countActiveWorkOrderLines(
  lines: ReadonlyArray<{ status?: string | null }>,
): number {
  return lines.filter(
    (line) => !NON_ACTIVE_LINE_STATUSES.has(normalizeWorkOrderLineStatus(line.status)),
  ).length;
}

export function shouldUseReadOnlyWorkOrderView(
  paymentStatus: string | null | undefined,
): boolean {
  return String(paymentStatus ?? "").trim().toLowerCase() === "paid";
}
