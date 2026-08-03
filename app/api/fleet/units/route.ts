import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

export type FleetUnitListItem = {
  id: string;
  label: string;
  fleetName: string | null;
  plate: string | null;
  vin: string | null;
  status: "in_service" | "limited" | "oos";
  nextInspectionDate: string | null;
  location: string | null;
  currentOdometerKm: number | null;
  currentEngineHours: number | null;
  pmDueCount: number;
  openRequestCount: number;
};

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function status(requests: Row[]): FleetUnitListItem["status"] {
  const active = requests.filter((row) =>
    ["open", "scheduled"].includes(clean(row.status)?.toLowerCase() ?? ""),
  );
  if (
    active.some((row) =>
      ["safety", "compliance"].includes(
        clean(row.severity)?.toLowerCase() ?? "",
      ),
    )
  ) {
    return "oos";
  }
  return active.length ? "limited" : "in_service";
}

export async function POST(_request: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase);
    const scope = resolveFleetActorScope(actor);
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!scope?.shopId) {
      return NextResponse.json({ error: "Fleet access required" }, { status: 403 });
    }

    const admin = createAdminSupabase();
    let fleetQuery = admin
      .from("fleets")
      .select("id,name")
      .eq("shop_id", scope.shopId)
      .order("name", { ascending: true });
    if (scope.fleetIds?.length) fleetQuery = fleetQuery.in("id", scope.fleetIds);
    const { data: fleetData, error: fleetError } = await fleetQuery;
    if (fleetError) throw new Error(fleetError.message);
    const fleets = rows(fleetData);
    const fleetIds = fleets.map((row) => String(row.id));
    if (!fleetIds.length) return NextResponse.json({ units: [] });

    const { data: enrollmentData, error: enrollmentError } = await admin
      .from("fleet_vehicles")
      .select("fleet_id,vehicle_id,nickname,active")
      .eq("shop_id", scope.shopId)
      .in("fleet_id", fleetIds)
      .or("active.is.null,active.eq.true");
    if (enrollmentError) throw new Error(enrollmentError.message);
    const enrollments = rows(enrollmentData);
    const vehicleIds = Array.from(
      new Set(enrollments.map((row) => String(row.vehicle_id))),
    );
    if (!vehicleIds.length) return NextResponse.json({ units: [] });

    const [
      vehicleResult,
      requestResult,
      inspectionResult,
      readingResult,
      pmResult,
    ] = await Promise.all([
      admin
        .from("vehicles")
        .select(
          "id,unit_number,license_plate,vin,make,model,year,mileage,engine_hours",
        )
        .eq("shop_id", scope.shopId)
        .in("id", vehicleIds),
      admin
        .from("fleet_service_requests")
        .select("vehicle_id,severity,status")
        .eq("shop_id", scope.shopId)
        .in("fleet_id", fleetIds)
        .in("status", ["open", "scheduled"]),
      admin
        .from("fleet_inspection_schedules")
        .select("vehicle_id,next_inspection_date")
        .eq("shop_id", scope.shopId)
        .in("fleet_id", fleetIds)
        .order("next_inspection_date", { ascending: true }),
      admin
        .from("fleet_unit_readings")
        .select("vehicle_id,odometer_km,engine_hours,recorded_at")
        .eq("shop_id", scope.shopId)
        .in("fleet_id", fleetIds)
        .order("recorded_at", { ascending: false })
        .limit(3000),
      admin
        .from("fleet_pm_due_events")
        .select("vehicle_id,status")
        .eq("shop_id", scope.shopId)
        .in("fleet_id", fleetIds)
        .in("status", ["pending", "deferred", "converted"]),
    ]);
    const firstError = [
      vehicleResult.error,
      requestResult.error,
      inspectionResult.error,
      readingResult.error,
      pmResult.error,
    ].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    const fleetNames = new Map(
      fleets.map((row) => [String(row.id), clean(row.name) ?? "Fleet"]),
    );
    const vehicles = new Map(
      rows(vehicleResult.data).map((row) => [String(row.id), row]),
    );
    const requestsByVehicle = new Map<string, Row[]>();
    for (const row of rows(requestResult.data)) {
      const key = String(row.vehicle_id);
      requestsByVehicle.set(key, [...(requestsByVehicle.get(key) ?? []), row]);
    }
    const inspectionByVehicle = new Map<string, string | null>();
    for (const row of rows(inspectionResult.data)) {
      const key = String(row.vehicle_id);
      if (!inspectionByVehicle.has(key)) {
        inspectionByVehicle.set(key, clean(row.next_inspection_date));
      }
    }
    const readingByVehicle = new Map<string, Row>();
    for (const row of rows(readingResult.data)) {
      const key = String(row.vehicle_id);
      if (!readingByVehicle.has(key)) readingByVehicle.set(key, row);
    }
    const pmByVehicle = new Map<string, number>();
    for (const row of rows(pmResult.data)) {
      const key = String(row.vehicle_id);
      pmByVehicle.set(key, (pmByVehicle.get(key) ?? 0) + 1);
    }

    const units: FleetUnitListItem[] = enrollments.map((enrollment) => {
      const vehicleId = String(enrollment.vehicle_id);
      const vehicle = vehicles.get(vehicleId) ?? {};
      const reading = readingByVehicle.get(vehicleId) ?? {};
      const requests = requestsByVehicle.get(vehicleId) ?? [];
      return {
        id: vehicleId,
        label:
          clean(enrollment.nickname) ??
          clean(vehicle.unit_number) ??
          clean(vehicle.license_plate) ??
          clean(vehicle.vin) ??
          "Unit",
        fleetName: fleetNames.get(String(enrollment.fleet_id)) ?? null,
        plate: clean(vehicle.license_plate),
        vin: clean(vehicle.vin),
        status: status(requests),
        nextInspectionDate: inspectionByVehicle.get(vehicleId) ?? null,
        location: null,
        currentOdometerKm:
          numberValue(reading.odometer_km) ?? numberValue(vehicle.mileage),
        currentEngineHours:
          numberValue(reading.engine_hours) ?? numberValue(vehicle.engine_hours),
        pmDueCount: pmByVehicle.get(vehicleId) ?? 0,
        openRequestCount: requests.length,
      };
    });

    return NextResponse.json({ units });
  } catch (error) {
    console.error("[fleet/units] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load fleet units" },
      { status: 500 },
    );
  }
}
