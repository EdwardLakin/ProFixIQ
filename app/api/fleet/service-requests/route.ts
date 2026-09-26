import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { resolveServiceRequestsAccess } from "@/features/fleet/lib/resolveServiceRequestsAccess";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Body = { fleetId?: string | null };

const TERMINAL_REQUEST_STATUSES = new Set([
  "completed",
  "closed",
  "cancelled",
  "declined",
  "rejected",
]);

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function iso(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function projectedRequestStatus(requestStatus: unknown, shopStatus: unknown) {
  const current = clean(requestStatus)?.toLowerCase() ?? "open";
  const repair = clean(shopStatus)?.toLowerCase() ?? "";
  if (["completed", "closed", "invoiced", "paid"].includes(repair)) {
    return "completed";
  }
  if (["cancelled", "canceled"].includes(repair)) return "cancelled";
  if (repair) return "scheduled";
  return current;
}

/**
 * Lightweight access check for nav visibility only (no request data) — e.g.
 * the mobile Resume/Work menu deciding whether to show a "Service Requests"
 * link at all, rather than showing it to every shop-side role and letting
 * the page itself 403. Shares resolveServiceRequestsAccess with POST so
 * this can never authorize something the real endpoint would reject.
 */
export async function GET(request: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const requestedFleetId = new URL(request.url).searchParams.get("fleetId");
    const access = await resolveServiceRequestsAccess(supabase, {
      requestedFleetId,
    });
    return NextResponse.json({ canAccess: access.ok });
  } catch (error) {
    console.error("[fleet/service-requests] access check error", error);
    return NextResponse.json({ canAccess: false });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const body = (await request.json().catch(() => ({}))) as Body;
    const access = await resolveServiceRequestsAccess(supabase, {
      requestedFleetId: body.fleetId ?? null,
    });
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }
    const { scope, isCanonicalFleetManager, dispatcherView, hasFieldAccess } =
      access;

    const admin = createAdminSupabase();
    let enrollmentQuery = admin
      .from("fleet_vehicles")
      .select("fleet_id,vehicle_id,nickname,active")
      .eq("shop_id", scope.shopId)
      .or("active.is.null,active.eq.true");
    if (scope.fleetIds?.length) {
      enrollmentQuery = enrollmentQuery.in("fleet_id", scope.fleetIds);
    }

    const { data: enrollmentData, error: enrollmentError } =
      await enrollmentQuery;
    if (enrollmentError) throw new Error(enrollmentError.message);
    const enrollments = rows(enrollmentData);
    const vehicleIds = Array.from(
      new Set(enrollments.map((row) => String(row.vehicle_id))),
    );
    const fleetIds = Array.from(
      new Set(enrollments.map((row) => String(row.fleet_id))),
    );

    if (!vehicleIds.length || !fleetIds.length) {
      return NextResponse.json({
        canManage: isCanonicalFleetManager || hasFieldAccess,
        summary: { open: 0, scheduled: 0, awaitingApproval: 0, completed: 0 },
        requests: [],
      });
    }

    const [vehicleResult, fleetResult, requestResult] = await Promise.all([
      admin
        .from("vehicles")
        .select("id,unit_number,license_plate,vin,year,make,model")
        .eq("shop_id", scope.shopId)
        .in("id", vehicleIds),
      admin.from("fleets").select("id,name").in("id", fleetIds),
      admin
        .from("fleet_service_requests")
        .select(
          "id,fleet_id,vehicle_id,title,summary,severity,status,created_at,updated_at,requested_for_date,scheduled_for_date,work_order_id,source_pm_due_event_id",
        )
        .eq("shop_id", scope.shopId)
        .in("fleet_id", fleetIds)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    const firstError = [
      vehicleResult.error,
      fleetResult.error,
      requestResult.error,
    ].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    const requests = rows(requestResult.data);
    const requestIds = requests.map((row) => String(row.id));
    const { data: workOrderData, error: workOrderError } = requestIds.length
      ? dispatcherView
        ? await admin
            .from("work_orders")
            .select(
              "id,source_fleet_service_request_id,status,scheduled_at,expected_completion_at",
            )
            .eq("shop_id", scope.shopId)
            .in("source_fleet_service_request_id", requestIds)
        : await admin
            .from("work_orders")
            .select(
              "id,source_fleet_service_request_id,custom_id,status,approval_state,scheduled_at,expected_completion_at,payment_status,outstanding_balance",
            )
            .eq("shop_id", scope.shopId)
            .in("source_fleet_service_request_id", requestIds)
      : { data: [] as unknown[], error: null };
    if (workOrderError) throw new Error(workOrderError.message);

    const workOrderRows = rows(workOrderData);
    const workOrderIds = workOrderRows.map((row) => String(row.id));
    const { data: quoteData, error: quoteError } =
      workOrderIds.length && !dispatcherView
        ? await admin
            .from("work_order_quote_lines")
            .select(
              "id,work_order_id,status,sent_to_customer_at,approved_at,declined_at",
            )
            .eq("shop_id", scope.shopId)
            .in("work_order_id", workOrderIds)
        : { data: [] as unknown[], error: null };
    if (quoteError) throw new Error(quoteError.message);

    const pendingApprovalsByWorkOrder = new Map<string, number>();
    for (const quote of rows(quoteData)) {
      const status = clean(quote.status)?.toLowerCase() ?? "";
      const needsDecision =
        Boolean(quote.sent_to_customer_at) &&
        !quote.approved_at &&
        !quote.declined_at &&
        ![
          "approved",
          "converted",
          "declined",
          "deferred",
          "rejected",
          "cancelled",
        ].includes(status);
      if (!needsDecision) continue;
      const key = String(quote.work_order_id);
      pendingApprovalsByWorkOrder.set(
        key,
        (pendingApprovalsByWorkOrder.get(key) ?? 0) + 1,
      );
    }

    const vehicles = new Map(
      rows(vehicleResult.data).map((row) => [String(row.id), row]),
    );
    const fleets = new Map(
      rows(fleetResult.data).map((row) => [
        String(row.id),
        clean(row.name) ?? "Fleet",
      ]),
    );
    const enrollmentByVehicle = new Map(
      enrollments.map((row) => [String(row.vehicle_id), row]),
    );
    const workOrders = new Map(
      workOrderRows.map((row) => [
        String(row.source_fleet_service_request_id),
        row,
      ]),
    );

    const payload = requests.map((row) => {
      const vehicle = vehicles.get(String(row.vehicle_id)) ?? {};
      const enrollment = enrollmentByVehicle.get(String(row.vehicle_id)) ?? {};
      const workOrder = workOrders.get(String(row.id)) ?? {};
      const approvalState = clean(workOrder.approval_state);
      const needsApproval =
        Boolean(clean(workOrder.id)) &&
        (pendingApprovalsByWorkOrder.get(String(workOrder.id)) ?? 0) > 0;
      const status = projectedRequestStatus(row.status, workOrder.status);

      return {
        id: String(row.id),
        fleetId: String(row.fleet_id),
        fleetName: fleets.get(String(row.fleet_id)) ?? "Fleet",
        vehicleId: String(row.vehicle_id),
        unitLabel:
          clean(enrollment.nickname) ??
          clean(vehicle.unit_number) ??
          clean(vehicle.license_plate) ??
          clean(vehicle.vin) ??
          "Unit",
        vehicleDescription: [
          vehicle.year,
          clean(vehicle.make),
          clean(vehicle.model),
        ]
          .filter(Boolean)
          .join(" "),
        title: clean(row.title) ?? "Service request",
        summary: clean(row.summary) ?? "",
        severity: clean(row.severity) ?? "recommend",
        status,
        createdAt: iso(row.created_at) ?? new Date().toISOString(),
        updatedAt: iso(row.updated_at),
        requestedForDate: clean(row.requested_for_date),
        scheduledForDate: clean(row.scheduled_for_date),
        sourcePmDueEventId: clean(row.source_pm_due_event_id),
        workOrder: clean(workOrder.id)
          ? dispatcherView
            ? null
            : {
                id: String(workOrder.id),
                reference:
                  clean(workOrder.custom_id) ??
                  `#${String(workOrder.id).slice(0, 8).toUpperCase()}`,
                status: clean(workOrder.status) ?? "open",
                approvalState,
                needsApproval,
                scheduledAt: iso(workOrder.scheduled_at),
                expectedCompletionAt: iso(workOrder.expected_completion_at),
                paymentStatus: clean(workOrder.payment_status) ?? "unpaid",
                outstandingBalance: Number(workOrder.outstanding_balance) || 0,
              }
          : null,
        shopProgress: clean(workOrder.id)
          ? {
              status: clean(workOrder.status) ?? "open",
              scheduledAt: iso(workOrder.scheduled_at),
              expectedCompletionAt: iso(workOrder.expected_completion_at),
            }
          : null,
      };
    });

    return NextResponse.json({
      canManage: isCanonicalFleetManager || hasFieldAccess,
      summary: {
        open: payload.filter((item) => item.status === "open").length,
        scheduled: payload.filter((item) => item.status === "scheduled").length,
        awaitingApproval: dispatcherView
          ? 0
          : payload.filter((item) => item.workOrder?.needsApproval).length,
        completed: payload.filter((item) =>
          ["completed", "closed"].includes(item.status),
        ).length,
        terminal: payload.filter((item) =>
          TERMINAL_REQUEST_STATUSES.has(item.status),
        ).length,
      },
      requests: payload,
    });
  } catch (error) {
    console.error("[fleet/service-requests] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load service requests",
      },
      { status: 500 },
    );
  }
}
