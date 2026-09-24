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

  const { data: connection, error: fetchError } = await admin
    .from("fleet_portal_tracker_connections")
    .select("id")
    .eq("fleet_id", scope.fleetId)
    .eq("shop_id", scope.shopId)
    .eq("vendor", "geotab")
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }
  if (!connection) {
    return NextResponse.json({ ok: true });
  }

  // Record who disconnected it and when before the row (and its created_by)
  // is gone -- the delete below carries no other durable trace of this.
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: actor.userId,
    action: "fleet_portal_tracker_disconnect",
    target: connection.id,
    metadata: { fleetId: scope.fleetId, shopId: scope.shopId, vendor: "geotab" },
  });
  if (auditError) {
    return NextResponse.json({ ok: false, error: auditError.message }, { status: 500 });
  }

  const { error } = await admin
    .from("fleet_portal_tracker_connections")
    .delete()
    .eq("id", connection.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
