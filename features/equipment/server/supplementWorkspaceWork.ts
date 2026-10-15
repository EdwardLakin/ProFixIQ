import type {
  ActiveWorkSummary,
  VehicleTimelineEvent,
  VehicleWorkspaceSnapshot,
} from "@/features/vehicles/lib/vehicleWorkspace";
import { isEstimateRecord } from "@/features/work-orders/lib/work-order-status";
import type { EvidenceWorkOrderRow } from "@/features/equipment/server/equipmentEvidence";
import {
  workOrderDisplayStatus,
  workOrderHref,
  workOrderIsActive,
  workOrderTitle,
} from "@/features/vehicles/server/searchShopVehicleRecords";

type WorkOrderEvidence = EvidenceWorkOrderRow;

function isWorkOrderSource(sourceType: string): boolean {
  return sourceType === "work_order";
}

function reference(row: WorkOrderEvidence) {
  return {
    sourceType: "work_order" as const,
    sourceId: row.id,
    sourceLabel: workOrderTitle(row),
    href: workOrderHref(row),
  };
}

/**
 * Fill the asset page's Active work and Service history from the Equipment
 * work-order evidence when the canonical workspace snapshot saw no work orders
 * at all.
 *
 * The snapshot reads work orders, invoices, payments and quote lines through
 * the caller's RLS client. Roles without financial visibility (parts, lead
 * hand) get none of them back, while the Equipment evidence reads a
 * non-financial work-order projection for them. Without this, the directory
 * would show an open work order and the asset page would say there is none.
 *
 * Only that case is touched: when the snapshot already contains any work-order
 * item, or the evidence is empty, the snapshot is returned unchanged, so
 * roles that already see their work orders are unaffected. Nothing financial
 * is added — only the work-order title, status, link and dates.
 */
export function supplementSnapshotWithWorkOrders(
  snapshot: VehicleWorkspaceSnapshot,
  workOrders: WorkOrderEvidence[],
): VehicleWorkspaceSnapshot {
  if (!workOrders.length) return snapshot;
  const snapshotSawWork =
    snapshot.activeWork.some((item) => isWorkOrderSource(item.reference.sourceType)) ||
    snapshot.recentTimeline.some((event) => isWorkOrderSource(event.reference.sourceType));
  if (snapshotSawWork) return snapshot;

  const activeWork: ActiveWorkSummary[] = workOrders
    .filter(workOrderIsActive)
    .map((row) => ({
      kind: isEstimateRecord(row) ? ("estimate" as const) : ("work_order" as const),
      title: workOrderTitle(row),
      status: workOrderDisplayStatus(row),
      detail: row.approval_state ?? null,
      occurredAt: row.updated_at ?? row.created_at,
      reference: reference(row),
    }));

  const events: VehicleTimelineEvent[] = workOrders
    .map((row) => ({
      kind: isEstimateRecord(row) ? ("estimate" as const) : ("work_order" as const),
      title: workOrderTitle(row),
      detail: workOrderDisplayStatus(row) ? workOrderDisplayStatus(row).replace(/_/g, " ") : null,
      occurredAt: row.updated_at ?? row.created_at ?? "",
      reference: reference(row),
    }))
    .filter((event) => event.occurredAt);

  const byNewest = (a: { occurredAt: string | null }, b: { occurredAt: string | null }) =>
    Date.parse(b.occurredAt ?? "") - Date.parse(a.occurredAt ?? "");
  return {
    ...snapshot,
    activeWork: [...snapshot.activeWork, ...activeWork].sort(byNewest),
    recentTimeline: [...snapshot.recentTimeline, ...events].sort(byNewest),
  };
}
