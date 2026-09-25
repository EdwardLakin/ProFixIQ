export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  canAdministerFleetForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { resolveSelectedFleetRequestScope } from "@/features/fleet/lib/resolveSelectedFleetRequestScope";
import { verifyFleetShopPair } from "@/features/fleet/lib/verifyFleetShopPair";

type Body = { fleetId?: unknown };

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const body = (await request.json().catch(() => ({}))) as Body;
  const fleetId = clean(body.fleetId);

  const actor = await resolveFleetActorContext(supabase, {
    requestedFleetId: fleetId,
  });
  if (!actor.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const scope = resolveSelectedFleetRequestScope(actor, {
    explicitFleetId: fleetId,
    preferMembershipFleet: !actor.isInternal,
  });
  if (!scope?.shopId || !scope.fleetId) {
    return NextResponse.json(
      { ok: false, error: "Fleet access required" },
      { status: 403 },
    );
  }
  if (!canAdministerFleetForActor(actor, scope.fleetId)) {
    return NextResponse.json(
      { ok: false, error: "Fleet management access required" },
      { status: 403 },
    );
  }

  const admin = createAdminSupabase();
  if (!(await verifyFleetShopPair(admin, scope.fleetId, scope.shopId))) {
    return NextResponse.json({ ok: false, error: "Fleet not found" }, { status: 404 });
  }

  const { data: connection, error } = await admin
    .from("fleet_portal_tracker_connections")
    .select("id, status, connected_at, last_sync_at, last_error")
    .eq("fleet_id", scope.fleetId)
    .eq("shop_id", scope.shopId)
    .eq("vendor", "geotab")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let vehicles: { name: string | null; vin: string | null; matched: boolean }[] = [];

  if (connection) {
    const { data: links, error: linksError } = await admin
      .from("fleet_portal_tracker_vehicle_links")
      .select("vendor_name, vendor_vin, vehicle_id")
      .eq("connection_id", connection.id)
      .order("vendor_name", { ascending: true });

    if (linksError) {
      return NextResponse.json({ ok: false, error: linksError.message }, { status: 500 });
    }

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
