import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

type Body = {
  shopId?: string | null;
  fleetId?: string | null;
};

function asMoney(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const supabase = createServerSupabaseRoute();
  const actor = await resolveFleetActorContext(supabase, {
    requestedFleetId: body.fleetId,
  });
  const scope = resolveFleetActorScope(actor, {
    explicitShopId: body.shopId,
    explicitFleetId: body.fleetId,
  });

  if (!actor.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!scope?.shopId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let fleetQuery = supabase
    .from("fleet_vehicles")
    .select(
      `
        fleet_id,
        vehicle_id,
        nickname,
        vehicles!inner (
          id,
          unit_number,
          license_plate,
          vin,
          year,
          make,
          model
        )
      `,
    )
    .or("active.is.null,active.eq.true");

  if (scope.fleetIds) {
    fleetQuery = fleetQuery.in("fleet_id", scope.fleetIds);
  } else {
    fleetQuery = fleetQuery.eq("shop_id", scope.shopId);
  }

  const { data: fleetRows, error: fleetError } = await fleetQuery;
  if (fleetError) {
    console.error("[fleet/unit-economics] unit load error", fleetError);
    return NextResponse.json(
      { error: "Failed to load fleet units." },
      { status: 500 },
    );
  }

  const units = fleetRows ?? [];
  const vehicleIds = units.map((row) => row.vehicle_id);
  if (vehicleIds.length === 0) {
    return NextResponse.json({
      units: [],
      generatedAt: new Date().toISOString(),
    });
  }

  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 1);

  const [
    workOrderResult,
    readingResult,
    dueResult,
    requestResult,
    recommendationResult,
  ] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id,vehicle_id,invoice_total,status,created_at")
      .eq("shop_id", scope.shopId)
      .in("vehicle_id", vehicleIds)
      .gte("created_at", since.toISOString()),
    supabase
      .from("fleet_unit_readings")
      .select("id,vehicle_id,odometer_km,engine_hours,recorded_at,source_type")
      .in("vehicle_id", vehicleIds)
      .order("recorded_at", { ascending: true }),
    supabase
      .from("fleet_pm_due_events")
      .select(
        "id,vehicle_id,status,due_reasons,evidence_snapshot_id,first_due_at",
      )
      .in("vehicle_id", vehicleIds)
      .in("status", ["pending", "deferred", "converted"]),
    supabase
      .from("fleet_service_requests")
      .select("id,vehicle_id,status")
      .in("vehicle_id", vehicleIds),
    supabase
      .from("ai_recommendations")
      .select(
        "id,subject_id,title,summary,priority,confidence,evidence_snapshot_id,recommended_action,status,created_at",
      )
      .eq("domain", "fleet")
      .eq("status", "open")
      .in("subject_id", vehicleIds)
      .order("created_at", { ascending: false }),
  ]);

  const firstError =
    workOrderResult.error ??
    readingResult.error ??
    dueResult.error ??
    requestResult.error ??
    recommendationResult.error;

  if (firstError) {
    console.error("[fleet/unit-economics] aggregate load error", firstError);
    return NextResponse.json(
      { error: "Failed to calculate fleet unit economics." },
      { status: 500 },
    );
  }

  const payload = units.map((unit) => {
    const vehicle = Array.isArray(unit.vehicles)
      ? unit.vehicles[0]
      : unit.vehicles;
    const workOrders = (workOrderResult.data ?? []).filter(
      (row) => row.vehicle_id === unit.vehicle_id,
    );
    const readings = (readingResult.data ?? []).filter(
      (row) => row.vehicle_id === unit.vehicle_id && row.odometer_km != null,
    );
    const dueEvents = (dueResult.data ?? []).filter(
      (row) => row.vehicle_id === unit.vehicle_id,
    );
    const requests = (requestResult.data ?? []).filter(
      (row) => row.vehicle_id === unit.vehicle_id,
    );
    const recommendations = (recommendationResult.data ?? []).filter(
      (row) => row.subject_id === unit.vehicle_id,
    );

    const trailing12MonthSpend = workOrders.reduce(
      (sum, row) => sum + asMoney(row.invoice_total),
      0,
    );
    const firstOdometer = readings[0]?.odometer_km ?? null;
    const latestReading = readings.at(-1) ?? null;
    const latestOdometer = latestReading?.odometer_km ?? null;
    const distanceKm =
      firstOdometer != null && latestOdometer != null
        ? Math.max(0, latestOdometer - firstOdometer)
        : null;
    const costPerKm =
      distanceKm != null && distanceKm >= 100
        ? trailing12MonthSpend / distanceKm
        : null;

    return {
      fleetId: unit.fleet_id,
      unitId: unit.vehicle_id,
      label:
        unit.nickname ||
        vehicle?.unit_number ||
        vehicle?.license_plate ||
        vehicle?.vin ||
        "Fleet unit",
      vehicle: [vehicle?.year, vehicle?.make, vehicle?.model]
        .filter(Boolean)
        .join(" "),
      trailing12MonthSpend,
      currentOdometerKm: latestOdometer,
      readingRecordedAt: latestReading?.recorded_at ?? null,
      distanceCoveredKm: distanceKm,
      costPerKm,
      completedWorkOrders: workOrders.filter((row) =>
        ["completed", "closed", "invoiced", "paid"].includes(
          (row.status ?? "").toLowerCase(),
        ),
      ).length,
      openServiceRequests: requests.filter((row) =>
        ["open", "scheduled"].includes((row.status ?? "").toLowerCase()),
      ).length,
      deferredRequests: requests.filter(
        (row) => (row.status ?? "").toLowerCase() === "deferred",
      ).length,
      pmDueCount: dueEvents.length,
      dueEvidenceCount: dueEvents.filter((row) => row.evidence_snapshot_id)
        .length,
      recommendations: recommendations.slice(0, 3),
      dataQuality:
        readings.length >= 2 && distanceKm != null && distanceKm >= 100
          ? "measured"
          : "insufficient_readings",
    };
  });

  return NextResponse.json({
    units: payload.sort(
      (a, b) =>
        b.pmDueCount - a.pmDueCount ||
        b.openServiceRequests - a.openServiceRequests ||
        b.trailing12MonthSpend - a.trailing12MonthSpend,
    ),
    generatedAt: new Date().toISOString(),
    methodology: {
      spendWindow: "trailing_12_months",
      costPerKm:
        "Trailing 12-month invoice total divided by measured odometer delta; hidden below 100 km of evidence.",
      telematics: "not_used",
    },
  });
}
