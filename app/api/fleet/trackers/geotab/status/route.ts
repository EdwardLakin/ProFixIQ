export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const auth = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!auth.ok) return auth.response;

  const { data: connection, error } = await auth.supabase
    .from("fleet_tracker_connections")
    .select("id, status, connected_at, last_sync_at, last_error")
    .eq("shop_id", auth.profile.shop_id)
    .eq("vendor", "geotab")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let vehicles: { name: string | null; vin: string | null; matched: boolean }[] = [];

  if (connection) {
    const { data: links } = await auth.supabase
      .from("fleet_tracker_vehicle_links")
      .select("vendor_name, vendor_vin, vehicle_id")
      .eq("connection_id", connection.id)
      .order("vendor_name", { ascending: true });

    vehicles = (links ?? []).map((link) => ({
      name: link.vendor_name,
      vin: link.vendor_vin,
      matched: Boolean(link.vehicle_id),
    }));
  }

  return NextResponse.json({
    ok: true,
    connected: Boolean(connection),
    connection: connection
      ? {
          id: connection.id,
          status: connection.status,
          connectedAt: connection.connected_at,
          lastSyncAt: connection.last_sync_at,
          lastError: connection.last_error,
        }
      : null,
    vehicles,
  });
}
