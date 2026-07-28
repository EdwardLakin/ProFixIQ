import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

const BodySchema = z.object({
  fleetId: z.string().uuid(),
  vehicleId: z.string().uuid().nullable().optional(),
});

type DueEventResult = {
  created: boolean;
  due_event_id: string;
  policy_id: string;
  vehicle_id: string;
};

function isDueEventResultArray(value: unknown): value is DueEventResult[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as { due_event_id?: unknown }).due_event_id === "string",
    )
  );
}

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "fleetId is required." },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseRoute();
  const actor = await resolveFleetActorContext(supabase, {
    requestedFleetId: parsed.data.fleetId,
  });

  if (!actor.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !actor.isInternal &&
    !actor.capabilities.canConvertPretripToServiceRequest
  ) {
    return NextResponse.json(
      { error: "Fleet manager access is required." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.rpc("evaluate_fleet_pm_due_events", {
    p_fleet_id: parsed.data.fleetId,
    p_vehicle_id: parsed.data.vehicleId ?? null,
  });

  if (error) {
    console.error("[fleet/pm/evaluate] rpc error", error);
    return NextResponse.json(
      { error: "Failed to evaluate fleet PM policies." },
      { status: 500 },
    );
  }

  const dueEvents = isDueEventResultArray(data) ? data : [];

  return NextResponse.json({
    evaluated: dueEvents.length,
    dueEvents,
  });
}
