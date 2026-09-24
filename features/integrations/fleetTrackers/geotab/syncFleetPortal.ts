import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { authenticateGeotab } from "./client";
import { fetchGeotabVehicles } from "./adapter";
import { describeGeotabError } from "./connect";

type DB = Database;
type ConnectionRow =
  DB["public"]["Tables"]["fleet_portal_tracker_connections"]["Row"];

export type GeotabFleetSyncResult =
  | {
      ok: true;
      vehicleCount: number;
      matchedCount: number;
      vehicles: { name: string; vin: string | null }[];
    }
  | { ok: false; error: string };

function readCredentials(
  credentials: Json,
): { database: string; username: string; password: string; server?: string } | null {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }
  const record = credentials as Record<string, Json>;
  const database = record.database;
  const username = record.username;
  const password = record.password;
  const server = record.server;
  if (
    typeof database !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string"
  ) {
    return null;
  }
  return { database, username, password, server: typeof server === "string" ? server : undefined };
}

/**
 * Matches the vehicles_shop_normalized_vin_idx expression
 * (upper(regexp_replace(vin, '[^A-Za-z0-9]', '', 'g'))) so matching lines up
 * with how VINs are already normalized elsewhere in the schema.
 */
function normalizeVinForMatch(vin: string): string {
  return vin.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function markConnectionError(
  supabase: SupabaseClient<DB>,
  connectionId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("fleet_portal_tracker_connections")
    .update({ status: "error", last_error: message })
    .eq("id", connectionId);
}

export async function syncFleetPortalGeotabConnection(
  supabase: SupabaseClient<DB>,
  connection: Pick<ConnectionRow, "id" | "fleet_id" | "shop_id" | "credentials">,
): Promise<GeotabFleetSyncResult> {
  const credentials = readCredentials(connection.credentials);
  if (!credentials) {
    const error = "Stored Geotab credentials are malformed.";
    await markConnectionError(supabase, connection.id, error);
    return { ok: false, error };
  }

  let vehicles;
  try {
    const session = await authenticateGeotab(credentials);
    vehicles = await fetchGeotabVehicles(session);
  } catch (error) {
    const message = `Could not sync with Geotab: ${describeGeotabError(error)}`;
    await markConnectionError(supabase, connection.id, message);
    return { ok: false, error: message };
  }

  // Match only against vehicles enrolled in this Fleet workspace, not every
  // vehicle in the shop -- a shop can service multiple, unrelated fleets.
  const { data: enrollments, error: enrollmentError } = await supabase
    .from("fleet_vehicles")
    .select("vehicle_id")
    .eq("fleet_id", connection.fleet_id)
    .eq("shop_id", connection.shop_id)
    .eq("active", true);

  if (enrollmentError) {
    const message = `Sync connected but looking up enrolled vehicles failed: ${enrollmentError.message}`;
    await markConnectionError(supabase, connection.id, message);
    return { ok: false, error: message };
  }

  const enrolledVehicleIds = (enrollments ?? []).map((row) => row.vehicle_id);
  let shopVehicles: { id: string; vin: string | null }[] = [];
  if (enrolledVehicleIds.length) {
    const { data: vehicleRows, error: vehiclesError } = await supabase
      .from("vehicles")
      .select("id, vin")
      .eq("shop_id", connection.shop_id)
      .in("id", enrolledVehicleIds)
      .not("vin", "is", null);

    if (vehiclesError) {
      const message = `Sync connected but looking up vehicles to match failed: ${vehiclesError.message}`;
      await markConnectionError(supabase, connection.id, message);
      return { ok: false, error: message };
    }
    shopVehicles = vehicleRows ?? [];
  }

  const idsByNormalizedVin = new Map<string, string[]>();
  for (const shopVehicle of shopVehicles) {
    if (!shopVehicle.vin) continue;
    const normalized = normalizeVinForMatch(shopVehicle.vin);
    if (!normalized) continue;
    const existing = idsByNormalizedVin.get(normalized);
    if (existing) existing.push(shopVehicle.id);
    else idsByNormalizedVin.set(normalized, [shopVehicle.id]);
  }

  const now = new Date().toISOString();
  let matchedCount = 0;

  const linkRows = vehicles.map((vehicle) => {
    const normalized = vehicle.vin ? normalizeVinForMatch(vehicle.vin) : "";
    const candidates = normalized ? idsByNormalizedVin.get(normalized) : undefined;
    // An ambiguous VIN (more than one enrolled vehicle sharing it) is left
    // unmatched rather than nondeterministically picking one.
    const matchedVehicleId = candidates?.length === 1 ? candidates[0] : null;
    if (matchedVehicleId) matchedCount += 1;

    return {
      fleet_id: connection.fleet_id,
      shop_id: connection.shop_id,
      connection_id: connection.id,
      vendor_vehicle_id: vehicle.vendorVehicleId,
      vehicle_id: matchedVehicleId,
      vendor_name: vehicle.name,
      vendor_vin: vehicle.vin,
      last_synced_at: now,
    };
  });

  if (linkRows.length) {
    const { error: linkError } = await supabase
      .from("fleet_portal_tracker_vehicle_links")
      .upsert(linkRows, { onConflict: "connection_id,vendor_vehicle_id" });

    if (linkError) {
      const message = `Sync connected but saving vehicles failed: ${linkError.message}`;
      await markConnectionError(supabase, connection.id, message);
      return { ok: false, error: message };
    }
  }

  // Devices Geotab no longer returns (deleted, transferred, deactivated)
  // should stop appearing as synced.
  const currentVendorVehicleIds = new Set(vehicles.map((v) => v.vendorVehicleId));
  const { data: existingLinks, error: existingLinksError } = await supabase
    .from("fleet_portal_tracker_vehicle_links")
    .select("id, vendor_vehicle_id")
    .eq("connection_id", connection.id);

  if (existingLinksError) {
    const message = `Sync connected but reconciling stale vehicles failed: ${existingLinksError.message}`;
    await markConnectionError(supabase, connection.id, message);
    return { ok: false, error: message };
  }

  const staleLinkIds = (existingLinks ?? [])
    .filter((link) => !currentVendorVehicleIds.has(link.vendor_vehicle_id))
    .map((link) => link.id);

  if (staleLinkIds.length) {
    const { error: deleteError } = await supabase
      .from("fleet_portal_tracker_vehicle_links")
      .delete()
      .in("id", staleLinkIds);

    if (deleteError) {
      const message = `Sync connected but removing stale vehicles failed: ${deleteError.message}`;
      await markConnectionError(supabase, connection.id, message);
      return { ok: false, error: message };
    }
  }

  const { error: statusError } = await supabase
    .from("fleet_portal_tracker_connections")
    .update({ status: "active", last_error: null, last_sync_at: now })
    .eq("id", connection.id);

  if (statusError) {
    return {
      ok: false,
      error: `Vehicles synced, but recording sync status failed: ${statusError.message}`,
    };
  }

  return {
    ok: true,
    vehicleCount: vehicles.length,
    matchedCount,
    vehicles: vehicles.map((v) => ({ name: v.name, vin: v.vin })),
  };
}
