import type { DispatchBoardSnapshot } from "@/features/dispatch/lib/contracts";
import { paginate } from "@/features/equipment/lib/equipmentDirectoryQuery";
import type { EquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";

/** The canonical snapshot is unpaginated. Classify and filter before paging. */
export function equipmentDispatchPage(
  board: DispatchBoardSnapshot,
  shopId: string,
  assets: Array<[string, string]>,
  filters: EquipmentQueueFilters,
) {
  const names = new Map(assets);
  const needle = filters.q.toLowerCase();
  const visits = board.visits.filter((visit) => {
    const asset = visit.vehicle?.id;
    return (
      visit.shopId === shopId &&
      !!asset &&
      names.has(asset) &&
      (!filters.asset || asset === filters.asset) &&
      (!filters.status || visit.status === filters.status) &&
      (!needle ||
        [visit.workOrderNumber, visit.customer?.name, names.get(asset)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle))
    );
  });
  return paginate(visits, filters.page);
}
