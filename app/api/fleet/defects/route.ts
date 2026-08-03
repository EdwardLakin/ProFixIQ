import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  canManageFleetForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";

export const dynamic = "force-dynamic";

type DefectAction = "list" | "acknowledge" | "defer" | "create_request" | "resolve";
type Body = {
  action?: DefectAction;
  fleetId?: string | null;
  defectIds?: string[];
  deferredUntil?: string | null;
  reason?: string | null;
  requestedForDate?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: body.fleetId ?? null,
    });

    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fleetId = body.fleetId ?? actor.primaryFleetId ?? null;
    if (fleetId && !UUID.test(fleetId)) {
      return NextResponse.json({ error: "Invalid fleet" }, { status: 400 });
    }

    const action = body.action ?? "list";
    if (action === "list") {
      const { data, error } = await supabase.rpc("get_fleet_defect_queue", {
        p_fleet_id: fleetId ?? undefined,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json(data);
    }

    if (fleetId && !canManageFleetForActor(actor, fleetId)) {
      return NextResponse.json(
        { error: "Fleet management access required" },
        { status: 403 },
      );
    }
    if (!fleetId && !actor.isInternal) {
      return NextResponse.json(
        { error: "Fleet management access required" },
        { status: 403 },
      );
    }

    const defectIds = Array.from(new Set(body.defectIds ?? []));
    if (!defectIds.length || defectIds.some((id) => !UUID.test(id))) {
      return NextResponse.json(
        { error: "Select at least one valid defect" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("manage_fleet_unit_defects", {
      p_action: action,
      p_defect_ids: defectIds,
      p_deferred_until: body.deferredUntil || undefined,
      p_reason: body.reason?.trim() || undefined,
      p_requested_for_date: body.requestedForDate || undefined,
    });
    if (error) {
      const message = error.message || "Unable to update fleet defects";
      const status = /access|required|forbidden/i.test(message) ? 403 : 400;
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[fleet/defects] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update fleet defects" },
      { status: 500 },
    );
  }
}
