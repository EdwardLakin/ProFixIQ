import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DB,
  MaintenanceSuggestionItem,
  WorkOrderHistoryRow,
} from "./types";

export type VehicleMaintenanceHistorySummary = {
  lastCompletedAt: string | null;
  lastCompletedMileageKm: number | null;
  historyMatchSource:
    | MaintenanceSuggestionItem["historyMatchSource"]
    | null;
};

type GetHistoryOpts = {
  supabase: SupabaseClient<DB>;
  vehicleId: string;
  shopId: string;
  serviceCode: string;
  menuItemId?: string | null;
  label: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCompletedLike(status: string | null | undefined): boolean {
  const value = (status ?? "").toLowerCase();
  return value === "completed" || value === "invoiced" || value === "ready_to_invoice";
}

function pickNewest(
  current: VehicleMaintenanceHistorySummary,
  candidate: VehicleMaintenanceHistorySummary,
): VehicleMaintenanceHistorySummary {
  if (!candidate.lastCompletedAt) return current;
  if (!current.lastCompletedAt) return candidate;

  return new Date(candidate.lastCompletedAt).getTime() >
    new Date(current.lastCompletedAt).getTime()
    ? candidate
    : current;
}

export async function getVehicleMaintenanceHistory(
  opts: GetHistoryOpts,
): Promise<VehicleMaintenanceHistorySummary> {
  const { supabase, vehicleId, serviceCode, menuItemId, label } = opts;

  const { data, error } = await supabase
    .from("work_order_lines")
    .select(
      "id, vehicle_id, work_order_id, service_code, menu_item_id, description, odometer_km, created_at, line_status, status",
    )
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as WorkOrderHistoryRow[];
  let summary: VehicleMaintenanceHistorySummary = {
    lastCompletedAt: null,
    lastCompletedMileageKm: null,
    historyMatchSource: null,
  };

  const normalizedLabel = normalizeText(label);

  for (const row of rows) {
    if (!isCompletedLike(row.line_status ?? row.status)) continue;

    if (row.service_code && row.service_code === serviceCode) {
      summary = pickNewest(summary, {
        lastCompletedAt: row.created_at ?? null,
        lastCompletedMileageKm: row.odometer_km ?? null,
        historyMatchSource: "service_code",
      });
      continue;
    }

    if (menuItemId && row.menu_item_id && row.menu_item_id === menuItemId) {
      summary = pickNewest(summary, {
        lastCompletedAt: row.created_at ?? null,
        lastCompletedMileageKm: row.odometer_km ?? null,
        historyMatchSource: "shop_map_menu_item",
      });
      continue;
    }

    const normalizedDescription = normalizeText(row.description);
    if (
      normalizedLabel.length > 0 &&
      normalizedDescription.length > 0 &&
      normalizedDescription.includes(normalizedLabel)
    ) {
      summary = pickNewest(summary, {
        lastCompletedAt: row.created_at ?? null,
        lastCompletedMileageKm: row.odometer_km ?? null,
        historyMatchSource: "text_fallback",
      });
    }
  }

  return summary;
}
