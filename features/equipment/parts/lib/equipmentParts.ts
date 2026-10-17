import type { PartsRequestStage } from "@/features/parts/lib/status-display";

export type EquipmentPartsRow = {
  id: string;
  workOrderId: string;
  workOrderLabel: string;
  assetId: string;
  stage: PartsRequestStage;
  createdAt: string | null;
  items: {
    id: string;
    description: string | null;
    requested: number | null;
    received: number | null;
    reserved: number | null;
  }[];
};

export function equipmentPartsPage(
  rows: EquipmentPartsRow[],
  query: string,
  stage: string,
  requestedPage: number,
) {
  const search = query.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (stage === "all" || row.stage === stage) &&
      (!search ||
        [
          row.workOrderLabel,
          row.id,
          ...row.items.map((item) => item.description),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const page = Math.min(
    pageCount,
    Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1),
  );
  return {
    rows: filtered.slice((page - 1) * 25, page * 25),
    page,
    pageCount,
    total: filtered.length,
  };
}
