import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  ASSET_OPERATING_STATUSES,
  ASSET_PRIMARY_METERS,
  equipmentClassLabel,
  type AssetOperatingStatus,
  type AssetPrimaryMeter,
  type EquipmentAssetProfile,
  type EquipmentAssetProfileMutation,
  type EquipmentAssetRecord,
} from "@/features/equipment/lib/assetProfile";
import { offRoadProfileByValue } from "@/features/inspections/lib/inspection/offRoadInspectionCatalog";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["equipment_asset_profiles"]["Row"];
type ProfileInsert = DB["public"]["Tables"]["equipment_asset_profiles"]["Insert"];

const PROFILE_COLUMNS =
  "vehicle_id,shop_id,equipment_class,equipment_family,serial_number,pin,engine_make,engine_model,engine_serial,primary_meter,current_cycles,meters_updated_at,site_name,operating_status,mounted_on_vehicle_id,attributes,updated_at";

export class EquipmentAssetProfileError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

function toAttributes(value: unknown): EquipmentAssetProfile["attributes"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: EquipmentAssetProfile["attributes"] = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (
      raw === null ||
      typeof raw === "string" ||
      typeof raw === "boolean" ||
      (typeof raw === "number" && Number.isFinite(raw))
    ) {
      out[key] = raw;
    }
  }
  return out;
}

export function mapEquipmentAssetProfileRow(
  row: Pick<ProfileRow, keyof ProfileRow>,
): EquipmentAssetProfile {
  const family =
    offRoadProfileByValue(row.equipment_class)?.family ??
    (row.equipment_family as EquipmentAssetProfile["equipmentFamily"]);
  return {
    assetId: row.vehicle_id,
    equipmentClass: row.equipment_class,
    equipmentClassLabel: equipmentClassLabel(row.equipment_class),
    equipmentFamily: family,
    serialNumber: row.serial_number,
    pin: row.pin,
    engineMake: row.engine_make,
    engineModel: row.engine_model,
    engineSerial: row.engine_serial,
    primaryMeter: (ASSET_PRIMARY_METERS as readonly string[]).includes(row.primary_meter)
      ? (row.primary_meter as AssetPrimaryMeter)
      : "hours",
    currentCycles: row.current_cycles,
    metersUpdatedAt: row.meters_updated_at,
    siteName: row.site_name,
    operatingStatus: (ASSET_OPERATING_STATUSES as readonly string[]).includes(
      row.operating_status,
    )
      ? (row.operating_status as AssetOperatingStatus)
      : "operational",
    mountedOnAssetId: row.mounted_on_vehicle_id,
    attributes: toAttributes(row.attributes),
    updatedAt: row.updated_at,
  };
}

/**
 * Load the canonical asset plus its optional Equipment profile. Uses the
 * caller's RLS-bound client with an explicit shop filter, so cross-shop and
 * missing assets are indistinguishable (null).
 */
export async function loadEquipmentAssetRecord(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  assetId: string;
}): Promise<EquipmentAssetRecord | null> {
  const { data: vehicle, error: vehicleError } = await input.supabase
    .from("vehicles")
    .select(
      "id,shop_id,unit_number,year,make,model,vin,engine_hours,mileage,odometer_unit,customer_id",
    )
    .eq("shop_id", input.shopId)
    .eq("id", input.assetId)
    .maybeSingle();
  if (vehicleError) {
    throw new EquipmentAssetProfileError("Unable to load asset.", 500);
  }
  if (!vehicle) return null;

  const { data: profile, error: profileError } = await input.supabase
    .from("equipment_asset_profiles")
    .select(PROFILE_COLUMNS)
    .eq("shop_id", input.shopId)
    .eq("vehicle_id", input.assetId)
    .maybeSingle();
  if (profileError) {
    throw new EquipmentAssetProfileError("Unable to load Equipment profile.", 500);
  }

  return {
    asset: {
      id: vehicle.id,
      unitNumber: vehicle.unit_number,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      vin: vehicle.vin,
      engineHours: vehicle.engine_hours,
      odometer: vehicle.mileage,
      odometerUnit: vehicle.odometer_unit,
      customerId: vehicle.customer_id,
    },
    profile: profile ? mapEquipmentAssetProfileRow(profile as ProfileRow) : null,
  };
}

