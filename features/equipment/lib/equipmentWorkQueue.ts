import { matchesWorkOrderSummaryFilter, type WorkOrderSummaryFilter } from "@/features/work-orders/lib/workOrderListFilters";
import type { EquipmentWorkOrderRow } from "@/features/equipment/lib/equipmentWorkOrders";
import {
  paginate,
  type PageInfo,
} from "@/features/equipment/lib/equipmentDirectoryQuery";

export type EquipmentQueueRow = EquipmentWorkOrderRow & {
  kind: "work_order" | "estimate";
  active: boolean;
  summaryStatus?: string | null;
};
export type EquipmentQueueFilters = {
  q: string;
  asset: string;
  kind: "" | "work_order" | "estimate";
  activity: "" | "active" | "closed";
  status: string;
  stage?: Exclude<WorkOrderSummaryFilter, "at_risk"> | "";
  page: number;
};
export type EquipmentWorkQueue = {
  rows: EquipmentQueueRow[];
  info: PageInfo;
  summary: {
    records: number;
    workOrders: number;
    estimates: number;
    active: number;
  };
  assets: Array<[string, string]>;
  statuses: string[];
  partial: boolean;
};

export function parseEquipmentQueueFilters(
  params: Record<string, string | string[] | undefined>,
): EquipmentQueueFilters {
  const value = (key: string) => {
    const raw = params[key];
    return (Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")).trim();
  };
  const kind = value("kind");
  const activity = value("activity");
  const stage = value("stage");
  const page = Number.parseInt(value("page"), 10);
  return {
    q: value("q").slice(0, 100),
    asset: value("asset").slice(0, 64),
    kind: kind === "work_order" || kind === "estimate" ? kind : "",
    activity: activity === "active" || activity === "closed" ? activity : "",
    stage: stage === "ready_to_work" || stage === "waiting_parts" || stage === "ready_to_invoice" ? stage : "",
    status: value("status").slice(0, 80),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

export function equipmentQueueQuery(
  filters: EquipmentQueueFilters,
  page = filters.page,
): string {
  const query = new URLSearchParams();
  for (const key of ["q", "asset", "kind", "activity", "status", "stage"] as const) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  return query.size ? `?${query}` : "";
}

/** Filter the authorized Equipment projection before counts and pagination. */
export function filterEquipmentWorkQueue(
  rows: EquipmentQueueRow[],
  filters: EquipmentQueueFilters,
): Pick<EquipmentWorkQueue, "rows" | "info" | "summary"> {
  const needle = filters.q.toLowerCase();
  const matched = rows.filter(
    (row) =>
      (!filters.stage || (row.kind === "work_order" && matchesWorkOrderSummaryFilter({ status: row.summaryStatus }, filters.stage))) &&
      (!filters.asset || row.assetId === filters.asset) &&
      (!filters.kind || row.kind === filters.kind) &&
      (!filters.status || row.status === filters.status) &&
      (!filters.activity || row.active === (filters.activity === "active")) &&
      (!needle ||
        [row.title, row.assetLabel, row.customerName]
          .filter(Boolean)
          .join("\n")
          .toLowerCase()
          .includes(needle)),
  );
  const { items, info } = paginate(matched, filters.page);
  return {
    rows: items,
    info,
    summary: {
      records: matched.length,
      workOrders: matched.filter((row) => row.kind === "work_order").length,
      estimates: matched.filter((row) => row.kind === "estimate").length,
      active: matched.filter((row) => row.active).length,
    },
  };
}
