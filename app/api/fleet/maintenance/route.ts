import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  canManageFleetForActor,
  manageableFleetIdsForActor,
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Body = {
  action?: "list" | "evaluate" | "defer" | "create_request";
  fleetId?: string | null;
  vehicleId?: string | null;
  dueEventId?: string;
  deferredUntil?: string;
  reason?: string;
};

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canManage(
  actor: Awaited<ReturnType<typeof resolveFleetActorContext>>,
  fleetId?: string,
  visibleFleetIds?: string[],
) {
  if (actor.isInternal) return true;
  if (fleetId) return canManageFleetForActor(actor, fleetId);
  if (visibleFleetIds?.length) {
    return visibleFleetIds.every((id) => canManageFleetForActor(actor, id));
  }
  return manageableFleetIdsForActor(actor).length > 0;
}

function inActorScope(
  actor: Awaited<ReturnType<typeof resolveFleetActorContext>>,
  row: Row,
) {
  if (actor.isInternal) return String(row.shop_id) === actor.shopId;
  return actor.fleetIds.includes(String(row.fleet_id));
}

async function listWorkspace(
  actor: Awaited<ReturnType<typeof resolveFleetActorContext>>,
  explicitFleetId?: string | null,
) {
  const scope = resolveFleetActorScope(actor, {
    explicitFleetId: explicitFleetId ?? null,
  });
  if (!scope?.shopId) throw new Error("Fleet scope is unavailable");

  const admin = createAdminSupabase();
  let fleetQuery = admin
    .from("fleets")
    .select("id,name,shop_id")
    .eq("shop_id", scope.shopId)
    .order("name", { ascending: true });
  if (scope.fleetIds?.length) fleetQuery = fleetQuery.in("id", scope.fleetIds);

  const { data: fleets, error: fleetError } = await fleetQuery;
  if (fleetError) throw new Error(fleetError.message);
  const fleetRows = rows(fleets);
  const fleetIds = fleetRows.map((row) => String(row.id));
  if (!fleetIds.length) {
    return {
      canManage: canManage(actor, explicitFleetId ?? undefined, fleetIds),
      fleets: [],
      summary: { overdue: 0, due: 0, deferred: 0, converted: 0, clearUnits: 0 },
      items: [],
      programs: [],
    };
  }

  const [enrollmentResult, vehicleResult, policyResult, dueResult, programResult, readingResult] =
    await Promise.all([
      admin
        .from("fleet_vehicles")
        .select("fleet_id,vehicle_id,nickname,active")
        .in("fleet_id", fleetIds)
        .or("active.is.null,active.eq.true"),
      admin
        .from("vehicles")
        .select("id,unit_number,license_plate,vin,year,make,model")
        .eq("shop_id", scope.shopId),
      admin
        .from("fleet_pm_policies")
        .select(
          "id,shop_id,fleet_id,vehicle_id,program_id,name,interval_km,interval_hours,interval_days,anchor_odometer_km,anchor_engine_hours,anchor_date,last_completed_at,requires_fleet_approval,active",
        )
        .in("fleet_id", fleetIds)
        .eq("active", true),
      admin
        .from("fleet_pm_due_events")
        .select(
          "id,shop_id,fleet_id,vehicle_id,policy_id,program_id,status,due_reasons,due_snapshot,first_due_at,last_evaluated_at,deferred_until,service_request_id",
        )
        .in("fleet_id", fleetIds)
        .in("status", ["pending", "deferred", "converted"])
        .order("first_due_at", { ascending: true }),
      admin
        .from("fleet_programs")
        .select(
          "id,fleet_id,name,cadence,interval_km,interval_hours,interval_days,notes",
        )
        .in("fleet_id", fleetIds)
        .order("name", { ascending: true }),
      admin
        .from("fleet_unit_readings")
        .select("id,fleet_id,vehicle_id,odometer_km,engine_hours,recorded_at")
        .in("fleet_id", fleetIds)
        .order("recorded_at", { ascending: false })
        .limit(2000),
    ]);

  const error = [
    enrollmentResult.error,
    vehicleResult.error,
    policyResult.error,
    dueResult.error,
    programResult.error,
    readingResult.error,
  ].find(Boolean);
  if (error) throw new Error(error.message);

  const vehicles = new Map(rows(vehicleResult.data).map((row) => [String(row.id), row]));
  const enrollments = rows(enrollmentResult.data);
  const enrollmentByVehicle = new Map(
    enrollments.map((row) => [String(row.vehicle_id), row]),
  );
  const fleetNames = new Map(fleetRows.map((row) => [String(row.id), clean(row.name) ?? "Fleet"]));
  const policies = rows(policyResult.data);
  const policiesById = new Map(policies.map((row) => [String(row.id), row]));
  const latestReadings = new Map<string, Row>();
  for (const reading of rows(readingResult.data)) {
    const vehicleId = String(reading.vehicle_id);
    if (!latestReadings.has(vehicleId)) latestReadings.set(vehicleId, reading);
  }

  const now = Date.now();
  const items = rows(dueResult.data).map((due) => {
    const vehicleId = String(due.vehicle_id);
    const vehicle = vehicles.get(vehicleId) ?? {};
    const enrollment = enrollmentByVehicle.get(vehicleId) ?? {};
    const policy = policiesById.get(String(due.policy_id)) ?? {};
    const reading = latestReadings.get(vehicleId) ?? {};
    const firstDueAt = clean(due.first_due_at) ?? new Date().toISOString();
    const ageDays = Math.max(
      0,
      Math.floor((now - new Date(firstDueAt).getTime()) / 86_400_000),
    );
    const status = clean(due.status) ?? "pending";
    const urgency =
      status === "deferred"
        ? "deferred"
        : status === "converted"
          ? "converted"
          : ageDays >= 7
            ? "overdue"
            : "due";

    return {
      id: String(due.id),
      fleetId: String(due.fleet_id),
      fleetName: fleetNames.get(String(due.fleet_id)) ?? "Fleet",
      vehicleId,
      unitLabel:
        clean(enrollment.nickname) ??
        clean(vehicle.unit_number) ??
        clean(vehicle.license_plate) ??
        clean(vehicle.vin) ??
        "Unit",
      vehicleDescription: [vehicle.year, clean(vehicle.make), clean(vehicle.model)]
        .filter(Boolean)
        .join(" "),
      policyId: String(due.policy_id),
      programId: String(due.program_id),
      name: clean(policy.name) ?? "Preventive maintenance",
      status,
      urgency,
      ageDays,
      dueReasons: Array.isArray(due.due_reasons)
        ? due.due_reasons.map(String)
        : [],
      firstDueAt,
      deferredUntil: clean(due.deferred_until),
      serviceRequestId: clean(due.service_request_id),
      currentOdometerKm: numeric(reading.odometer_km),
      currentEngineHours: numeric(reading.engine_hours),
      intervalKm: numeric(policy.interval_km),
      intervalHours: numeric(policy.interval_hours),
      intervalDays: numeric(policy.interval_days),
      lastCompletedAt: clean(policy.last_completed_at),
      requiresApproval: policy.requires_fleet_approval !== false,
    };
  });

  const assignedByProgram = new Map<string, number>();
  for (const policy of policies) {
    const programId = String(policy.program_id);
    assignedByProgram.set(programId, (assignedByProgram.get(programId) ?? 0) + 1);
  }
  const dueByProgram = new Map<string, number>();
  for (const item of items) {
    dueByProgram.set(item.programId, (dueByProgram.get(item.programId) ?? 0) + 1);
  }

  const activeUnitIds = new Set(enrollments.map((row) => String(row.vehicle_id)));
  const unitsWithDue = new Set(items.map((item) => item.vehicleId));
  return {
    canManage: canManage(actor, explicitFleetId ?? undefined, fleetIds),
    fleets: fleetRows.map((row) => ({
      id: String(row.id),
      name: clean(row.name) ?? "Fleet",
    })),
    summary: {
      overdue: items.filter((item) => item.urgency === "overdue").length,
      due: items.filter((item) => item.urgency === "due").length,
      deferred: items.filter((item) => item.urgency === "deferred").length,
      converted: items.filter((item) => item.urgency === "converted").length,
      clearUnits: Math.max(0, activeUnitIds.size - unitsWithDue.size),
    },
    items,
    programs: rows(programResult.data).map((program) => ({
      id: String(program.id),
      fleetId: String(program.fleet_id),
      fleetName: fleetNames.get(String(program.fleet_id)) ?? "Fleet",
      name: clean(program.name) ?? "PM program",
      cadence: clean(program.cadence) ?? "custom",
      intervalKm: numeric(program.interval_km),
      intervalHours: numeric(program.interval_hours),
      intervalDays: numeric(program.interval_days),
      notes: clean(program.notes),
      assignedUnits: assignedByProgram.get(String(program.id)) ?? 0,
      dueUnits: dueByProgram.get(String(program.id)) ?? 0,
    })),
  };
}

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase);
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (actor.actorType === "none" || !actor.shopId) {
      return NextResponse.json({ error: "Fleet access required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    const action = body.action ?? "list";

    if (action === "list") {
      return NextResponse.json(await listWorkspace(actor, body.fleetId));
    }
    const admin = createAdminSupabase();

    if (action === "evaluate") {
      const requestedFleetId = clean(body.fleetId);
      let targetFleetIds: string[];
      if (requestedFleetId) {
        if (!canManage(actor, requestedFleetId)) {
          return NextResponse.json(
            { error: "Fleet management access required" },
            { status: 403 },
          );
        }
        const { data: fleet, error: fleetError } = await admin
          .from("fleets")
          .select("id")
          .eq("id", requestedFleetId)
          .eq("shop_id", actor.shopId)
          .maybeSingle();
        if (fleetError) throw new Error(fleetError.message);
        if (!fleet) {
          return NextResponse.json({ error: "Invalid fleet" }, { status: 400 });
        }
        targetFleetIds = [requestedFleetId];
      } else if (actor.isInternal) {
        const { data: fleets, error: fleetError } = await admin
          .from("fleets")
          .select("id")
          .eq("shop_id", actor.shopId);
        if (fleetError) throw new Error(fleetError.message);
        targetFleetIds = (fleets ?? []).map((fleet) => fleet.id);
      } else {
        targetFleetIds = manageableFleetIdsForActor(actor);
      }

      if (!targetFleetIds.length) {
        return NextResponse.json(
          { error: "Fleet management access required" },
          { status: 403 },
        );
      }

      const evaluations = await Promise.all(
        targetFleetIds.map(async (fleetId) => {
          const { data, error } = await supabase.rpc("evaluate_fleet_pm_due_events", {
            p_fleet_id: fleetId,
            p_vehicle_id: clean(body.vehicleId) ?? undefined,
          });
          if (error) throw new Error(error.message);
          return { fleetId, evaluated: data ?? [] };
        }),
      );
      return NextResponse.json({ ok: true, evaluations });
    }

    if (!["defer", "create_request"].includes(action)) {
      return NextResponse.json({ error: "Unsupported PM action" }, { status: 400 });
    }

    const dueEventId = clean(body.dueEventId);
    if (!dueEventId) {
      return NextResponse.json({ error: "dueEventId is required" }, { status: 400 });
    }
    const { data: dueRow, error: dueError } = await admin
      .from("fleet_pm_due_events")
      .select(
        "id,shop_id,fleet_id,vehicle_id,policy_id,program_id,status,due_reasons,due_snapshot,service_request_id",
      )
      .eq("id", dueEventId)
      .maybeSingle();
    if (dueError) throw new Error(dueError.message);
    if (!dueRow || !inActorScope(actor, dueRow as unknown as Row)) {
      return NextResponse.json({ error: "PM item not found" }, { status: 404 });
    }
    if (!canManage(actor, String(dueRow.fleet_id))) {
      return NextResponse.json(
        { error: "Fleet management access required" },
        { status: 403 },
      );
    }

    if (action === "defer") {
      const deferredUntil = clean(body.deferredUntil);
      const reason = clean(body.reason);
      if (!deferredUntil || !reason) {
        return NextResponse.json(
          { error: "Deferral date and reason are required" },
          { status: 400 },
        );
      }
      const date = new Date(`${deferredUntil}T00:00:00Z`);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "Deferral date must be in the future" },
          { status: 400 },
        );
      }
      const snapshot =
        dueRow.due_snapshot &&
        typeof dueRow.due_snapshot === "object" &&
        !Array.isArray(dueRow.due_snapshot)
          ? (dueRow.due_snapshot as Record<string, unknown>)
          : {};
      const { data: deferred, error } = await admin
        .from("fleet_pm_due_events")
        .update({
          status: "deferred",
          deferred_until: deferredUntil,
          due_snapshot: {
            ...snapshot,
            deferral: {
              reason: reason.slice(0, 500),
              deferredUntil,
              actorUserId: actor.userId,
              recordedAt: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", dueEventId)
        .in("status", ["pending", "deferred"])
        .is("service_request_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!deferred) {
        return NextResponse.json(
          { error: "This PM item can no longer be deferred" },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (dueRow.service_request_id) {
      const { error: repairError } = await admin
        .from("fleet_service_requests")
        .update({
          source_pm_due_event_id: dueEventId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dueRow.service_request_id)
        .eq("shop_id", dueRow.shop_id);
      if (repairError) throw new Error(repairError.message);
      return NextResponse.json({
        ok: true,
        serviceRequestId: dueRow.service_request_id,
        idempotent: true,
      });
    }
    if (!["pending", "deferred"].includes(String(dueRow.status))) {
      return NextResponse.json(
        { error: "This PM item can no longer create a request" },
        { status: 409 },
      );
    }

    const dueReasons = Array.isArray(dueRow.due_reasons)
      ? dueRow.due_reasons.map(String)
      : [];

    const { data: policy, error: policyError } = await admin
      .from("fleet_pm_policies")
      .select("id,name,interval_km,interval_hours,interval_days")
      .eq("id", dueRow.policy_id)
      .maybeSingle();
    if (policyError) throw new Error(policyError.message);
    const policyName = clean(policy?.name) ?? "Preventive maintenance";
    const operationKey = `pm-due:${dueEventId}`;
    const { data: serviceRequestId, error: createError } = await supabase.rpc(
      "create_fleet_service_request_atomic",
      {
        p_fleet_id: dueRow.fleet_id,
        p_vehicle_id: dueRow.vehicle_id,
        p_title: `${policyName} service`,
        p_summary: `Preventive maintenance due: ${dueReasons.join(", ") || "policy interval reached"}.`,
        // The SQL function intentionally accepts an unscheduled request.
        p_requested_for_date: null as unknown as string,
        p_operation_key: operationKey,
        p_lines: [
          {
            lineKind: "pm_package",
            description: policyName,
            notes: "Created from the PM management workspace.",
            quantity: 1,
            requestedLaborHours: null,
            unitPriceSnapshot: null,
            sourceFleetProgramId: dueRow.program_id,
            sourceSnapshot: {
              dueEventId,
              intervalKm: policy?.interval_km ?? null,
              intervalHours: policy?.interval_hours ?? null,
              intervalDays: policy?.interval_days ?? null,
              dueReasons,
            },
          },
        ],
      },
    );
    if (createError) throw new Error(createError.message);
    const requestId = String(serviceRequestId);
    const now = new Date().toISOString();
    const requestUpdate = await admin
      .from("fleet_service_requests")
      .update({ source_pm_due_event_id: dueEventId, updated_at: now })
      .eq("id", requestId)
      .eq("shop_id", dueRow.shop_id);
    if (requestUpdate.error) throw new Error(requestUpdate.error.message);

    const { data: converted, error: dueUpdateError } = await admin
      .from("fleet_pm_due_events")
      .update({
        status: "converted",
        service_request_id: requestId,
        updated_at: now,
      })
      .eq("id", dueEventId)
      .in("status", ["pending", "deferred"])
      .is("service_request_id", null)
      .select("id")
      .maybeSingle();
    if (dueUpdateError) throw new Error(dueUpdateError.message);
    if (!converted) {
      const { data: current, error: currentError } = await admin
        .from("fleet_pm_due_events")
        .select("service_request_id")
        .eq("id", dueEventId)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (current?.service_request_id === requestId) {
        return NextResponse.json({
          ok: true,
          serviceRequestId: requestId,
          idempotent: true,
        });
      }
      return NextResponse.json(
        { error: "PM item changed while the request was being created; retry safely" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, serviceRequestId: requestId });
  } catch (error) {
    console.error("[fleet/maintenance] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update PM" },
      { status: 500 },
    );
  }
}
