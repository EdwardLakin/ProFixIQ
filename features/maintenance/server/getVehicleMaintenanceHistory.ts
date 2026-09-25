import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DB,
  MaintenanceSuggestionItem,
  WorkOrderHistoryRow,
} from "./types";
import {
  canonicalizeServiceCode,
  descriptionMatchesService,
} from "./serviceCatalog";

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
      "id, vehicle_id, work_order_id, service_code, menu_item_id, description, odometer_km, created_at, punched_out_at, line_status, status, work_orders!work_order_lines_work_order_id_fkey(odometer_km)",
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

  for (const row of rows) {
    if (!isCompletedLike(row.line_status ?? row.status)) continue;

    // When the work was finished, and the mileage it was done at. Lines
    // rarely carry their own odometer, so fall back to the work order's.
    const completedAt = row.punched_out_at ?? row.created_at ?? null;
    const workOrder = Array.isArray(row.work_orders)
      ? row.work_orders[0]
      : row.work_orders;
    const completedMileageKm =
      row.odometer_km ?? workOrder?.odometer_km ?? null;

    let historyMatchSource: VehicleMaintenanceHistorySummary["historyMatchSource"] =
      null;
    if (
      row.service_code &&
      canonicalizeServiceCode(row.service_code) === serviceCode
    ) {
      historyMatchSource = "service_code";
    } else if (menuItemId && row.menu_item_id && row.menu_item_id === menuItemId) {
      historyMatchSource = "shop_map_menu_item";
    } else if (descriptionMatchesService(row.description, serviceCode, label)) {
      historyMatchSource = "text_fallback";
    }

    if (!historyMatchSource) continue;

    summary = pickNewest(summary, {
      lastCompletedAt: completedAt,
      lastCompletedMileageKm: completedMileageKm,
      historyMatchSource,
    });
  }

  return summary;
}
