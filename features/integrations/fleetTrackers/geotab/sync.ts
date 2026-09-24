import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { authenticateGeotab } from "./client";
import { fetchGeotabVehicles } from "./adapter";
import { describeGeotabError } from "./connect";

type DB = Database;
type ConnectionRow = DB["public"]["Tables"]["fleet_tracker_connections"]["Row"];

export type GeotabSyncResult =
  | {
      ok: true;
      vehicleCount: number;
      matchedCount: number;
      vehicles: { name: string; vin: string | null }[];
    }
  | { ok: false; error: string };

function readCredentials(
  credentials: Json,
): { database: string; username: string; password: string } | null {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }
  const record = credentials as Record<string, Json>;
  const database = record.database;
  const username = record.username;
  const password = record.password;
  if (
    typeof database !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string"
  ) {
    return null;
  }
  return { database, username, password };
}

export async function syncGeotabConnection(
  supabase: SupabaseClient<DB>,
  connection: Pick<ConnectionRow, "id" | "shop_id" | "credentials">,
): Promise<GeotabSyncResult> {
  const credentials = readCredentials(connection.credentials);
  if (!credentials) {
    const error = "Stored Geotab credentials are malformed.";
    await supabase
      .from("fleet_tracker_connections")
      .update({ status: "error", last_error: error })
      .eq("id", connection.id);
    return { ok: false, error };
  }

  let vehicles;
  try {
    const session = await authenticateGeotab(credentials);
    vehicles = await fetchGeotabVehicles(session);
  } catch (error) {
    const message = `Could not sync with Geotab: ${describeGeotabError(error)}`;
    await supabase
      .from("fleet_tracker_connections")
      .update({ status: "error", last_error: message })
      .eq("id", connection.id);
    return { ok: false, error: message };
  }

  const vins = vehicles.map((v) => v.vin).filter((vin): vin is string => Boolean(vin));

  const { data: matchingVehicles } = vins.length
    ? await supabase
        .from("vehicles")
        .select("id, vin")
        .eq("shop_id", connection.shop_id)
        .in("vin", vins)
    : { data: [] as { id: string; vin: string | null }[] };

  const vehicleIdByVin = new Map(
    (matchingVehicles ?? [])
      .filter((v): v is { id: string; vin: string } => Boolean(v.vin))
      .map((v) => [v.vin, v.id]),
  );

  const now = new Date().toISOString();
  let matchedCount = 0;

  const linkRows = vehicles.map((vehicle) => {
    const matchedVehicleId = vehicle.vin ? vehicleIdByVin.get(vehicle.vin) ?? null : null;
    if (matchedVehicleId) matchedCount += 1;

    return {
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
      .from("fleet_tracker_vehicle_links")
      .upsert(linkRows, { onConflict: "connection_id,vendor_vehicle_id" });

    if (linkError) {
      const message = `Sync connected but saving vehicles failed: ${linkError.message}`;
      await supabase
        .from("fleet_tracker_connections")
        .update({ status: "error", last_error: message })
        .eq("id", connection.id);
      return { ok: false, error: message };
    }
  }

  await supabase
    .from("fleet_tracker_connections")
    .update({ status: "active", last_error: null, last_sync_at: now })
    .eq("id", connection.id);

  return {
    ok: true,
    vehicleCount: vehicles.length,
    matchedCount,
    vehicles: vehicles.map((v) => ({ name: v.name, vin: v.vin })),
  };
}
