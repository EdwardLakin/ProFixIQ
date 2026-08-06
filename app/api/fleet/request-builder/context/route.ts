import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const requestedFleetId = req.nextUrl.searchParams.get("fleetId");

  const actor = await resolveFleetActorContext(supabase, {
    requestedFleetId,
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
      { error: "Fleet manager access is required to build service requests." },
      { status: 403 },
    );
  }

  let fleetId = requestedFleetId ?? actor.primaryFleetId;

  if (!fleetId && actor.isInternal && actor.shopId) {
    const { data: firstFleet } = await supabase
      .from("fleets")
      .select("id")
      .eq("shop_id", actor.shopId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    fleetId = firstFleet?.id ?? null;
  }

  const scope = resolveFleetActorScope(actor, {
    explicitFleetId: fleetId,
  });

  if (!scope?.shopId || !scope.fleetId) {
    return NextResponse.json(
      { error: "No fleet is available for this account." },
      { status: 404 },
    );
  }

  const [unitResult, menuResult, inspectionResult, programResult] =
    await Promise.all([
      supabase
        .from("fleet_vehicles")
        .select(
          `
            fleet_id,
            vehicle_id,
            nickname,
            vehicles!inner (
              id,
              unit_number,
              year,
              make,
              model,
              vin,
              license_plate,
              engine_hours,
              mileage
            )
          `,
        )
        .eq("fleet_id", scope.fleetId)
        .or("active.is.null,active.eq.true")
        .order("created_at", { ascending: true }),
      supabase
        .from("menu_items")
        .select(
          "id,name,description,category,base_labor_hours,labor_hours,base_price,total_price,vehicle_year,vehicle_make,vehicle_model,is_active",
        )
        .eq("shop_id", scope.shopId)
        .eq("is_active", true)
        .order("category", { ascending: true })
        .limit(500),
      supabase
        .from("inspection_templates")
        .select(
          "id,template_name,description,labor_hours,vehicle_type,tags,shop_id",
        )
        .eq("shop_id", scope.shopId)
        .order("template_name", { ascending: true })
        .limit(250),
      supabase
        .from("fleet_programs")
        .select(
          "id,fleet_id,name,cadence,interval_km,interval_hours,interval_days,notes,include_custom_inspection",
        )
        .eq("fleet_id", scope.fleetId)
        .order("name", { ascending: true }),
    ]);

  const firstError =
    unitResult.error ??
    menuResult.error ??
    inspectionResult.error ??
    programResult.error;

  if (firstError) {
    console.error("[fleet/request-builder/context] load error", firstError);
    return NextResponse.json(
      { error: "Failed to load the fleet service catalog." },
      { status: 500 },
    );
  }

  const programIds = (programResult.data ?? []).map((program) => program.id);
  const taskResult =
    programIds.length > 0
      ? await supabase
          .from("fleet_program_tasks")
          .select(
            "id,program_id,display_order,description,job_type,default_labor_hours,section_key",
          )
          .in("program_id", programIds)
          .order("display_order", { ascending: true })
      : { data: [], error: null };

  if (taskResult.error) {
    console.error(
      "[fleet/request-builder/context] program task load error",
      taskResult.error,
    );
    return NextResponse.json(
      { error: "Failed to load fleet PM package tasks." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    fleetId: scope.fleetId,
    shopId: scope.shopId,
    units: unitResult.data ?? [],
    menuItems: menuResult.data ?? [],
    inspections: inspectionResult.data ?? [],
    pmPackages: (programResult.data ?? []).map((program) => ({
      ...program,
      tasks: (taskResult.data ?? []).filter(
        (task) => task.program_id === program.id,
      ),
    })),
  });
}
