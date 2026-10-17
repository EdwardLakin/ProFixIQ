import "server-only";
import { loadEquipmentWorkCustomerNames } from "./loadEquipmentWorkCustomerNames";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  EQUIPMENT_DIRECTORY_ROLES,
  equipmentAssetTitle,
} from "@/features/equipment/lib/equipmentDirectory";
import {
  filterEquipmentWorkQueue,
  type EquipmentQueueFilters,
  type EquipmentQueueRow,
  type EquipmentWorkQueue,
} from "@/features/equipment/lib/equipmentWorkQueue";
import { loadEquipmentAssetList } from "@/features/equipment/server/loadEquipmentAssetList";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";
import { isEstimateRecord } from "@/features/work-orders/lib/work-order-status";
import {
  workOrderTitle,
  workOrderHref,
  workOrderDisplayStatus,
  workOrderIsActive,
  type SearchWorkOrderRow,
} from "@/features/vehicles/server/searchShopVehicleRecords";

const COLUMNS =
  "id,custom_id,status,record_type,estimate_number,estimate_status,customer_id,customer_name,vehicle_id,vehicle_year,vehicle_make,vehicle_model,vehicle_submodel,vehicle_vin,vehicle_license_plate,vehicle_unit_number,vehicle_mileage,odometer_km,scheduled_at,created_at,updated_at";
const WINDOW = 500;
const CHUNK = 100;
const SCAN_LIMIT = 20_000;

/** Equipment-only, non-financial read model. The page authenticates and checks entitlement first. */
export async function loadEquipmentWorkQueueProjection(input: {
  supabase: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  shopId: string;
  role: CanonicalRole;
  filters: EquipmentQueueFilters;
}): Promise<
  Pick<EquipmentWorkQueue, "assets" | "statuses" | "partial"> & {
    rows: EquipmentQueueRow[];
  }
> {
  if (!(EQUIPMENT_DIRECTORY_ROLES as readonly string[]).includes(input.role))
    throw new Error("Equipment queue access denied.");
  const index = await loadEquipmentAssetList(input);
  const assets = index.rows.map((row): [string, string] => [
    row.assetId,
    equipmentAssetTitle(row),
  ]);
  const byId = new Map(index.rows.map((row) => [row.assetId, row]));
  // Narrow by an authorized Equipment asset before history reads, never accept arbitrary vehicle IDs.
  const ids = index.rows
    .filter(
      (row) => !input.filters.asset || row.assetId === input.filters.asset,
    )
    .map((row) => row.assetId);
  const records: SearchWorkOrderRow[] = [];
  let partial = index.capped;
  outer: for (let start = 0; start < ids.length; start += CHUNK) {
    for (let offset = 0; ; offset += WINDOW) {
      const { data, error } = await input.admin
        .from("work_orders")
        .select(COLUMNS)
        .eq("shop_id", input.shopId)
        .in("vehicle_id", ids.slice(start, start + CHUNK))
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(offset, offset + WINDOW - 1);
      if (error) throw new Error("Unable to load Equipment work queue.");
      const batch = (data ?? []) as SearchWorkOrderRow[];
      const remaining = SCAN_LIMIT - records.length;
      records.push(...batch.slice(0, remaining));
      if (
        batch.length > remaining ||
        (records.length === SCAN_LIMIT &&
          (batch.length === WINDOW || start + CHUNK < ids.length))
      ) {
        partial = true;
        break outer;
      }
      if (batch.length < WINDOW) break;
    }
  }
  records.sort((a, b) => {
    const at = Date.parse(a.created_at ?? "") || 0;
    const bt = Date.parse(b.created_at ?? "") || 0;
    return bt - at || b.id.localeCompare(a.id);
  });
  const customerNames = await loadEquipmentWorkCustomerNames(input.admin, input.shopId, records);
  const permissions = vehicleWorkspacePermissionsForRole(input.role);
  const rows: EquipmentQueueRow[] = records.flatMap((row) => {
    const asset = row.vehicle_id ? byId.get(row.vehicle_id) : undefined;
    if (!asset) return [];
    const estimate = isEstimateRecord(row);
    const status = workOrderDisplayStatus(row);
    return [
      {
        id: row.id,
        title: workOrderTitle(row),
        status,
        statusLabel: status,
        summaryStatus: row.status,
        href: (
          estimate
            ? permissions.canViewEstimates
            : permissions.canOpenWorkOrders
        )
          ? estimate ? workOrderHref(row) : `/equipment/work-orders/${row.id}`
          : null,
        assetId: asset.assetId,
        assetHref: `/equipment/${asset.assetId}`,
        assetLabel: equipmentAssetTitle(asset),
        customerName: row.customer_name?.trim() || (row.customer_id ? customerNames.get(row.customer_id) ?? null : null),
        createdAt: row.created_at,
        scheduledAt: row.scheduled_at,
        kind: estimate ? "estimate" : "work_order",
        active: workOrderIsActive(row),
      },
    ];
  });
  return {
    rows,
    assets,
    statuses: [...new Set(rows.map((row) => row.status))].sort(),
    partial,
  };
}

/** Preserve the queue's existing filtering, counts and pagination contract. */
export async function loadEquipmentWorkQueue(
  input: Parameters<typeof loadEquipmentWorkQueueProjection>[0],
): Promise<EquipmentWorkQueue> {
  const projection = await loadEquipmentWorkQueueProjection(input);
  return {
    ...projection,
    ...filterEquipmentWorkQueue(projection.rows, input.filters),
  };
}
