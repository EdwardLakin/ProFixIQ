import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  ASSET_OPERATING_STATUSES,
  ASSET_PRIMARY_METERS,
  equipmentClassLabel,
  type AssetIdentity,
  type AssetOperatingStatus,
  type AssetPrimaryMeter,
  type EquipmentAssetProfile,
  type EquipmentAssetProfileMutation,
  type EquipmentAssetRecord,
} from "@/features/equipment/lib/assetProfile";
import { offRoadProfileByValue } from "@/features/inspections/lib/inspection/offRoadInspectionCatalog";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["equipment_asset_profiles"]["Row"];

const PROFILE_COLUMNS =
  "vehicle_id,shop_id,equipment_class,equipment_family,serial_number,pin,engine_make,engine_model,engine_serial,primary_meter,current_cycles,meters_updated_at,site_name,operating_status,mounted_on_vehicle_id,attributes,created_at,created_by,updated_at,updated_by";

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

export function mapEquipmentAssetProfileRow(row: ProfileRow): EquipmentAssetProfile {
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
 * Authorize the caller's access to an asset with the same rules as the
 * canonical vehicle workspace: the caller-scoped (RLS) client must see the
 * vehicle in the caller's shop, and assigned-work-only roles (mechanics)
 * must also see at least one work order for it through work-order RLS.
 * Missing, cross-shop and unassigned assets are indistinguishable (null).
 */
export async function authorizeEquipmentAsset(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
}): Promise<AssetIdentity | null> {
  const { data: vehicle, error } = await input.supabase
    .from("vehicles")
    .select(
      "id,shop_id,unit_number,year,make,model,vin,engine_hours,mileage,odometer_unit,customer_id",
    )
    .eq("shop_id", input.shopId)
    .eq("id", input.assetId)
    .maybeSingle();
  if (error) throw new EquipmentAssetProfileError("Unable to load asset.", 500);
  if (!vehicle) return null;

  if (vehicleWorkspacePermissionsForRole(input.role).isAssignedWorkOnly) {
    const { data: assigned, error: workOrderError } = await input.supabase
      .from("work_orders")
      .select("id")
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", input.assetId)
      .limit(1);
    if (workOrderError) {
      throw new EquipmentAssetProfileError("Unable to load asset.", 500);
    }
    if (!assigned?.length) return null;
  }

  return {
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
  };
}

async function readProfile(
  admin: SupabaseClient<DB>,
  shopId: string,
  assetId: string,
): Promise<EquipmentAssetProfile | null> {
  const { data, error } = await admin
    .from("equipment_asset_profiles")
    .select(PROFILE_COLUMNS)
    .eq("shop_id", shopId)
    .eq("vehicle_id", assetId)
    .maybeSingle();
  if (error) {
    throw new EquipmentAssetProfileError("Unable to load Equipment profile.", 500);
  }
  return data ? mapEquipmentAssetProfileRow(data as ProfileRow) : null;
}

/**
 * Load the authorized asset plus its optional Equipment profile. The profile
 * table has no client grants, so it is read with the privileged client only
 * after `authorizeEquipmentAsset` has admitted the caller.
 */
export async function loadEquipmentAssetRecord(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
}): Promise<EquipmentAssetRecord | null> {
  const asset = await authorizeEquipmentAsset(input);
  if (!asset) return null;
  return { asset, profile: await readProfile(input.admin, input.shopId, input.assetId) };
}

function rpcFailure(error: { code?: string | null; message: string }): never {
  switch (error.code) {
    case "P0002":
      throw new EquipmentAssetProfileError("Asset not found.", 404);
    case "40001":
      throw new EquipmentAssetProfileError(
        "The asset's meters changed since you opened this form. Reload and try again.",
        409,
      );
    case "23514":
      throw new EquipmentAssetProfileError(
        /mounted on each other/i.test(error.message)
          ? "Two assets cannot be mounted on each other."
          : "The asset or host asset is not in this shop.",
        409,
      );
    case "22023":
    case "22P02":
      throw new EquipmentAssetProfileError("The Equipment profile is invalid.", 400);
    default:
      console.error("[equipment/asset-profile] save failed", {
        code: error.code ?? null,
        message: error.message,
      });
      throw new EquipmentAssetProfileError("The Equipment profile could not be saved.", 500);
  }
}

/**
 * Create or update the Equipment profile for an asset in the caller's shop.
 *
 * Authorization (shop scope, role, mechanic assignment) and host-asset scope
 * are resolved with the caller's RLS client first. The profile and any
 * deliberately edited canonical meters are then written atomically by the
 * service-role-only `save_equipment_asset_profile` RPC, which locks the asset
 * row, rejects stale meter edits, and enforces mount integrity.
 */
export async function saveEquipmentAssetProfile(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  actorUserId: string;
  assetId: string;
  mutation: EquipmentAssetProfileMutation;
}): Promise<EquipmentAssetRecord> {
  const asset = await authorizeEquipmentAsset(input);
  if (!asset) throw new EquipmentAssetProfileError("Asset not found.", 404);

  const { mutation } = input;
  if (mutation.mountedOnAssetId) {
    const host = await authorizeEquipmentAsset({ ...input, assetId: mutation.mountedOnAssetId });
    if (!host) throw new EquipmentAssetProfileError("Mounted-on asset not found.", 400);
  }

  const { error } = await input.admin.rpc("save_equipment_asset_profile", {
    p_shop_id: input.shopId,
    p_vehicle_id: input.assetId,
    p_actor_user_id: input.actorUserId,
    p_profile: {
      equipment_class: mutation.equipmentClass,
      equipment_family: mutation.equipmentFamily,
      serial_number: mutation.serialNumber,
      pin: mutation.pin,
      engine_make: mutation.engineMake,
      engine_model: mutation.engineModel,
      engine_serial: mutation.engineSerial,
      primary_meter: mutation.primaryMeter,
      current_cycles: mutation.currentCycles,
      site_name: mutation.siteName,
      operating_status: mutation.operatingStatus,
      mounted_on_vehicle_id: mutation.mountedOnAssetId,
      attributes: mutation.attributes,
    },
    p_set_engine_hours: mutation.engineHours !== undefined,
    p_engine_hours: mutation.engineHours?.value ?? undefined,
    p_expected_engine_hours: mutation.engineHours?.expected ?? undefined,
    p_set_odometer: mutation.odometer !== undefined,
    p_odometer: mutation.odometer?.value ?? undefined,
    p_expected_odometer: mutation.odometer?.expected ?? undefined,
  });
  if (error) rpcFailure(error);

  const saved = await loadEquipmentAssetRecord(input);
  if (!saved) throw new EquipmentAssetProfileError("Asset not found.", 404);
  return saved;
}
