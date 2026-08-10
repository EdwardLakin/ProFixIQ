import { NextResponse } from "next/server";

import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";
import {
  DEFAULT_FLEET_PRETRIP_TEMPLATE,
  normalizeFleetPretripTemplateSections,
  type FleetDriverDashboardPayload,
  type FleetDriverIssueStatus,
  type FleetDriverIssueTimelineStep,
  type FleetPretripTemplate,
} from "@/features/fleet/types/driverPortal";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function joinedRow(value: unknown): Row {
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? {};
  return value && typeof value === "object" ? (value as Row) : {};
}

const TERMINAL_SHOP_STATUSES = new Set([
  "completed",
  "closed",
  "invoiced",
  "paid",
]);

function issueStatus(row: Row, workOrder: Row): FleetDriverIssueStatus {
  if (text(row.resolved_at)) {
    return text(row.resolution_code) === "completed" || text(row.work_order_id)
      ? "completed"
      : "closed";
  }
  if (TERMINAL_SHOP_STATUSES.has(text(workOrder.status)?.toLowerCase() ?? "")) {
    return "completed";
  }
  if (text(row.work_order_id) || text(workOrder.id)) return "in_shop";
  if (text(row.service_request_id)) return "scheduled";
  if (text(row.acknowledged_at) || text(row.state) === "acknowledged") {
    return "under_review";
  }
  return "submitted";
}

function vehicleType(vehicle: Row): string {
  return text(vehicle.asset_type) ?? text(vehicle.body_type) ?? "Fleet asset";
}

function templateForVehicle(
  vehicle: Row,
  templateRows: Row[],
): FleetPretripTemplate {
  const type = vehicleType(vehicle);
  const normalized = type.toLowerCase();
  const match =
    templateRows.find(
      (row) => text(row.vehicle_type)?.toLowerCase() === normalized,
    ) ??
    templateRows.find((row) =>
      ["all", "all fleet assets", "fleet asset"].includes(
        text(row.vehicle_type)?.toLowerCase() ?? "",
      ),
    );
  if (!match) return DEFAULT_FLEET_PRETRIP_TEMPLATE;

  const template = joinedRow(match.inspection_templates);
  const sections = normalizeFleetPretripTemplateSections(template.sections);
  if (!sections.length) return DEFAULT_FLEET_PRETRIP_TEMPLATE;

  return {
    assignmentId: String(match.id),
    templateId: String(match.inspection_template_id),
    name: text(template.template_name) ?? "Fleet pre-trip",
    vehicleType: text(match.vehicle_type) ?? type,
    version: Number(match.version) || 1,
    sections,
  };
}

