import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { equipmentClassLabel } from "@/features/equipment/lib/assetProfile";
import { canRecordComponentWork } from "@/features/equipment/lib/components";
import { combinePmStates } from "@/features/equipment/lib/pm";
import type {
  EquipmentDirectory,
  EquipmentDirectoryRow,
} from "@/features/equipment/lib/equipmentDirectory";
import { mapEquipmentAssetProfileRow } from "@/features/equipment/server/equipmentAssetProfileService";
import {
  EquipmentEvidenceError,
  loadEquipmentEvidence,
} from "@/features/equipment/server/equipmentEvidence";
import {
  EquipmentPmError,
  loadEquipmentPmSummaries,
} from "@/features/equipment/server/equipmentPmService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  createWorkOrderHandoffHref,
  customerAccountDisplayName,
} from "@/features/vehicles/lib/vehicleWorkspace";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";
import { isEstimateRecord } from "@/features/work-orders/lib/work-order-status";
import {
  workOrderDisplayStatus,
  workOrderHref,
  workOrderIsActive,
  workOrderTitle,
} from "@/features/vehicles/server/searchShopVehicleRecords";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["equipment_asset_profiles"]["Row"];

/** One page of the directory; the page reports `truncated` beyond this. */
export const EQUIPMENT_DIRECTORY_LIMIT = 200;
const ID_CHUNK = 100;

const PROFILE_COLUMNS =
  "vehicle_id,shop_id,equipment_class,equipment_family,serial_number,pin,engine_make,engine_model,engine_serial,primary_meter,current_cycles,meters_updated_at,site_name,operating_status,mounted_on_vehicle_id,attributes,created_at,created_by,updated_at,updated_by";
const VEHICLE_COLUMNS =
  "id,customer_id,year,make,model,unit_number,engine_hours,mileage,odometer_unit,last_service_date,status";
const CUSTOMER_SAFE_COLUMNS =
  "id,account_type,business_name,name,first_name,last_name,identity_name,active,archived_at,merged_into_customer_id";

export class EquipmentDirectoryError extends Error {}

type VehicleRow = {
  id: string;
  customer_id: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  unit_number: string | null;
  engine_hours: number | null;
  mileage: string | null;
  odometer_unit: string | null;
  last_service_date: string | null;
  status: string | null;
};
type CustomerRow = {
  id: string;
  active: boolean;
  archived_at: string | null;
  merged_into_customer_id: string | null;
} & Parameters<typeof customerAccountDisplayName>[0];

/**
 * Same eligibility the vehicle workspace applies before offering new work
 * (`archived_account` / `vehicle_status` conflicts): an inactive, archived or
 * merged account, or an archived/merged/duplicate/inactive vehicle, blocks it.
 */
function canStartWorkFor(vehicle: VehicleRow, account: CustomerRow | undefined): boolean {
  if (!account || !account.active || account.archived_at || account.merged_into_customer_id) {
    return false;
  }
  const status = String(vehicle.status ?? "").trim().toLowerCase();
  return !["archived", "merged", "duplicate", "inactive"].includes(status);
}

async function inChunks<T>(
  ids: string[],
  what: string,
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK) {
    const { data, error } = await query(ids.slice(offset, offset + ID_CHUNK));
    if (error) throw new EquipmentDirectoryError(`Unable to load ${what}.`);
    rows.push(...(data ?? []));
  }
  return rows;
}

/**
 * Build the Equipment directory for a shop.
 *
 * The caller must already have authenticated the actor, checked a shop-wide
 * directory role and verified the Equipment entitlement. Profiles (no client
 * grants) are read with the privileged client, scoped to the shop. Every
 * operational fact comes through the caller's RLS client via the shared
 * Equipment evidence loader, which Asset Health also uses.
 */
