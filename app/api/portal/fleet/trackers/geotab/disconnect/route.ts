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
  const { error } = await admin
    .from("fleet_portal_tracker_connections")
    .delete()
    .eq("fleet_id", scope.fleetId)
    .eq("shop_id", scope.shopId)
    .eq("vendor", "geotab");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
