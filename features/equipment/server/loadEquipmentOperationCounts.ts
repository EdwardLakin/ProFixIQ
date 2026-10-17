import "server-only";
import { loadEquipmentWorkQueue } from "@/features/equipment/server/loadEquipmentWorkQueue";
import { parseEquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";
import type { EquipmentOperationCount } from "@/features/equipment/lib/equipmentOperationCounts";

/** The exact same filters and bounded read model as each card's destination. */
export async function loadEquipmentOperationCounts(
  input: Omit<Parameters<typeof loadEquipmentWorkQueue>[0], "filters">,
): Promise<{
  approvals: EquipmentOperationCount;
  parts: EquipmentOperationCount;
}> {
  const count = async (
    params: Record<string, string>,
    href: string,
  ): Promise<EquipmentOperationCount> => {
    try {
      const queue = await loadEquipmentWorkQueue({
        ...input,
        filters: parseEquipmentQueueFilters(params),
      });
      return { value: queue.summary.records, partial: queue.partial, href };
    } catch {
      return { value: null, partial: false, href };
    }
  };
  const [approvals, parts] = await Promise.all([
    count(
      { kind: "estimate", status: "sent" },
      "/equipment/work-orders?kind=estimate&status=sent",
    ),
    count(
      { kind: "work_order", stage: "waiting_parts" },
      "/equipment/work-orders?kind=work_order&stage=waiting_parts",
    ),
  ]);
  return { approvals, parts };
}
