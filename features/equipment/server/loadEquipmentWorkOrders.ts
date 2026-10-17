import "server-only";
import { loadEquipmentWorkCustomerNames } from "./loadEquipmentWorkCustomerNames";

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
const PROFILE_BATCH = 1_000;
const ASSET_ID_CHUNK = 100;
const RESULT_LIMIT = 100;

export class EquipmentWorkOrdersError extends Error {}

function assetLabel(row: WorkOrderRow): string {
  const machine = [row.vehicle_year, row.vehicle_make, row.vehicle_model].filter(Boolean).join(" ");
  const unit = row.vehicle_unit_number?.trim();
  if (unit && machine) return `Unit ${unit} · ${machine}`;
  if (unit) return `Unit ${unit}`;
  return machine || "Equipment asset";
}

function compareNewest(a: WorkOrderRow, b: WorkOrderRow): number {
  if (a.created_at === null && b.created_at !== null) return 1;
  if (a.created_at !== null && b.created_at === null) return -1;
  if (a.created_at !== null && b.created_at !== null) {
    const dateOrder = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (dateOrder !== 0) return dateOrder;
  }
  return b.id.localeCompare(a.id);
}

async function loadEquipmentAssetIds(input: {
  admin: SupabaseClient<DB>;
  shopId: string;
}): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += PROFILE_BATCH) {
    const { data, error } = await input.admin
      .from("equipment_asset_profiles")
      .select("vehicle_id")
      .eq("shop_id", input.shopId)
      .order("vehicle_id", { ascending: true })
      .range(offset, offset + PROFILE_BATCH - 1);
    if (error) throw new EquipmentWorkOrdersError("Unable to load Equipment assets.");
    const batch = (data ?? []).map((row) => row.vehicle_id);
    ids.push(...batch);
    if (batch.length < PROFILE_BATCH) break;
  }
  return ids;
}

/**
 * Return the newest canonical work orders attached to Equipment assets.
 *
 * The page caller has already authenticated a shop-wide Equipment role and
 * checked the Equipment entitlement. This loader uses the privileged server
 * client only after that boundary, scopes every query to the authorized shop,
 * and selects a deliberately non-financial work-order projection. Equipment
 * profile ids constrain the canonical work-order query up front so ordinary
 * vehicle history is never scanned just to classify Equipment work.
 */
export async function loadEquipmentWorkOrders(input: {
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
}): Promise<EquipmentWorkOrders> {
  const permissions = vehicleWorkspacePermissionsForRole(input.role);
  const assetIds = await loadEquipmentAssetIds({ admin: input.admin, shopId: input.shopId });
  if (!assetIds.length) return { rows: [], truncated: false };

  const candidates: WorkOrderRow[] = [];
  for (let offset = 0; offset < assetIds.length; offset += ASSET_ID_CHUNK) {
    const chunk = assetIds.slice(offset, offset + ASSET_ID_CHUNK);
    const { data, error } = await input.admin
      .from("work_orders")
      .select(WORK_ORDER_COLUMNS)
      .eq("shop_id", input.shopId)
      .in("vehicle_id", chunk)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(RESULT_LIMIT + 1);
    if (error) throw new EquipmentWorkOrdersError("Unable to load work orders.");
    candidates.push(...((data ?? []) as WorkOrderRow[]));
  }

  candidates.sort(compareNewest);
  const accepted = candidates.slice(0, RESULT_LIMIT + 1);
  const displayed = accepted.slice(0, RESULT_LIMIT);
  const customerNames = await loadEquipmentWorkCustomerNames(input.admin, input.shopId, displayed);
  const rows = displayed.map((row) => {
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
      customerName: row.customer_name?.trim() || (row.customer_id ? customerNames.get(row.customer_id) ?? null : null),
      createdAt: row.created_at,
      scheduledAt: row.scheduled_at,
    };
  });

  return {
    rows,
    truncated: accepted.length > RESULT_LIMIT,
  };
}
