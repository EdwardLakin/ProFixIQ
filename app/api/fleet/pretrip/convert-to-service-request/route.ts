import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  canManageFleetForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";

type Body = {
  pretripId?: string;
  requestedForDate?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    if (!body.pretripId) {
      return NextResponse.json({ error: "Missing pre-trip report" }, { status: 400 });
    }

    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase);
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: defects, error: defectError } = await supabase
      .from("fleet_unit_defects")
      .select("id,fleet_id")
      .eq("source_pretrip_id", body.pretripId)
      .in("state", ["open", "acknowledged", "deferred"]);
    if (defectError) throw new Error(defectError.message);
    if (!defects?.length) {
      return NextResponse.json(
        { error: "No active tracked defects remain on this pre-trip." },
        { status: 409 },
      );
    }

    const fleetId = defects[0]?.fleet_id;
    if (!fleetId || !canManageFleetForActor(actor, fleetId)) {
      return NextResponse.json(
        { error: "Fleet management access required" },
        { status: 403 },
      );
    }

    const { data, error } = await supabase.rpc("manage_fleet_unit_defects", {
      p_action: "create_request",
      p_defect_ids: defects.map((defect) => defect.id),
      p_requested_for_date: body.requestedForDate || undefined,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[fleet/pretrip/convert] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create service request" },
      { status: 500 },
    );
  }
}
