import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { equipmentClassLabel } from "@/features/equipment/lib/assetProfile";
import type {
  EquipmentDirectory,
  EquipmentDirectoryRow,
  EquipmentPmState,
} from "@/features/equipment/lib/equipmentDirectory";
import { mapEquipmentAssetProfileRow } from "@/features/equipment/server/equipmentAssetProfileService";
import { isEstimateRecord } from "@/features/work-orders/lib/work-order-status";
import { customerAccountDisplayName } from "@/features/vehicles/lib/vehicleWorkspace";
import {
  extractInspectionFindings,
  latestCanonicalServiceWorkOrder,
  maintenanceCacheIsFresh,
  maintenanceItems,
  type MaintenanceSuggestionRow,
  type WorkspaceWorkOrderLineRow,
  type WorkspaceWorkOrderRow,
} from "@/features/vehicles/server/loadVehicleWorkspaceSnapshot";
import {
  normalizedState,
  TERMINAL_APPOINTMENT_STATUSES,
  workOrderDisplayStatus,
  workOrderHref,
  workOrderIsActive,
  workOrderTitle,
  type SearchWorkOrderRow,
} from "@/features/vehicles/server/searchShopVehicleRecords";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["equipment_asset_profiles"]["Row"];
type DirectoryWorkOrderRow = SearchWorkOrderRow & WorkspaceWorkOrderRow;

/** One page of the directory; the page reports `truncated` beyond this. */
export const EQUIPMENT_DIRECTORY_LIMIT = 200;
const ROW_LIMIT = 5_000;

const PROFILE_COLUMNS =
  "vehicle_id,shop_id,equipment_class,equipment_family,serial_number,pin,engine_make,engine_model,engine_serial,primary_meter,current_cycles,meters_updated_at,site_name,operating_status,mounted_on_vehicle_id,attributes,created_at,created_by,updated_at,updated_by";
const VEHICLE_COLUMNS =
  "id,customer_id,year,make,model,unit_number,engine_hours,mileage,last_service_date";
const CUSTOMER_SAFE_COLUMNS =
  "id,account_type,business_name,name,first_name,last_name,identity_name";
const WORK_ORDER_COLUMNS =
  "id,custom_id,status,record_type,approval_state,estimate_number,estimate_status,customer_id,customer_name,vehicle_id,vehicle_year,vehicle_make,vehicle_model,vehicle_submodel,vehicle_vin,vehicle_license_plate,vehicle_unit_number,vehicle_mileage,odometer_km,scheduled_at,created_at,updated_at";
const LINE_COLUMNS =
  "id,work_order_id,description,complaint,correction,hold_reason,status,line_status,approval_state,urgency,voided_at,created_at,updated_at";

/** Work orders whose status means the service was carried out. */
const SERVICED_STATES = new Set([
  "completed",
  "ready_to_invoice",
  "invoiced",
  "paid",
  "closed",
]);

export class EquipmentDirectoryError extends Error {}

function assertOk(error: { message: string } | null, what: string) {
  if (error) throw new EquipmentDirectoryError(`Unable to load ${what}.`);
}

function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    const list = map.get(value) ?? [];
    list.push(row);
    map.set(value, list);
  }
  return map;
}

