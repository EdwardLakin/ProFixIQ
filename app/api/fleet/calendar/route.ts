import { NextResponse } from "next/server";

import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { resolveSelectedFleetRequestScope } from "@/features/fleet/lib/resolveSelectedFleetRequestScope";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type CalendarEvent = {
  id: string;
  fleetId: string;
  fleetName: string;
  vehicleId: string;
  unitLabel: string;
  vehicleDescription: string;
  date: string | null;
  endDate: string | null;
  type:
    | "pm_due"
    | "pm_forecast"
    | "service_request"
    | "inspection"
    | "shop_service";
  state: string;
  title: string;
  detail: string;
  href: string;
};
function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOnly(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function addDays(value: unknown, days: unknown): string | null {
  const start = dateOnly(value);
  const interval = Number(days);
  if (!start || !Number.isFinite(interval) || interval <= 0) return null;
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + interval);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const requestedFleetId = clean(
      new URL(request.url).searchParams.get("fleetId"),
    );
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId,
    });
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (actor.actorType === "fleet_driver") {
      return NextResponse.json(
        { error: "Fleet manager access required" },
        { status: 403 },
      );
    }

    const scope = resolveSelectedFleetRequestScope(actor, {
      explicitFleetId: requestedFleetId,
    });
    if (!scope?.shopId) {
      return NextResponse.json(
        { error: "Fleet access required" },
        { status: 403 },
      );
    }

    const admin = createAdminSupabase();
    let fleetQuery = admin
      .from("fleets")
      .select("id,name")
      .eq("shop_id", scope.shopId)
      .eq("active", true)
      .order("name", { ascending: true });
    if (scope.fleetIds?.length)
      fleetQuery = fleetQuery.in("id", scope.fleetIds);
    const { data: fleetData, error: fleetError } = await fleetQuery;
    if (fleetError) throw new Error(fleetError.message);

    const fleets = rows(fleetData);
    const fleetIds = fleets.map((fleet) => String(fleet.id));
    if (!fleetIds.length) {
      return NextResponse.json({
        fleets: [],
        summary: { due: 0, planned: 0, inspections: 0, unscheduled: 0 },
        events: [],
      });
    }

    const { data: enrollmentData, error: enrollmentError } = await admin
      .from("fleet_vehicles")
      .select("fleet_id,vehicle_id,nickname")
      .eq("shop_id", scope.shopId)
      .in("fleet_id", fleetIds)
      .eq("active", true);
    if (enrollmentError) throw new Error(enrollmentError.message);
    const enrollments = rows(enrollmentData);
    const vehicleIds = Array.from(
      new Set(enrollments.map((row) => String(row.vehicle_id))),
    );
    if (!vehicleIds.length) {
      return NextResponse.json({
        fleets: fleets.map((fleet) => ({
          id: String(fleet.id),
          name: clean(fleet.name) ?? "Fleet",
        })),
        summary: { due: 0, planned: 0, inspections: 0, unscheduled: 0 },
        events: [],
      });
    }

    const calendarHistoryStart = new Date(
      Date.now() - 365 * 86_400_000,
    ).toISOString();
    const [
      vehicleResult,
      policyResult,
      dueResult,
      requestResult,
      inspectionResult,
      workOrderResult,
    ] = await Promise.all([
      admin
        .from("vehicles")
        .select("id,unit_number,license_plate,vin,year,make,model")
        .eq("shop_id", scope.shopId)
        .in("id", vehicleIds),
      admin
        .from("fleet_pm_policies")
        .select(
          "id,fleet_id,vehicle_id,program_id,name,interval_days,anchor_date,active",
        )
        .in("fleet_id", fleetIds)
        .eq("active", true),
      admin
        .from("fleet_pm_due_events")
        .select(
          "id,fleet_id,vehicle_id,policy_id,status,first_due_at,deferred_until,service_request_id",
        )
        .in("fleet_id", fleetIds)
        .in("status", ["pending", "deferred", "converted"]),
      admin
        .from("fleet_service_requests")
        .select(
          "id,fleet_id,vehicle_id,title,status,requested_for_date,scheduled_for_date,work_order_id,source_pm_due_event_id",
        )
        .eq("shop_id", scope.shopId)
        .in("fleet_id", fleetIds)
        .not("status", "in", "(completed,closed,cancelled)"),
      admin
        .from("fleet_inspection_schedules")
        .select("id,fleet_id,vehicle_id,next_inspection_date")
        .eq("shop_id", scope.shopId)
        .in("fleet_id", fleetIds),
      admin
        .from("work_orders")
        .select(
          "id,vehicle_id,custom_id,status,scheduled_at,expected_completion_at,source_fleet_service_request_id",
        )
        .eq("shop_id", scope.shopId)
        .in("vehicle_id", vehicleIds)
        .gte("scheduled_at", calendarHistoryStart)
        .not("scheduled_at", "is", null),
    ]);
    const firstError = [
      vehicleResult.error,
      policyResult.error,
      dueResult.error,
      requestResult.error,
      inspectionResult.error,
      workOrderResult.error,
    ].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    const fleetNames = new Map(
      fleets.map((fleet) => [String(fleet.id), clean(fleet.name) ?? "Fleet"]),
    );
    const vehicles = new Map(
      rows(vehicleResult.data).map((vehicle) => [String(vehicle.id), vehicle]),
    );
    const enrollmentByVehicle = new Map(
      enrollments.map((enrollment) => [
        String(enrollment.vehicle_id),
        enrollment,
      ]),
    );
    const vehicleLabel = (vehicleId: string) => {
      const enrollment = enrollmentByVehicle.get(vehicleId) ?? {};
      const vehicle = vehicles.get(vehicleId) ?? {};
      return (
        clean(enrollment.nickname) ??
        clean(vehicle.unit_number) ??
        clean(vehicle.license_plate) ??
        clean(vehicle.vin) ??
        "Unit"
      );
    };
    const vehicleDescription = (vehicleId: string) => {
      const vehicle = vehicles.get(vehicleId) ?? {};
      return [vehicle.year, clean(vehicle.make), clean(vehicle.model)]
        .filter(Boolean)
        .join(" ");
    };

    const dueByPolicy = new Map(
      rows(dueResult.data).map((due) => [String(due.policy_id), due]),
    );
    const workOrdersByRequest = new Map(
      rows(workOrderResult.data)
        .filter((row) => clean(row.source_fleet_service_request_id))
        .map((row) => [String(row.source_fleet_service_request_id), row]),
    );

    const events: CalendarEvent[] = [];
    for (const policy of rows(policyResult.data)) {
      const vehicleId = String(policy.vehicle_id);
      const fleetId = String(policy.fleet_id);
      const due = dueByPolicy.get(String(policy.id));
      if (clean(due?.status) === "converted") continue;
      const state = clean(due?.status) ?? "forecast";
      const date = due
        ? (dateOnly(due.deferred_until) ?? dateOnly(due.first_due_at))
        : addDays(policy.anchor_date, policy.interval_days);
      if (!date && !due) continue;
      events.push({
        id: due ? `pm:${String(due.id)}` : `forecast:${String(policy.id)}`,
        fleetId,
        fleetName: fleetNames.get(fleetId) ?? "Fleet",
        vehicleId,
        unitLabel: vehicleLabel(vehicleId),
        vehicleDescription: vehicleDescription(vehicleId),
        date,
        endDate: null,
        type: due ? "pm_due" : "pm_forecast",
        state,
        title: clean(policy.name) ?? "Preventive maintenance",
        detail:
          state === "deferred"
            ? "Deferred review date"
            : due
              ? "Maintenance decision required"
              : "Calendar-based PM forecast",
        href: `/maintenance`,
      });
    }

    for (const serviceRequest of rows(requestResult.data)) {
      const requestId = String(serviceRequest.id);
      const vehicleId = String(serviceRequest.vehicle_id);
      const fleetId = String(serviceRequest.fleet_id);
      const workOrder = workOrdersByRequest.get(requestId);
      events.push({
        id: `request:${requestId}`,
        fleetId,
        fleetName: fleetNames.get(fleetId) ?? "Fleet",
        vehicleId,
        unitLabel: vehicleLabel(vehicleId),
        vehicleDescription: vehicleDescription(vehicleId),
        date:
          dateOnly(workOrder?.scheduled_at) ??
          dateOnly(serviceRequest.scheduled_for_date) ??
          dateOnly(serviceRequest.requested_for_date),
        endDate: dateOnly(workOrder?.expected_completion_at),
        type: "service_request",
        state: clean(serviceRequest.status) ?? "open",
        title: clean(serviceRequest.title) ?? "Service request",
        detail: workOrder
          ? "Connected Shop appointment"
          : "Fleet requested service",
        href: `/service-requests`,
      });
    }

    for (const inspection of rows(inspectionResult.data)) {
      const vehicleId = String(inspection.vehicle_id);
      const fleetId = String(inspection.fleet_id);
      events.push({
        id: `inspection:${String(inspection.id)}`,
        fleetId,
        fleetName: fleetNames.get(fleetId) ?? "Fleet",
        vehicleId,
        unitLabel: vehicleLabel(vehicleId),
        vehicleDescription: vehicleDescription(vehicleId),
        date: dateOnly(inspection.next_inspection_date),
        endDate: null,
        type: "inspection",
        state: "scheduled",
        title: "Inspection due",
        detail: "Regulatory or Fleet inspection window",
        href: `/assets/${encodeURIComponent(vehicleId)}`,
      });
    }

    const representedWorkOrders = new Set(
      rows(requestResult.data)
        .map((requestRow) => clean(requestRow.work_order_id))
        .filter((id): id is string => Boolean(id)),
    );
    for (const workOrder of rows(workOrderResult.data)) {
      const workOrderId = String(workOrder.id);
      if (representedWorkOrders.has(workOrderId)) continue;
      const vehicleId = String(workOrder.vehicle_id);
      const enrollment = enrollmentByVehicle.get(vehicleId);
      if (!enrollment) continue;
      const fleetId = String(enrollment.fleet_id);
      events.push({
        id: `work-order:${workOrderId}`,
        fleetId,
        fleetName: fleetNames.get(fleetId) ?? "Fleet",
        vehicleId,
        unitLabel: vehicleLabel(vehicleId),
        vehicleDescription: vehicleDescription(vehicleId),
        date: dateOnly(workOrder.scheduled_at),
        endDate: dateOnly(workOrder.expected_completion_at),
        type: "shop_service",
        state: clean(workOrder.status) ?? "scheduled",
        title: clean(workOrder.custom_id) ?? "Connected Shop service",
        detail: "Shop-planned maintenance for this Fleet asset",
        href: `/assets/${encodeURIComponent(vehicleId)}`,
      });
    }

    events.sort((a, b) => {
      const aDate = typeof a.date === "string" ? a.date : "9999-12-31";
      const bDate = typeof b.date === "string" ? b.date : "9999-12-31";
      return (
        aDate.localeCompare(bDate) ||
        String(a.title).localeCompare(String(b.title))
      );
    });

    return NextResponse.json({
      fleets: fleets.map((fleet) => ({
        id: String(fleet.id),
        name: clean(fleet.name) ?? "Fleet",
      })),
      summary: {
        due: events.filter((event) => event.type === "pm_due").length,
        planned: events.filter((event) =>
          ["service_request", "shop_service"].includes(String(event.type)),
        ).length,
        inspections: events.filter((event) => event.type === "inspection")
          .length,
        unscheduled: events.filter((event) => !event.date).length,
      },
      events,
    });
  } catch (error) {
    console.error("[fleet/calendar] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Fleet calendar",
      },
      { status: 500 },
    );
  }
}
