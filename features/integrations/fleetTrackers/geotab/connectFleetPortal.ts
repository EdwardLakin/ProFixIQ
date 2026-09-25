import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { authenticateGeotab } from "./client";
import { describeGeotabError } from "./connect";

type DB = Database;

export type GeotabFleetConnectInput = {
  database: string;
  username: string;
  password: string;
  /**
   * Optional non-default Geotab authentication host (e.g. a regional or
   * government deployment). Defaults to my.geotab.com when omitted.
   */
  server?: string;
};

export type GeotabFleetConnectResult =
  | { ok: true; connectionId: string }
  | { ok: false; error: string };

export async function connectFleetPortalGeotab(
  supabase: SupabaseClient<DB>,
  params: GeotabFleetConnectInput & {
    fleetId: string;
    shopId: string;
    actorId: string;
  },
): Promise<GeotabFleetConnectResult> {
  const database = params.database.trim();
  const username = params.username.trim();
  const password = params.password;
  const server = params.server?.trim() || undefined;

  if (!database || !username || !password) {
    return { ok: false, error: "Database, username, and password are all required." };
  }

  try {
    await authenticateGeotab({ database, username, password, server });
  } catch (error) {
    return {
      ok: false,
      error: `Could not authenticate with Geotab: ${describeGeotabError(error)}`,
    };
  }

  const { data, error } = await supabase
    .from("fleet_portal_tracker_connections")
    .upsert(
      {
        fleet_id: params.fleetId,
        shop_id: params.shopId,
        vendor: "geotab",
        status: "active",
        credentials: { database, username, password, ...(server ? { server } : {}) },
        created_by: params.actorId,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "fleet_id,vendor" },
    )
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to save connection." };
  }

  return { ok: true, connectionId: data.id };
}