/**
 * Create or update the Equipment profile for an asset in the caller's shop.
 *
 * - The asset (and any host asset it is mounted on) is resolved through the
 *   caller's RLS client with an explicit shop filter before any write.
 * - Canonical meters (engine hours / odometer) are written to `vehicles` via
 *   the caller's client so existing vehicle policies still decide that write.
 * - The profile row is written with the privileged client; the table's
 *   trigger independently re-checks that profile, asset and host share a shop.
 */
export async function saveEquipmentAssetProfile(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  actorUserId: string;
  assetId: string;
  mutation: EquipmentAssetProfileMutation;
  now?: Date;
}): Promise<EquipmentAssetRecord> {
  const existing = await loadEquipmentAssetRecord({
    supabase: input.supabase,
    shopId: input.shopId,
    assetId: input.assetId,
  });
  if (!existing) throw new EquipmentAssetProfileError("Asset not found.", 404);

  const { mutation } = input;
  if (mutation.mountedOnAssetId) {
    const { data: host, error: hostError } = await input.supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", input.shopId)
      .eq("id", mutation.mountedOnAssetId)
      .maybeSingle();
    if (hostError) throw new EquipmentAssetProfileError("Unable to load host asset.", 500);
    if (!host) throw new EquipmentAssetProfileError("Mounted-on asset not found.", 400);

    const { data: hostProfile, error: hostProfileError } = await input.supabase
      .from("equipment_asset_profiles")
      .select("mounted_on_vehicle_id")
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", mutation.mountedOnAssetId)
      .maybeSingle();
    if (hostProfileError) {
      throw new EquipmentAssetProfileError("Unable to load host asset.", 500);
    }
    if (hostProfile?.mounted_on_vehicle_id === input.assetId) {
      throw new EquipmentAssetProfileError(
        "Two assets cannot be mounted on each other.",
        400,
      );
    }
  }

  const nowIso = (input.now ?? new Date()).toISOString();
  const meterPatch: DB["public"]["Tables"]["vehicles"]["Update"] = {};
  if (
    mutation.engineHours !== undefined &&
    mutation.engineHours !== existing.asset.engineHours
  ) {
    meterPatch.engine_hours = mutation.engineHours;
  }
  if (mutation.odometer !== undefined && mutation.odometer !== existing.asset.odometer) {
    meterPatch.mileage = mutation.odometer;
  }

  const metersChanged =
    Object.keys(meterPatch).length > 0 ||
    mutation.currentCycles !== (existing.profile?.currentCycles ?? null);

  if (Object.keys(meterPatch).length > 0) {
    const { data: updated, error: meterError } = await input.supabase
      .from("vehicles")
      .update(meterPatch)
      .eq("shop_id", input.shopId)
      .eq("id", input.assetId)
      .select("id");
    if (meterError || !updated?.length) {
      throw new EquipmentAssetProfileError(
        "Asset meters could not be updated.",
        meterError ? 500 : 409,
      );
    }
  }

  const row: ProfileInsert = {
    vehicle_id: input.assetId,
    shop_id: input.shopId,
    equipment_class: mutation.equipmentClass,
    equipment_family: mutation.equipmentFamily,
    serial_number: mutation.serialNumber,
    pin: mutation.pin,
    engine_make: mutation.engineMake,
    engine_model: mutation.engineModel,
    engine_serial: mutation.engineSerial,
    primary_meter: mutation.primaryMeter,
    current_cycles: mutation.currentCycles,
    meters_updated_at: metersChanged
      ? nowIso
      : (existing.profile?.metersUpdatedAt ?? null),
    site_name: mutation.siteName,
    operating_status: mutation.operatingStatus,
    mounted_on_vehicle_id: mutation.mountedOnAssetId,
    attributes: mutation.attributes,
    updated_by: input.actorUserId,
    ...(existing.profile ? {} : { created_by: input.actorUserId }),
  };

  const { error: upsertError } = await input.admin
    .from("equipment_asset_profiles")
    .upsert(row, { onConflict: "vehicle_id" });
  if (upsertError) {
    console.error("[equipment/asset-profile] save failed", {
      code: upsertError.code ?? null,
      message: upsertError.message,
    });
    throw new EquipmentAssetProfileError(
      upsertError.code === "23514"
        ? "The asset or host asset is not in this shop."
        : "The Equipment profile could not be saved.",
      upsertError.code === "23514" ? 409 : 500,
    );
  }

  const saved = await loadEquipmentAssetRecord({
    supabase: input.supabase,
    shopId: input.shopId,
    assetId: input.assetId,
  });
  if (!saved) throw new EquipmentAssetProfileError("Asset not found.", 404);
  return saved;
}
