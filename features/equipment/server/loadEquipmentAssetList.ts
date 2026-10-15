import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { equipmentClassLabel } from "@/features/equipment/lib/assetProfile";
import {
  IDENTITY_INDEX_MAX_ASSETS,
  type EquipmentIdentityRow,
} from "@/features/equipment/lib/equipmentDirectoryQuery";
import { UNDERCARRIAGE_PART_MEASUREMENTS } from "@/features/equipment/lib/undercarriage";
import { mapEquipmentAssetProfileRow } from "@/features/equipment/server/equipmentAssetProfileService";
import { customerAccountDisplayName } from "@/features/vehicles/lib/vehicleWorkspace";

type DB = Database;
/** Profiles per read; PostgREST caps a response at 1,000 rows. */
const WINDOW = 1_000;
const ID_CHUNK = 100;

const PROFILE_COLUMNS =
  "vehicle_id,shop_id,equipment_class,equipment_family,serial_number,pin,engine_make,engine_model,engine_serial,primary_meter,current_cycles,meters_updated_at,site_name,operating_status,mounted_on_vehicle_id,attributes,created_at,created_by,updated_at,updated_by";

export class EquipmentAssetListError extends Error {}

type VehicleRow = {
  id: string;
  customer_id: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  unit_number: string | null;
};
type CustomerRow = { id: string } & Parameters<typeof customerAccountDisplayName>[0];

async function inChunks<T>(
  ids: string[],
  what: string,
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK) {
    chunks.push(ids.slice(offset, offset + ID_CHUNK));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await query(chunk);
      if (error) throw new EquipmentAssetListError(`Unable to load ${what}.`);
      return data ?? [];
    }),
  );
  return results.flat();
}

/**
 * Identity index of a shop's Equipment assets: who they are, who owns them,
 * and their operating status — and nothing from work-order, inspection,
 * booking or PM history. It is cheap enough to read for the whole shop (up to
 * `IDENTITY_INDEX_MAX_ASSETS`), which lets the Assets list and the section
 * pages search and page every asset, and only score the page being shown.
 *
 * Profiles are read through the privileged client scoped to the shop, paged by
 * the immutable `vehicle_id`; vehicles and accounts come through the caller's
 * RLS client, so an asset the caller cannot see is never listed. Rows come back
 * newest-updated first.
 *
 * `requireUndercarriage` keeps only machines that have undercarriage
 * components, so every row links to a panel that actually renders.
 */
export async function loadEquipmentAssetList(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  requireUndercarriage?: boolean;
  /** Tests lower these. */
  maxAssets?: number;
  windowSize?: number;
}): Promise<{ rows: EquipmentIdentityRow[]; capped: boolean }> {
  const { supabase, admin, shopId } = input;
  const max = input.maxAssets ?? IDENTITY_INDEX_MAX_ASSETS;
  const windowSize = input.windowSize ?? WINDOW;
  const rows: EquipmentIdentityRow[] = [];

  let cursor: string | null = null;
  let scanned = 0;
  let capped = false;
  for (;;) {
    let query = admin
      .from("equipment_asset_profiles")
      .select(PROFILE_COLUMNS)
      .eq("shop_id", shopId)
      .order("vehicle_id", { ascending: true })
      .limit(windowSize + 1);
    if (cursor) query = query.gt("vehicle_id", cursor);
    const { data, error } = await query;
    if (error) throw new EquipmentAssetListError("Unable to load Equipment profiles.");
    const fetched = (data ?? []) as Parameters<typeof mapEquipmentAssetProfileRow>[0][];
    const more = fetched.length > windowSize;
    const window = fetched.slice(0, windowSize);
    if (!window.length) break;
    cursor = window[window.length - 1].vehicle_id;
    const profiles = window.map((row) => ({ profile: mapEquipmentAssetProfileRow(row), updatedAt: row.updated_at }));

    const vehicles = new Map(
      (
        await inChunks<VehicleRow>(profiles.map((p) => p.profile.assetId), "assets", (chunk) =>
          supabase
            .from("vehicles")
            .select("id,customer_id,year,make,model,unit_number")
            .eq("shop_id", shopId)
            .in("id", chunk),
        )
      ).map((row) => [row.id, row]),
    );
    // An asset the caller cannot see through RLS is never listed or queried.
    const visible = profiles.filter(({ profile }) => vehicles.has(profile.assetId));

    let withUndercarriage: Set<string> | null = null;
    if (input.requireUndercarriage) {
      const components = await inChunks<{ installed_vehicle_id: string | null }>(
        visible.map(({ profile }) => profile.assetId),
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

    for (const { profile, updatedAt } of visible) {
      if (withUndercarriage && !withUndercarriage.has(profile.assetId)) continue;
      const vehicle = vehicles.get(profile.assetId)!;
      rows.push({
        assetId: profile.assetId,
        updatedAt,
        unitNumber: vehicle.unit_number,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        serialNumber: profile.serialNumber,
        equipmentClass: profile.equipmentClass,
        equipmentClassLabel: equipmentClassLabel(profile.equipmentClass),
        customerId: vehicle.customer_id,
        customerName: vehicle.customer_id ? customerNames.get(vehicle.customer_id) ?? null : null,
        siteName: profile.siteName,
        operatingStatus: profile.operatingStatus,
      });
    }

    scanned += window.length;
    if (!more) break;
    if (scanned >= max) {
      capped = true;
      break;
    }
  }

  rows.sort((a, b) => {
    const byTime = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    return Number.isFinite(byTime) && byTime !== 0 ? byTime : a.assetId.localeCompare(b.assetId);
  });
  return { rows, capped };
}
