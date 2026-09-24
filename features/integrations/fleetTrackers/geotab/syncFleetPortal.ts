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

// Supabase's PostgREST layer caps a single response at max_rows (1000 by
// default here; see supabase/config.toml). A fleet with more enrolled units
// or synced links than that would silently see only the first page unless
// every unbounded query here is paged through explicitly.
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { data: rows, error: null };
    from += PAGE_SIZE;
  }
}

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
  // Captured before any Geotab call or write. Used below to make sure an
  // older, still-running sync can never delete a link a newer, overlapping
  // sync just wrote (see the stale-link reconciliation guard further down).
  const runStartedAt = new Date().toISOString();

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
  // Paged: a fleet can have more enrolled units than a single page holds.
  const { data: enrollments, error: enrollmentError } = await fetchAllRows<{
    vehicle_id: string;
  }>((from, to) =>
    supabase
      .from("fleet_vehicles")
      .select("vehicle_id")
      .eq("fleet_id", connection.fleet_id)
      .eq("shop_id", connection.shop_id)
      .eq("active", true)
      .range(from, to),
  );

  if (enrollmentError) {
    const message = `Sync connected but looking up enrolled vehicles failed: ${enrollmentError.message}`;
    await markConnectionError(supabase, connection.id, message);
    return { ok: false, error: message };
  }

  const enrolledVehicleIds = enrollments.map((row) => row.vehicle_id);
  let shopVehicles: { id: string; vin: string | null }[] = [];
  if (enrolledVehicleIds.length) {
    const { data: vehicleRows, error: vehiclesError } = await fetchAllRows<{
      id: string;
      vin: string | null;
    }>((from, to) =>
      supabase
        .from("vehicles")
        .select("id, vin")
        .eq("shop_id", connection.shop_id)
        .in("id", enrolledVehicleIds)
        .not("vin", "is", null)
        .range(from, to),
    );

    if (vehiclesError) {
      const message = `Sync connected but looking up vehicles to match failed: ${vehiclesError.message}`;
      await markConnectionError(supabase, connection.id, message);
      return { ok: false, error: message };
    }
    shopVehicles = vehicleRows;
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
  // should stop appearing as synced. Only consider links last touched
  // strictly before this run started: if an overlapping, newer sync already
  // wrote a link (its own upsert always advances last_synced_at to that
  // run's own "now"), this older run must not treat it as stale and delete
  // it out from under the newer run.
  const currentVendorVehicleIds = new Set(vehicles.map((v) => v.vendorVehicleId));
  const { data: existingLinks, error: existingLinksError } = await supabase
    .from("fleet_portal_tracker_vehicle_links")
    .select("id, vendor_vehicle_id")
    .eq("connection_id", connection.id)
    .lt("last_synced_at", runStartedAt);

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
