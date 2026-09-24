import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { authenticateGeotab, GeotabApiError } from "./client";

type DB = Database;

export type GeotabConnectInput = {
  database: string;
  username: string;
  password: string;
  /**
   * Optional non-default Geotab authentication host (e.g. a regional or
   * government deployment). Defaults to my.geotab.com when omitted.
   */
  server?: string;
};

export type GeotabConnectResult =
  | { ok: true; connectionId: string }
  | { ok: false; error: string };

export function describeGeotabError(error: unknown): string {
  if (error instanceof GeotabApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export async function connectGeotab(
  supabase: SupabaseClient<DB>,
  params: GeotabConnectInput & { shopId: string; actorId: string },
): Promise<GeotabConnectResult> {
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
    .from("fleet_tracker_connections")
    .upsert(
      {
        shop_id: params.shopId,
        vendor: "geotab",
        status: "active",
        credentials: { database, username, password, ...(server ? { server } : {}) },
        created_by: params.actorId,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "shop_id,vendor" },
    )
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to save connection." };
  }

  return { ok: true, connectionId: data.id };
}
