import "server-only";
import { loadEquipmentWorkQueueProjection } from "@/features/equipment/server/loadEquipmentWorkQueue";
import {
  filterEquipmentWorkQueue,
  parseEquipmentQueueFilters,
} from "@/features/equipment/lib/equipmentWorkQueue";
import type { EquipmentOperationCount } from "@/features/equipment/lib/equipmentOperationCounts";

/** Read the authorized bounded projection once; reuse the destination predicates. */
export async function loadEquipmentOperationCounts(
  input: Omit<
    Parameters<typeof loadEquipmentWorkQueueProjection>[0],
    "filters"
  >,
): Promise<{
  approvals: EquipmentOperationCount;
  parts: EquipmentOperationCount;
}> {
  const approvalsHref = "/equipment/work-orders?kind=estimate&status=sent";
  const partsHref =
    "/equipment/work-orders?kind=work_order&stage=waiting_parts";
  try {
    const projection = await loadEquipmentWorkQueueProjection({
      ...input,
      filters: parseEquipmentQueueFilters({}),
    });
    const count = (
      params: Record<string, string>,
      href: string,
    ): EquipmentOperationCount => ({
      value: filterEquipmentWorkQueue(
        projection.rows,
        parseEquipmentQueueFilters(params),
      ).summary.records,
      partial: projection.partial,
      href,
    });
    return {
      approvals: count({ kind: "estimate", status: "sent" }, approvalsHref),
      parts: count({ kind: "work_order", stage: "waiting_parts" }, partsHref),
    };
  } catch {
    return {
      approvals: { value: null, partial: false, href: approvalsHref },
      parts: { value: null, partial: false, href: partsHref },
    };
  }
}