export async function GET(request: Request) {
  try {
    const requestedFleetId = new URL(request.url).searchParams.get("fleetId");
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId,
    });
    const scope = resolveFleetActorScope(actor, {
      explicitFleetId: requestedFleetId,
      preferMembershipFleet: true,
    });
    const fleetId = scope?.fleetId;

    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (actor.actorType !== "fleet_driver" || !scope?.shopId || !fleetId) {
      return NextResponse.json(
        { error: "Fleet driver access required" },
        { status: 403 },
      );
    }

    const admin = createAdminSupabase();
    const [
      fleetResult,
      profileResult,
      assignmentResult,
      enrollmentResult,
      defectResult,
      clarificationResult,
      templateResult,
    ] = await Promise.all([
      admin
        .from("fleets")
        .select("id,name")
        .eq("id", fleetId)
        .eq("shop_id", scope.shopId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id,full_name,email")
        .eq("id", actor.userId)
        .maybeSingle(),
      admin
        .from("fleet_dispatch_assignments")
        .select(
          "id,fleet_id,vehicle_id,unit_label,route_label,state,next_pretrip_due,vehicles!inner(id,unit_number,license_plate,vin,asset_type,body_type)",
        )
        .eq("shop_id", scope.shopId)
        .eq("fleet_id", fleetId)
        .eq("driver_profile_id", actor.userId)
        .eq("active", true)
        .order("assigned_at", { ascending: false }),
      admin
        .from("fleet_vehicles")
        .select(
          "vehicle_id,nickname,vehicles!inner(id,unit_number,license_plate,vin,asset_type,body_type)",
        )
        .eq("shop_id", scope.shopId)
        .eq("fleet_id", fleetId)
        .or("active.is.null,active.eq.true"),
      admin
        .from("fleet_unit_defects")
        .select(
          "id,vehicle_id,label,description,severity,state,reported_at,acknowledged_at,service_request_id,work_order_id,resolved_at,resolution_code",
        )
        .eq("shop_id", scope.shopId)
        .eq("fleet_id", fleetId)
        .eq("reported_by", actor.userId)
        .order("reported_at", { ascending: false })
        .limit(100),
      admin
        .from("fleet_defect_clarifications")
        .select(
          "id,defect_id,prompt,response_type,status,requested_at,response_text,responded_at,fleet_unit_defects!inner(reported_by)",
        )
        .eq("shop_id", scope.shopId)
        .eq("fleet_id", fleetId)
        .eq("fleet_unit_defects.reported_by", actor.userId)
        .order("requested_at", { ascending: false })
        .limit(200),
      admin
        .from("fleet_pretrip_template_assignments")
        .select(
          "id,inspection_template_id,vehicle_type,version,inspection_templates!inner(template_name,sections)",
        )
        .eq("shop_id", scope.shopId)
        .eq("fleet_id", fleetId)
        .eq("active", true),
    ]);

    const firstError = [
      fleetResult.error,
      profileResult.error,
      assignmentResult.error,
      enrollmentResult.error,
      defectResult.error,
      clarificationResult.error,
      templateResult.error,
    ].find(Boolean);
    if (firstError) throw new Error(firstError.message);
    if (!fleetResult.data || !profileResult.data) {
      return NextResponse.json(
        { error: "Fleet driver workspace is unavailable" },
        { status: 404 },
      );
    }

    const defectRows = rows(defectResult.data);
    const serviceRequestIds = Array.from(
      new Set(
        defectRows
          .map((row) => text(row.service_request_id))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const serviceRequestResult = serviceRequestIds.length
      ? await admin
          .from("fleet_service_requests")
          .select(
            "id,submitted_at,created_at,updated_at,scheduled_for_date,work_order_id",
          )
          .eq("shop_id", scope.shopId)
          .eq("fleet_id", fleetId)
          .in("id", serviceRequestIds)
      : { data: [] as unknown[], error: null };
    if (serviceRequestResult.error) {
      throw new Error(serviceRequestResult.error.message);
    }
    const serviceRequestRows = rows(serviceRequestResult.data);
    const workOrderIds = Array.from(
      new Set(
        [
          ...defectRows.map((row) => text(row.work_order_id)),
          ...serviceRequestRows.map((row) => text(row.work_order_id)),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
    const workOrderResult = workOrderIds.length
      ? await admin
          .from("work_orders")
          .select("id,status,created_at,updated_at")
          .eq("shop_id", scope.shopId)
          .in("id", workOrderIds)
      : { data: [] as unknown[], error: null };
    if (workOrderResult.error) throw new Error(workOrderResult.error.message);

    const serviceRequests = new Map(
      serviceRequestRows.map((row) => [String(row.id), row]),
    );
    const workOrders = new Map(
      rows(workOrderResult.data).map((row) => [String(row.id), row]),
    );

    const enrollments = rows(enrollmentResult.data);
    const unitLabels = new Map<string, string>();
    const trailerOptions: FleetDriverDashboardPayload["trailers"] = [];
    for (const enrollment of enrollments) {
      const vehicle = joinedRow(enrollment.vehicles);
      const id = String(enrollment.vehicle_id);
      const label =
        text(enrollment.nickname) ??
        text(vehicle.unit_number) ??
        text(vehicle.license_plate) ??
        text(vehicle.vin) ??
        "Unit";
      unitLabels.set(id, label);
      const type = vehicleType(vehicle).toLowerCase();
      if (type.includes("trailer")) trailerOptions.push({ id, label });
    }

    const templateRows = rows(templateResult.data);
    const assignments = rows(assignmentResult.data).map((assignment) => {
      const vehicle = joinedRow(assignment.vehicles);
      const vehicleId = String(assignment.vehicle_id);
      const rawState = text(assignment.state);
      const state =
        rawState === "en_route" || rawState === "in_shop"
          ? rawState
          : "pretrip_due";
      return {
        id: String(assignment.id),
        fleetId,
        vehicleId,
        unitLabel:
          text(assignment.unit_label) ??
          unitLabels.get(vehicleId) ??
          text(vehicle.unit_number) ??
          "Unit",
        routeLabel: text(assignment.route_label),
        state,
        nextPretripDue: text(assignment.next_pretrip_due),
        vehicleType: vehicleType(vehicle),
        template: templateForVehicle(vehicle, templateRows),
      } satisfies FleetDriverDashboardPayload["assignments"][number];
    });

    const clarificationsByDefect = new Map<string, Row>();
    for (const clarification of rows(clarificationResult.data)) {
      const defectId = String(clarification.defect_id);
      if (!clarificationsByDefect.has(defectId)) {
        clarificationsByDefect.set(defectId, clarification);
      }
    }

    const issues = defectRows.map((defect) => {
      const id = String(defect.id);
      const clarification = clarificationsByDefect.get(id);
      const serviceRequest = text(defect.service_request_id)
        ? (serviceRequests.get(String(defect.service_request_id)) ?? {})
        : {};
      const linkedWorkOrderId =
        text(defect.work_order_id) ?? text(serviceRequest.work_order_id);
      const workOrder = linkedWorkOrderId
        ? (workOrders.get(linkedWorkOrderId) ?? {})
        : {};
      const status = issueStatus(defect, workOrder);
      const reportedAt = String(defect.reported_at);
      const acknowledgedAt = text(defect.acknowledged_at);
      const scheduledAt =
        text(serviceRequest.submitted_at) ?? text(serviceRequest.created_at);
      const inShopAt = text(workOrder.created_at);
      const completedAt =
        text(defect.resolved_at) ??
        (TERMINAL_SHOP_STATUSES.has(text(workOrder.status)?.toLowerCase() ?? "")
          ? text(workOrder.updated_at)
          : null);
      const timeline: FleetDriverIssueTimelineStep[] = [
        { status: "submitted", reachedAt: reportedAt },
        { status: "under_review", reachedAt: acknowledgedAt },
        { status: "scheduled", reachedAt: scheduledAt },
        { status: "in_shop", reachedAt: inShopAt },
        { status: "completed", reachedAt: completedAt },
      ];
      const lastUpdatedAt =
        completedAt ??
        text(workOrder.updated_at) ??
        text(serviceRequest.updated_at) ??
        acknowledgedAt ??
        reportedAt;
      return {
        id,
        vehicleId: String(defect.vehicle_id),
        unitLabel: unitLabels.get(String(defect.vehicle_id)) ?? "Unit",
        label: text(defect.label) ?? "Reported issue",
        description: text(defect.description),
        severity: ([
          "safety",
          "compliance",
          "maintenance",
          "recommend",
        ].includes(text(defect.severity) ?? "")
          ? text(defect.severity)
          : "recommend") as FleetDriverDashboardPayload["issues"][number]["severity"],
        status,
        reportedAt,
        acknowledgedAt,
        resolvedAt: text(defect.resolved_at),
        lastUpdatedAt,
        timeline,
        clarification: clarification
          ? {
              id: String(clarification.id),
              defectId: id,
              prompt:
                text(clarification.prompt) ??
                "Please provide more information.",
              responseType: (text(clarification.response_type) ?? "answer") as
                | "answer"
                | "photo"
                | "voice",
              status: (text(clarification.status) ?? "requested") as
                | "requested"
                | "responded"
                | "closed",
              requestedAt: String(clarification.requested_at),
              responseText: text(clarification.response_text),
              respondedAt: text(clarification.responded_at),
            }
          : null,
      } satisfies FleetDriverDashboardPayload["issues"][number];
    });

    const payload: FleetDriverDashboardPayload = {
      fleetId,
      fleetName: fleetResult.data.name,
      driverName:
        profileResult.data.full_name?.trim() ||
        profileResult.data.email?.trim() ||
        "Driver",
      assignments,
      issues,
      trailers: trailerOptions.sort((left, right) =>
        left.label.localeCompare(right.label),
      ),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[fleet/driver/dashboard]", error);
    return NextResponse.json(
      { error: "Unable to load the driver dashboard" },
      { status: 500 },
    );
  }
}
