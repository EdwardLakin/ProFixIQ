import type { ReactNode } from "react";

export type WorkOrderDisplayMap = Record<
  string,
  { id: string; custom_id: string | null }
>;

type TechQueueWorkOrder = {
  id: string;
  custom_id: string | null;
  type: string | null;
};

export function buildTechQueueWorkOrderMap(
  rows: readonly TechQueueWorkOrder[],
): WorkOrderDisplayMap {
  return Object.fromEntries(
    rows
      .filter((row) => row.type !== "historical_import")
      .map((row) => [
        row.id,
        { id: row.id, custom_id: row.custom_id ?? null },
      ]),
  );
}

export function TechQueueWorkOrderLabel({
  workOrderId,
  workOrderMap,
}: {
  workOrderId: string | null;
  workOrderMap: WorkOrderDisplayMap;
}): ReactNode {
  const customId = workOrderId
    ? workOrderMap[workOrderId]?.custom_id
    : null;

  if (customId) return customId;
  if (workOrderId) return `WO #${workOrderId.slice(0, 8)}`;
  return "Work order";
}
