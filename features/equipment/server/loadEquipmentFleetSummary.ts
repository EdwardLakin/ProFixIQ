import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { combinePmStates } from "@/features/equipment/lib/pm";
import {
  accumulateFleetSummary,
  emptyFleetSummary,
  type EquipmentFleetSummary,
  type FleetSignalRow,
} from "@/features/equipment/lib/equipmentDashboard";
import { mapEquipmentAssetProfileRow } from "@/features/equipment/server/equipmentAssetProfileService";
import { loadEquipmentEvidence } from "@/features/equipment/server/equipmentEvidence";
import { loadEquipmentPmSummaries } from "@/features/equipment/server/equipmentPmService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { workOrderIsActive } from "@/features/vehicles/server/searchShopVehicleRecords";

type DB = Database;

/** Profiles per window. Matches the Assets directory page size. */
const WINDOW = 200;
/** Most assets one dashboard load will scan; beyond this the summary reports `partial`. */
export const FLEET_SUMMARY_MAX_ASSETS = 2_000;

const ID_CHUNK = 100;

const PROFILE_COLUMNS =
  "vehicle_id,shop_id,equipment_class,equipment_family,serial_number,pin,engine_make,engine_model,engine_serial,primary_meter,current_cycles,meters_updated_at,site_name,operating_status,mounted_on_vehicle_id,attributes,created_at,created_by,updated_at,updated_by";
const VEHICLE_COLUMNS = "id,year,make,model,unit_number,engine_hours,mileage,odometer_unit";

export class EquipmentFleetSummaryError extends Error {}

type VehicleRow = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  unit_number: string | null;
  engine_hours: number | null;
  mileage: string | null;
  odometer_unit: string | null;
};

async function inChunks<T>(
  ids: string[],
  what: string,
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK) {
    const { data, error } = await query(ids.slice(offset, offset + ID_CHUNK));
    if (error) throw new EquipmentFleetSummaryError(`Unable to load ${what}.`);
    rows.push(...(data ?? []));
  }
  return rows;
}

/**
 * Shop-wide Equipment summary.
 *
 * Walks every profile of the shop in `vehicle_id` order (an immutable key, so a
 * profile edited mid-scan cannot move between windows), and for each window
 * derives the same per-asset signals the Assets directory shows from the same
 * shared engines: canonical evidence (inspections, bookings, PM suggestions),
 * Equipment PM plans, and operating status. It then folds them into running
 * counts, keeping nothing else between windows. This is a dashboard-owned scan;
 * `loadEquipmentDirectory` is not involved.
 *
 * The caller must already have authenticated the actor, checked a shop-wide
 * directory role and verified the Equipment entitlement.
 */
export async function loadEquipmentFleetSummary(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  now?: Date;
  maxAssets?: number;
  /** Profiles per window; tests lower this. */
  windowSize?: number;
}): Promise<EquipmentFleetSummary> {
  const { supabase, admin, shopId } = input;
  const windowSize = input.windowSize ?? WINDOW;
  const max = input.maxAssets ?? FLEET_SUMMARY_MAX_ASSETS;
  const summary = emptyFleetSummary();

  let cursor: string | null = null;
  let scanned = 0;
  for (;;) {
    let query = admin
      .from("equipment_asset_profiles")
      .select(PROFILE_COLUMNS)
      .eq("shop_id", shopId)
      .order("vehicle_id", { ascending: true })
      .limit(windowSize + 1);
    if (cursor) query = query.gt("vehicle_id", cursor);
    const { data, error } = await query;
    if (error) throw new EquipmentFleetSummaryError("Unable to load Equipment profiles.");
    const fetched = (data ?? []) as Parameters<typeof mapEquipmentAssetProfileRow>[0][];
    const more = fetched.length > windowSize;
    const profiles = fetched.slice(0, windowSize).map(mapEquipmentAssetProfileRow);
    if (!profiles.length) return summary;
    cursor = profiles[profiles.length - 1].assetId;

    const vehicles = new Map(
      (
        await inChunks<VehicleRow>(profiles.map((p) => p.assetId), "assets", (chunk) =>
          supabase.from("vehicles").select(VEHICLE_COLUMNS).eq("shop_id", shopId).in("id", chunk),
        )
      ).map((row) => [row.id, row]),
    );
    // An asset the caller cannot see through RLS is never counted or queried.
    const visible = profiles.filter((profile) => vehicles.has(profile.assetId));
    const visibleIds = visible.map((profile) => profile.assetId);

    // Work-order evidence is read privileged so roles without financial
    // visibility (parts, lead hand) get the same PM and open work as everyone.
    const evidence = await loadEquipmentEvidence({
      supabase,
      shopId,
      assetIds: visibleIds,
      now: input.now,
      privileged: admin,
    });
    const pmPlans = await loadEquipmentPmSummaries({
        admin,
        shopId,
        assets: visible.map((profile) => {
          const vehicle = vehicles.get(profile.assetId)!;
          // The odometer the directory shows: newest dated work-order reading wins.
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

    const rows: FleetSignalRow[] = [];
    for (const profile of visible) {
      const vehicle = vehicles.get(profile.assetId)!;
      const facts = evidence.get(profile.assetId);
      if (!facts) continue;
      const findings = facts.latestInspection?.findings ?? [];
      rows.push({
        assetId: profile.assetId,
        href: `/equipment/${profile.assetId}`,
        unitNumber: vehicle.unit_number,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        operatingStatus: profile.operatingStatus,
        openDefects: {
          total: findings.length,
          failed: findings.filter((finding) => finding.status === "fail").length,
        },
        inspection: {
          state: !facts.latestInspection ? "none" : findings.length ? "findings" : "clear",
          recordedAt: facts.latestInspection?.recordedAt ?? null,
        },
        // Plans and service suggestions combined, as the directory does.
        pm: { state: combinePmStates(pmPlans.get(profile.assetId)?.state ?? null, facts.pm.state) },
        openWorkOrderCount: facts.workOrders.filter(workOrderIsActive).length,
        nextService: facts.nextBooking,
      });
    }
    accumulateFleetSummary(summary, rows, input.now);

    scanned += profiles.length;
    if (!more) return summary;
    if (scanned >= max) {
      summary.partial = true;
      return summary;
    }
  }
}
