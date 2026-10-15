import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { equipmentClassLabel, type AssetOperatingStatus } from "@/features/equipment/lib/assetProfile";
import { UNDERCARRIAGE_PART_MEASUREMENTS } from "@/features/equipment/lib/undercarriage";
import { EQUIPMENT_DIRECTORY_LIMIT } from "@/features/equipment/server/loadEquipmentDirectory";
import { mapEquipmentAssetProfileRow } from "@/features/equipment/server/equipmentAssetProfileService";
import { customerAccountDisplayName } from "@/features/vehicles/lib/vehicleWorkspace";

type DB = Database;
const ID_CHUNK = 100;

export class EquipmentAssetListError extends Error {}

export type EquipmentAssetListRow = {
  assetId: string;
  unitNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  equipmentClassLabel: string;
  customerName: string | null;
  siteName: string | null;
  operatingStatus: AssetOperatingStatus;
};

async function inChunks<T>(
  ids: string[],
  what: string,
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK) {
    const { data, error } = await query(ids.slice(offset, offset + ID_CHUNK));
    if (error) throw new EquipmentAssetListError(`Unable to load ${what}.`);
    rows.push(...(data ?? []));
  }
  return rows;
}

/**
 * Identity-only asset list for section pages whose engines have no fleet-level
 * read model. Same sources and scoping as the directory (profiles through the
 * privileged client, vehicles and accounts through the caller's RLS client), but
 * none of the work-order, inspection, booking or PM history reads.
 *
 * `requireUndercarriage` keeps only machines that have undercarriage
 * components, so every row links to a panel that actually renders.
 */
export async function loadEquipmentAssetList(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  requireUndercarriage?: boolean;
}): Promise<{ rows: EquipmentAssetListRow[]; truncated: boolean }> {
  const { supabase, admin, shopId } = input;

  const { data: profileData, error: profileError } = await admin
    .from("equipment_asset_profiles")
    .select(
      "vehicle_id,shop_id,equipment_class,equipment_family,serial_number,pin,engine_make,engine_model,engine_serial,primary_meter,current_cycles,meters_updated_at,site_name,operating_status,mounted_on_vehicle_id,attributes,created_at,created_by,updated_at,updated_by",
    )
    .eq("shop_id", shopId)
    .order("updated_at", { ascending: false })
    .limit(EQUIPMENT_DIRECTORY_LIMIT + 1);
  if (profileError) throw new EquipmentAssetListError("Unable to load Equipment profiles.");
  const profileRows = profileData ?? [];
  const truncated = profileRows.length > EQUIPMENT_DIRECTORY_LIMIT;
  const profiles = profileRows.slice(0, EQUIPMENT_DIRECTORY_LIMIT).map(mapEquipmentAssetProfileRow);
  if (!profiles.length) return { rows: [], truncated: false };

  type VehicleRow = {
    id: string;
    customer_id: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    unit_number: string | null;
  };
  const vehicles = new Map(
    (
      await inChunks<VehicleRow>(profiles.map((p) => p.assetId), "assets", (chunk) =>
        supabase
          .from("vehicles")
          .select("id,customer_id,year,make,model,unit_number")
          .eq("shop_id", shopId)
          .in("id", chunk),
      )
    ).map((row) => [row.id, row]),
  );
  // An asset the caller cannot see through RLS is never listed or queried.
  const visibleIds = profiles.map((p) => p.assetId).filter((id) => vehicles.has(id));

  let withUndercarriage: Set<string> | null = null;
  if (input.requireUndercarriage) {
    const components = await inChunks<{ installed_vehicle_id: string | null }>(
      visibleIds,
      "components",
      (chunk) =>
        admin
          .from("equipment_components")
          .select("installed_vehicle_id")
          .eq("shop_id", shopId)
          .in("installed_vehicle_id", chunk)
          .in("component_type", Object.keys(UNDERCARRIAGE_PART_MEASUREMENTS))
          .limit(1_000),
    );
    withUndercarriage = new Set(
      components.map((row) => row.installed_vehicle_id).filter((id): id is string => Boolean(id)),
    );
  }

  const customerIds = Array.from(
    new Set(
      Array.from(vehicles.values())
        .map((row) => row.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  type CustomerRow = { id: string } & Parameters<typeof customerAccountDisplayName>[0];
  const customerNames = new Map(
    (
      await inChunks<CustomerRow>(customerIds, "accounts", (chunk) =>
        supabase
          .from("customers")
          .select("id,account_type,business_name,name,first_name,last_name,identity_name")
          .eq("shop_id", shopId)
          .in("id", chunk) as unknown as PromiseLike<{
          data: CustomerRow[] | null;
          error: { message: string } | null;
        }>,
      )
    ).map((row) => [row.id, customerAccountDisplayName(row)]),
  );

  const rows: EquipmentAssetListRow[] = [];
  for (const profile of profiles) {
    const vehicle = vehicles.get(profile.assetId);
    if (!vehicle) continue;
    if (withUndercarriage && !withUndercarriage.has(profile.assetId)) continue;
    rows.push({
      assetId: profile.assetId,
      unitNumber: vehicle.unit_number,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      equipmentClassLabel: equipmentClassLabel(profile.equipmentClass),
      customerName: vehicle.customer_id ? customerNames.get(vehicle.customer_id) ?? null : null,
      siteName: profile.siteName,
      operatingStatus: profile.operatingStatus,
    });
  }
  return { rows, truncated };
}