export async function loadEquipmentDirectory(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  now?: Date;
}): Promise<EquipmentDirectory> {
  const { supabase, admin, shopId } = input;
  const permissions = vehicleWorkspacePermissionsForRole(input.role);

  const { data: profileData, error: profileError } = await admin
    .from("equipment_asset_profiles")
    .select(PROFILE_COLUMNS)
    .eq("shop_id", shopId)
    .order("updated_at", { ascending: false })
    .limit(EQUIPMENT_DIRECTORY_LIMIT + 1);
  if (profileError) throw new EquipmentDirectoryError("Unable to load Equipment profiles.");
  const profileRows = (profileData ?? []) as ProfileRow[];
  const truncated = profileRows.length > EQUIPMENT_DIRECTORY_LIMIT;
  const profiles = profileRows
    .slice(0, EQUIPMENT_DIRECTORY_LIMIT)
    .map(mapEquipmentAssetProfileRow);
  if (!profiles.length) return { rows: [], truncated: false };

  const vehicleRows = await inChunks<VehicleRow>(
    profiles.map((profile) => profile.assetId),
    "assets",
    (chunk) =>
      supabase.from("vehicles").select(VEHICLE_COLUMNS).eq("shop_id", shopId).in("id", chunk),
  );
  const vehicles = new Map(vehicleRows.map((row) => [row.id, row]));
  // An asset the caller cannot see through RLS is never listed or queried.
  const visibleIds = profiles
    .map((profile) => profile.assetId)
    .filter((id) => vehicles.has(id));

  const customerIds = Array.from(
    new Set(vehicleRows.map((row) => row.customer_id).filter((id): id is string => Boolean(id))),
  );
  let customers: CustomerRow[];
  let evidence: Awaited<ReturnType<typeof loadEquipmentEvidence>>;
  try {
    [customers, evidence] = await Promise.all([
      inChunks<CustomerRow>(customerIds, "accounts", (chunk) =>
        supabase
          .from("customers")
          .select(CUSTOMER_SAFE_COLUMNS)
          .eq("shop_id", shopId)
          .in("id", chunk) as unknown as PromiseLike<{
          data: CustomerRow[] | null;
          error: { message: string } | null;
        }>,
      ),
      // Work-order evidence is read privileged so roles without financial
      // visibility (parts, lead hand) see the same PM and open work.
      loadEquipmentEvidence({
        supabase,
        shopId,
        assetIds: visibleIds,
        now: input.now,
        privileged: admin,
      }),
    ]);
  } catch (error) {
    if (error instanceof EquipmentEvidenceError) {
      throw new EquipmentDirectoryError(error.message);
    }
    throw error;
  }
  const customersById = new Map(customers.map((row) => [row.id, row]));
  const customerNames = new Map(customers.map((row) => [row.id, customerAccountDisplayName(row)]));

  // Equipment PM plans (no client grants) for the visible assets only, with
  // the same meters this row displays (and Asset Health's PM panel uses).
  let pmPlans: Awaited<ReturnType<typeof loadEquipmentPmSummaries>>;
  try {
    pmPlans = await loadEquipmentPmSummaries({
      admin,
      shopId,
      assets: profiles
        .filter((profile) => vehicles.has(profile.assetId))
        .map((profile) => {
          const vehicle = vehicles.get(profile.assetId)!;
          // The odometer this row displays: the newest dated work-order
          // reading (km) wins over the undated vehicle value.
          const workOrderKm = evidence.get(profile.assetId)?.workOrderOdometerKm ?? null;
          return {
            id: profile.assetId,
            engineHours: vehicle.engine_hours,
            odometer: workOrderKm === null ? vehicle.mileage : String(workOrderKm),
            odometerUnit: workOrderKm === null ? vehicle.odometer_unit : "km",
            cycles: profile.currentCycles,
          };
        }),
      now: input.now?.getTime(),
    });
  } catch (error) {
    if (error instanceof EquipmentPmError) throw new EquipmentDirectoryError(error.message);
    throw error;
  }

  const rows: EquipmentDirectoryRow[] = [];
  for (const profile of profiles) {
    const vehicle = vehicles.get(profile.assetId);
    const facts = evidence.get(profile.assetId);
    if (!vehicle || !facts) continue;

    const active = facts.workOrders
      .slice()
      .sort((a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? ""))
      .find(workOrderIsActive);
    const findings = facts.latestInspection?.findings ?? [];
    const canCreateWorkOrder =
      permissions.canCreateWorkOrder &&
      profile.operatingStatus !== "retired" &&
      canStartWorkFor(
        vehicle,
        vehicle.customer_id ? customersById.get(vehicle.customer_id) : undefined,
      );

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
      // Same rule as the vehicle workspace: the newest dated work-order
      // reading wins over the undated vehicle master value.
      odometer:
        facts.workOrderOdometerKm === null
          ? vehicle.mileage
          : String(facts.workOrderOdometerKm),
      odometerUnit: facts.workOrderOdometerKm === null ? vehicle.odometer_unit : "km",
      currentCycles: profile.currentCycles,
      customerId: vehicle.customer_id,
      customerName: vehicle.customer_id ? customerNames.get(vehicle.customer_id) ?? null : null,
      siteName: profile.siteName,
      operatingStatus: profile.operatingStatus,
      openDefects: {
        total: findings.length,
        failed: findings.filter((finding) => finding.status === "fail").length,
      },
      // Plans and service suggestions combined; without active plans this is
      // exactly the suggestion evaluation.
      pm: {
        state: combinePmStates(pmPlans.get(profile.assetId)?.state ?? null, facts.pm.state),
        dueCount: facts.pm.items.length + (pmPlans.get(profile.assetId)?.dueCount ?? 0),
      },
      openWorkOrderCount: facts.workOrders.filter(workOrderIsActive).length,
      inspection: {
        state: !facts.latestInspection ? "none" : findings.length ? "findings" : "clear",
        recordedAt: facts.latestInspection?.recordedAt ?? null,
      },
      actions: {
        createWorkOrderHref: canCreateWorkOrder
          ? createWorkOrderHandoffHref({
              customerId: vehicle.customer_id,
              vehicleId: profile.assetId,
            })
          : null,
        recordMeterHref: canRecordComponentWork(input.role)
          ? `/equipment/${profile.assetId}#asset-meters`
          : null,
      },
      lastServiceAt: facts.lastServiceAt ?? vehicle.last_service_date ?? null,
      nextService: facts.nextBooking,
      activeWorkOrder: active
        ? {
            title: workOrderTitle(active),
            status: workOrderDisplayStatus(active),
            // Link only when the viewer's role may open this record.
            href: (isEstimateRecord(active)
              ? permissions.canViewEstimates
              : permissions.canOpenWorkOrders)
              ? workOrderHref(active)
              : null,
          }
        : null,
      mountedOnAssetId: profile.mountedOnAssetId,
    });
  }

  return { rows, truncated };
}
