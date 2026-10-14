import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import type { EquipmentWorkOrders } from "@/features/equipment/lib/equipmentWorkOrders";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { isEstimateRecord } from "@/features/work-orders/lib/work-order-status";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";
import {
  workOrderDisplayStatus,
  workOrderHref,
  workOrderTitle,
  type SearchWorkOrderRow,
} from "@/features/vehicles/server/searchShopVehicleRecords";

type DB = Database;

type WorkOrderRow = SearchWorkOrderRow;

const WORK_ORDER_COLUMNS =
  "id,custom_id,status,record_type,estimate_number,estimate_status,customer_id,customer_name,vehicle_id,vehicle_year,vehicle_make,vehicle_model,vehicle_submodel,vehicle_vin,vehicle_license_plate,vehicle_unit_number,vehicle_mileage,odometer_km,scheduled_at,created_at,updated_at";
const WORK_ORDER_BATCH = 200;
const RESULT_LIMIT = 100;

export class EquipmentWorkOrdersError extends Error {}

function assetLabel(row: WorkOrderRow): string {
  const machine = [row.vehicle_year, row.vehicle_make, row.vehicle_model].filter(Boolean).join(" ");
  const unit = row.vehicle_unit_number?.trim();
  if (unit && machine) return `Unit ${unit} · ${machine}`;
  if (unit) return `Unit ${unit}`;
  return machine || "Equipment asset";
}

/**
 * Return the newest canonical work orders whose visible vehicle has an
 * Equipment profile. The caller has already authenticated a shop-wide
 * Equipment role and checked entitlement. Work orders come through the
 * caller's RLS client; the privileged profile lookup only classifies already
 * visible work-order vehicle ids as Equipment assets.
 */
export async function loadEquipmentWorkOrders(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
}): Promise<EquipmentWorkOrders> {
  const permissions = vehicleWorkspacePermissionsForRole(input.role);
  const accepted: WorkOrderRow[] = [];
  let offset = 0;
  let exhausted = false;

  while (!exhausted && accepted.length <= RESULT_LIMIT) {
    const { data, error } = await input.supabase
      .from("work_orders")
      .select(WORK_ORDER_COLUMNS)
      .eq("shop_id", input.shopId)
      .not("vehicle_id", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + WORK_ORDER_BATCH - 1);
    if (error) throw new EquipmentWorkOrdersError("Unable to load work orders.");

    const batch = (data ?? []) as WorkOrderRow[];
    exhausted = batch.length < WORK_ORDER_BATCH;
    offset += batch.length;
    if (!batch.length) break;

    const vehicleIds = Array.from(
      new Set(batch.map((row) => row.vehicle_id).filter((id): id is string => Boolean(id))),
    );
    if (!vehicleIds.length) continue;

    const { data: profiles, error: profileError } = await input.admin
      .from("equipment_asset_profiles")
      .select("vehicle_id")
      .eq("shop_id", input.shopId)
      .in("vehicle_id", vehicleIds);
    if (profileError) throw new EquipmentWorkOrdersError("Unable to classify Equipment work orders.");

    const equipmentIds = new Set((profiles ?? []).map((row) => row.vehicle_id));
    for (const row of batch) {
      if (row.vehicle_id && equipmentIds.has(row.vehicle_id)) accepted.push(row);
      if (accepted.length > RESULT_LIMIT) break;
    }
  }

  const rows = accepted.slice(0, RESULT_LIMIT).map((row) => {
    const status = workOrderDisplayStatus(row);
    const canOpen = isEstimateRecord(row)
      ? permissions.canViewEstimates
      : permissions.canOpenWorkOrders;
    return {
      id: row.id,
      title: workOrderTitle(row),
      status,
      statusLabel: status,
      href: canOpen ? workOrderHref(row) : null,
      assetId: row.vehicle_id!,
      assetHref: `/equipment/${row.vehicle_id}`,
      assetLabel: assetLabel(row),
      customerName: row.customer_name?.trim() || null,
      createdAt: row.created_at,
      scheduledAt: row.scheduled_at,
    };
  });

  return {
    rows,
    truncated: accepted.length > RESULT_LIMIT,
  };
}
