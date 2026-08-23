import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { mapFleetServiceRequestError } from "@/features/fleet/lib/fleetServiceRequestError";

const RequestLineSchema = z.object({
  lineKind: z.enum([
    "menu",
    "diagnostic",
    "inspection",
    "pm_package",
    "custom",
  ]),
  sourceMenuItemId: z.string().uuid().nullable().optional(),
  sourceInspectionTemplateId: z.string().uuid().nullable().optional(),
  sourceFleetProgramId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(1000),
  notes: z.string().trim().max(4000).nullable().optional(),
  quantity: z.number().positive().max(100).default(1),
  requestedLaborHours: z.number().min(0).max(1000).nullable().optional(),
  unitPriceSnapshot: z.number().min(0).max(10000000).nullable().optional(),
  sourceSnapshot: z.record(z.string(), z.json()).default({}),
});

const BodySchema = z.object({
  fleetId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(4000),
  requestedForDate: z.string().date().nullable().optional(),
  lines: z.array(RequestLineSchema).min(1).max(100),
  operationKey: z.string().trim().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The fleet request is incomplete or invalid." },
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
    actor.actorType === "fleet_driver" ||
    actor.actorType === "fleet_dispatcher" ||
    actor.actorType === "none"
  ) {
    return NextResponse.json(
      { error: "Fleet manager access is required." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.rpc(
    "create_fleet_service_request_atomic",
    {
      p_fleet_id: parsed.data.fleetId,
      p_vehicle_id: parsed.data.vehicleId,
      p_title: parsed.data.title,
      p_summary: parsed.data.summary,
      // Postgres accepts an explicit NULL for this required nullable argument,
      // while generated RPC types represent date inputs as strings only.
      p_requested_for_date:
        parsed.data.requestedForDate ?? (null as unknown as string),
      p_lines: parsed.data.lines,
      p_operation_key: parsed.data.operationKey,
    },
  );

  if (error || !data) {
    console.error("[fleet/request-builder/submit] rpc error", error);
    const failure = mapFleetServiceRequestError(
      error,
      "Failed to create fleet service request.",
    );
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status },
    );
  }

  return NextResponse.json({ serviceRequestId: data }, { status: 201 });
}
