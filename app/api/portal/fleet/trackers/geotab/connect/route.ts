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
import { connectFleetPortalGeotab } from "@/features/integrations/fleetTrackers/geotab/connectFleetPortal";
import { syncFleetPortalGeotabConnection } from "@/features/integrations/fleetTrackers/geotab/syncFleetPortal";

type Body = {
  fleetId?: unknown;
  database?: unknown;
  username?: unknown;
  password?: unknown;
  server?: unknown;
};

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

  const database = clean(body.database);
  const username = clean(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  const server = clean(body.server) ?? undefined;

  if (!database || !username || !password) {
    return NextResponse.json(
      { ok: false, error: "Database, username, and password are all required." },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();
  const connectResult = await connectFleetPortalGeotab(admin, {
    fleetId: scope.fleetId,
    shopId: scope.shopId,
    actorId: actor.userId,
    database,
    username,
    password,
    server,
  });

  if (!connectResult.ok) {
    return NextResponse.json({ ok: false, error: connectResult.error }, { status: 502 });
  }

  const { data: connectionRow, error: fetchError } = await admin
    .from("fleet_portal_tracker_connections")
    .select("id, fleet_id, shop_id, credentials")
    .eq("id", connectResult.connectionId)
    .single();

  if (fetchError || !connectionRow) {
    return NextResponse.json(
      { ok: true, connectionId: connectResult.connectionId, synced: false },
      { status: 200 },
    );
  }

  const syncResult = await syncFleetPortalGeotabConnection(admin, connectionRow);

  return NextResponse.json({
    ok: true,
    connectionId: connectResult.connectionId,
    synced: syncResult.ok,
    sync: syncResult,
  });
}