function time(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Build the Equipment directory for a shop.
 *
 * The caller must already have authenticated the actor, checked a
 * shop-wide directory role and verified the Equipment entitlement.
 * Profiles (no client grants) are read with the privileged client, scoped to
 * the shop. Every operational fact is read through the caller's RLS client
 * and derived with the same helpers as the canonical vehicle workspace, so
 * the directory and Asset Health never disagree.
 */
export async function loadEquipmentDirectory(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  now?: Date;
}): Promise<EquipmentDirectory> {
  const { supabase, admin, shopId } = input;
  const now = input.now ?? new Date();

  const { data: profileData, error: profileError } = await admin
    .from("equipment_asset_profiles")
    .select(PROFILE_COLUMNS)
    .eq("shop_id", shopId)
    .order("updated_at", { ascending: false })
    .limit(EQUIPMENT_DIRECTORY_LIMIT + 1);
  assertOk(profileError, "Equipment profiles");
  const profileRows = (profileData ?? []) as ProfileRow[];
  const truncated = profileRows.length > EQUIPMENT_DIRECTORY_LIMIT;
  const profiles = profileRows
    .slice(0, EQUIPMENT_DIRECTORY_LIMIT)
    .map(mapEquipmentAssetProfileRow);
  if (!profiles.length) return { rows: [], truncated: false };

  const assetIds = profiles.map((profile) => profile.assetId);

  const { data: vehicleData, error: vehicleError } = await supabase
    .from("vehicles")
    .select(VEHICLE_COLUMNS)
    .eq("shop_id", shopId)
    .in("id", assetIds);
  assertOk(vehicleError, "assets");
  const vehicles = new Map((vehicleData ?? []).map((row) => [row.id, row]));

  const customerIds = Array.from(
    new Set(
      Array.from(vehicles.values())
        .map((row) => row.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [customersResult, workOrdersResult, inspectionsResult, bookingsResult] =
    await Promise.all([
      customerIds.length
        ? supabase
            .from("customers")
            .select(CUSTOMER_SAFE_COLUMNS)
            .eq("shop_id", shopId)
            .in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("work_orders")
        .select(WORK_ORDER_COLUMNS)
        .eq("shop_id", shopId)
        .in("vehicle_id", assetIds)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(ROW_LIMIT),
      supabase
        .from("inspections")
        .select("id,vehicle_id,summary")
        .eq("shop_id", shopId)
        .in("vehicle_id", assetIds)
        .limit(ROW_LIMIT),
      supabase
        .from("bookings")
        .select("id,vehicle_id,status,starts_at,ends_at")
        .eq("shop_id", shopId)
        .in("vehicle_id", assetIds)
        .gte("ends_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(ROW_LIMIT),
    ]);
  assertOk(customersResult.error, "accounts");
  assertOk(workOrdersResult.error, "work orders");
  assertOk(inspectionsResult.error, "inspections");
  assertOk(bookingsResult.error, "appointments");

  const customerNames = new Map(
    (
      (customersResult.data ?? []) as Array<
        { id: string } & Parameters<typeof customerAccountDisplayName>[0]
      >
    ).map((row) => [row.id, customerAccountDisplayName(row)]),
  );
  const workOrdersByAsset = groupBy(
    (workOrdersResult.data ?? []) as DirectoryWorkOrderRow[],
    (row) => row.vehicle_id,
  );
  const inspectionsByAsset = groupBy(
    inspectionsResult.data ?? [],
    (row) => row.vehicle_id,
  );
  const nextBookingByAsset = new Map<string, { starts_at: string; status: string }>();
  for (const row of bookingsResult.data ?? []) {
    if (!row.vehicle_id || TERMINAL_APPOINTMENT_STATUSES.has(normalizedState(row.status))) {
      continue;
    }
    if (!nextBookingByAsset.has(row.vehicle_id)) {
      nextBookingByAsset.set(row.vehicle_id, {
        starts_at: row.starts_at,
        status: row.status,
      });
    }
  }

  // PM: the same evidence the workspace uses — the ready maintenance
  // suggestion for the latest canonical service work order, if still fresh.
  const serviceWorkOrderByAsset = new Map<string, DirectoryWorkOrderRow>();
  for (const [assetId, rows] of workOrdersByAsset) {
    const latest = latestCanonicalServiceWorkOrder(rows);
    if (latest) serviceWorkOrderByAsset.set(assetId, latest as DirectoryWorkOrderRow);
  }
  const serviceWorkOrderIds = Array.from(serviceWorkOrderByAsset.values()).map(
    (row) => row.id,
  );
  const [suggestionsResult, linesResult] = serviceWorkOrderIds.length
    ? await Promise.all([
        supabase
          .from("maintenance_suggestions")
          .select(
            "work_order_id,vehicle_id,status,suggestions,created_at,updated_at,error_message,mileage_km",
          )
          .in("work_order_id", serviceWorkOrderIds)
          .eq("status", "ready")
          .limit(ROW_LIMIT),
        supabase
          .from("work_order_lines")
          .select(LINE_COLUMNS)
          .eq("shop_id", shopId)
          .in("work_order_id", serviceWorkOrderIds)
          .limit(ROW_LIMIT),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  assertOk(suggestionsResult.error, "maintenance status");
  assertOk(linesResult.error, "work order lines");
  const suggestionByWorkOrder = new Map(
    ((suggestionsResult.data ?? []) as MaintenanceSuggestionRow[]).map((row) => [
      row.work_order_id,
      row,
    ]),
  );
  const lines = (linesResult.data ?? []) as WorkspaceWorkOrderLineRow[];

  const rows: EquipmentDirectoryRow[] = [];
  for (const profile of profiles) {
    const vehicle = vehicles.get(profile.assetId);
    // An asset the caller cannot see through RLS is never listed.
    if (!vehicle) continue;

    const workOrders = workOrdersByAsset.get(profile.assetId) ?? [];
    const active = workOrders.find(workOrderIsActive) ?? null;
    const lastServiced = workOrders
      .filter(
        (row) =>
          !isEstimateRecord(row) &&
          SERVICED_STATES.has(normalizedState(row.status)),
      )
      .sort((a, b) => time(b.updated_at) - time(a.updated_at))[0];

    let failed = 0;
    let total = 0;
    for (const inspection of inspectionsByAsset.get(profile.assetId) ?? []) {
      for (const finding of extractInspectionFindings(inspection.summary)) {
        total += 1;
        if (finding.status === "fail") failed += 1;
      }
    }

    let pmState: EquipmentPmState = "not_evaluated";
    let dueCount = 0;
    const serviceWorkOrder = serviceWorkOrderByAsset.get(profile.assetId);
    const suggestion = serviceWorkOrder
      ? suggestionByWorkOrder.get(serviceWorkOrder.id)
      : undefined;
    if (
      serviceWorkOrder &&
      suggestion &&
      maintenanceCacheIsFresh({ cache: suggestion, workOrder: serviceWorkOrder, lines })
    ) {
      const due = maintenanceItems(suggestion);
      dueCount = due.length;
      pmState = due.some((item) => item.overdue || item.isCritical)
        ? "overdue"
        : due.length
          ? "due"
          : "ok";
    }

    const next = nextBookingByAsset.get(profile.assetId);
    rows.push({
      assetId: profile.assetId,
      href: `/equipment/${profile.assetId}`,
      unitNumber: vehicle.unit_number,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      equipmentClass: profile.equipmentClass,
      equipmentClassLabel: equipmentClassLabel(profile.equipmentClass),
      serialNumber: profile.serialNumber,
      primaryMeter: profile.primaryMeter,
      engineHours: vehicle.engine_hours,
      odometer: vehicle.mileage,
      currentCycles: profile.currentCycles,
      customerName: vehicle.customer_id
        ? customerNames.get(vehicle.customer_id) ?? null
        : null,
      siteName: profile.siteName,
      operatingStatus: profile.operatingStatus,
      openDefects: { total, failed },
      pm: { state: pmState, dueCount },
      lastServiceAt: lastServiced?.updated_at ?? vehicle.last_service_date ?? null,
      nextService: next ? { startsAt: next.starts_at, status: next.status } : null,
      activeWorkOrder: active
        ? {
            title: workOrderTitle(active),
            status: workOrderDisplayStatus(active),
            href: workOrderHref(active),
          }
        : null,
      mountedOnAssetId: profile.mountedOnAssetId,
    });
  }

  return { rows, truncated };
}
