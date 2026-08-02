import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";
import type {
  FleetInvoiceSummary,
  FleetPriority,
  FleetQuoteLine,
  FleetSummaryBullet,
  FleetUnitOperationalStatus,
  FleetUnitWorkspacePayload,
  FleetWorkOrderHistory,
} from "@/features/fleet/types/workspace";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ unitId: string }> };
type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rowArray(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function priorityBullet(
  id: string,
  priority: FleetPriority,
  label: string,
  detail: string,
  target: FleetSummaryBullet["target"],
): FleetSummaryBullet {
  return { id, priority, label, detail, target };
}

function deriveStatus(requests: Row[]): FleetUnitOperationalStatus {
  const open = requests.filter((request) =>
    ["open", "scheduled"].includes(text(request.status)?.toLowerCase() ?? ""),
  );
  if (
    open.some((request) =>
      ["safety", "compliance"].includes(
        text(request.severity)?.toLowerCase() ?? "",
      ),
    )
  ) {
    return "oos";
  }
  return open.length > 0 ? "limited" : "in_service";
}

export async function GET(_request: Request, { params }: Props) {
  try {
    const { unitId } = await params;
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase);
    const scope = resolveFleetActorScope(actor);

    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!scope?.shopId || actor.actorType === "none") {
      return NextResponse.json({ error: "Fleet access required" }, { status: 403 });
    }

    const admin = createAdminSupabase();
    let enrollmentQuery = admin
      .from("fleet_vehicles")
      .select("fleet_id,vehicle_id,nickname,active,shop_id")
      .eq("shop_id", scope.shopId)
      .eq("vehicle_id", unitId)
      .or("active.is.null,active.eq.true")
      .limit(1);

    if (scope.fleetIds?.length) {
      enrollmentQuery = enrollmentQuery.in("fleet_id", scope.fleetIds);
    }

    const { data: enrollmentRows, error: enrollmentError } = await enrollmentQuery;
    if (enrollmentError) throw new Error(enrollmentError.message);
    const enrollment = rowArray(enrollmentRows)[0];
    if (!enrollment) {
      return NextResponse.json({ error: "Unit not found in your fleet" }, { status: 404 });
    }

    const fleetId = String(enrollment.fleet_id);
    const [
      fleetResult,
      vehicleResult,
      readingResult,
      policyResult,
      dueResult,
      requestResult,
      pretripResult,
      inspectionResult,
      workOrderResult,
    ] = await Promise.all([
      admin.from("fleets").select("id,name").eq("id", fleetId).maybeSingle(),
      admin
        .from("vehicles")
        .select(
          "id,unit_number,year,make,model,vin,license_plate,mileage,engine_hours,asset_type,body_type,engine,transmission,fuel_type,tags,notes",
        )
        .eq("id", unitId)
        .eq("shop_id", scope.shopId)
        .maybeSingle(),
      admin
        .from("fleet_unit_readings")
        .select("id,odometer_km,engine_hours,source_type,recorded_at")
        .eq("fleet_id", fleetId)
        .eq("vehicle_id", unitId)
        .order("recorded_at", { ascending: false })
        .limit(50),
      admin
        .from("fleet_pm_policies")
        .select(
          "id,program_id,name,interval_km,interval_hours,interval_days,anchor_odometer_km,anchor_engine_hours,anchor_date,active",
        )
        .eq("fleet_id", fleetId)
        .eq("vehicle_id", unitId)
        .eq("active", true),
      admin
        .from("fleet_pm_due_events")
        .select(
          "id,policy_id,program_id,status,due_reasons,first_due_at,deferred_until,service_request_id",
        )
        .eq("fleet_id", fleetId)
        .eq("vehicle_id", unitId)
        .order("first_due_at", { ascending: false })
        .limit(50),
      admin
        .from("fleet_service_requests")
        .select(
          "id,title,summary,severity,status,created_at,scheduled_for_date,work_order_id",
        )
        .eq("fleet_id", fleetId)
        .eq("vehicle_id", unitId)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("fleet_pretrip_reports")
        .select(
          "id,driver_name,inspection_date,odometer_km,has_defects,status,notes",
        )
        .eq("fleet_id", fleetId)
        .eq("vehicle_id", unitId)
        .order("inspection_date", { ascending: false })
        .limit(50),
      admin
        .from("fleet_inspection_schedules")
        .select("next_inspection_date")
        .eq("fleet_id", fleetId)
        .eq("vehicle_id", unitId)
        .order("next_inspection_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
      admin
        .from("work_orders")
        .select(
          "id,custom_id,status,approval_state,created_at,updated_at,scheduled_at,expected_completion_at,invoice_total,payment_status,outstanding_balance,paid_at",
        )
        .eq("shop_id", scope.shopId)
        .eq("vehicle_id", unitId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const firstError = [
      fleetResult.error,
      vehicleResult.error,
      readingResult.error,
      policyResult.error,
      dueResult.error,
      requestResult.error,
      pretripResult.error,
      inspectionResult.error,
      workOrderResult.error,
    ].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    const vehicle = (vehicleResult.data ?? {}) as Row;
    const readings = rowArray(readingResult.data);
    const policies = rowArray(policyResult.data);
    const dueEvents = rowArray(dueResult.data);
    const requests = rowArray(requestResult.data);
    const workOrders = rowArray(workOrderResult.data);
    const workOrderIds = workOrders.map((row) => String(row.id));

    const [quoteResult, invoiceResult] = workOrderIds.length
      ? await Promise.all([
          admin
            .from("work_order_quote_lines")
            .select(
              "id,work_order_id,description,status,stage,grand_total,subtotal,sent_to_customer_at,approved_at,declined_at",
            )
            .in("work_order_id", workOrderIds)
            .order("created_at", { ascending: true }),
          admin
            .from("invoice_versions")
            .select(
              "id,work_order_id,version_number,lifecycle_status,currency,total,outstanding_total,paid_total,issued_at",
            )
            .in("work_order_id", workOrderIds)
            .order("version_number", { ascending: false }),
        ])
      : [
          { data: [] as unknown[], error: null },
          { data: [] as unknown[], error: null },
        ];

    if (quoteResult.error) throw new Error(quoteResult.error.message);
    if (invoiceResult.error) throw new Error(invoiceResult.error.message);

    const quotesByWorkOrder = new Map<string, FleetQuoteLine[]>();
    for (const row of rowArray(quoteResult.data)) {
      const workOrderId = String(row.work_order_id);
      const current = quotesByWorkOrder.get(workOrderId) ?? [];
      current.push({
        id: String(row.id),
        description: text(row.description) ?? "Estimate line",
        status: text(row.status) ?? "pending",
        stage: text(row.stage) ?? "advisor_pending",
        total: numberValue(row.grand_total) ?? numberValue(row.subtotal) ?? 0,
        sentAt: iso(row.sent_to_customer_at),
        approvedAt: iso(row.approved_at),
        declinedAt: iso(row.declined_at),
      });
      quotesByWorkOrder.set(workOrderId, current);
    }

    const invoicesByWorkOrder = new Map<string, FleetInvoiceSummary>();
    for (const row of rowArray(invoiceResult.data)) {
      const workOrderId = String(row.work_order_id);
      if (invoicesByWorkOrder.has(workOrderId)) continue;
      invoicesByWorkOrder.set(workOrderId, {
        id: String(row.id),
        workOrderId,
        versionNumber: numberValue(row.version_number) ?? 1,
        lifecycleStatus: text(row.lifecycle_status) ?? "draft",
        currency: text(row.currency)?.toUpperCase() === "USD" ? "USD" : "CAD",
        total: numberValue(row.total) ?? 0,
        outstandingTotal: numberValue(row.outstanding_total) ?? 0,
        paidTotal: numberValue(row.paid_total) ?? 0,
        issuedAt: iso(row.issued_at),
      });
    }

    const history: FleetWorkOrderHistory[] = workOrders.map((row) => {
      const id = String(row.id);
      return {
        id,
        reference: text(row.custom_id) ?? `#${id.slice(0, 8).toUpperCase()}`,
        status: text(row.status) ?? "open",
        approvalState: text(row.approval_state),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        scheduledAt: iso(row.scheduled_at),
        completedAt: iso(row.paid_at),
        invoiceTotal: numberValue(row.invoice_total) ?? 0,
        paymentStatus: text(row.payment_status) ?? "unpaid",
        outstandingBalance: numberValue(row.outstanding_balance) ?? 0,
        quoteLines: quotesByWorkOrder.get(id) ?? [],
        invoice: invoicesByWorkOrder.get(id) ?? null,
      };
    });

    const policiesById = new Map(policies.map((row) => [String(row.id), row]));
    const maintenance = dueEvents.map((row) => {
      const policy = policiesById.get(String(row.policy_id)) ?? {};
      return {
        id: String(row.id),
        policyId: String(row.policy_id),
        programId: String(row.program_id),
        name: text(policy.name) ?? "Preventive maintenance",
        status: text(row.status) ?? "pending",
        dueReasons: Array.isArray(row.due_reasons)
          ? row.due_reasons.map(String)
          : [],
        firstDueAt: iso(row.first_due_at) ?? new Date().toISOString(),
        deferredUntil: text(row.deferred_until),
        serviceRequestId: text(row.service_request_id),
        intervalKm: numberValue(policy.interval_km),
        intervalHours: numberValue(policy.interval_hours),
        intervalDays: numberValue(policy.interval_days),
        anchorOdometerKm: numberValue(policy.anchor_odometer_km),
        anchorEngineHours: numberValue(policy.anchor_engine_hours),
        anchorDate: text(policy.anchor_date),
      };
    });

    const openRequests = requests.filter((row) =>
      ["open", "scheduled"].includes(text(row.status) ?? ""),
    ).length;
    const openApprovals = history.reduce(
      (total, row) =>
        total +
        row.quoteLines.filter(
          (line) =>
            Boolean(line.sentAt) &&
            !line.approvedAt &&
            !line.declinedAt &&
            !["declined", "deferred", "converted"].includes(line.status),
        ).length,
      0,
    );
    const activePmDue = maintenance.filter((item) =>
      ["pending", "deferred", "converted"].includes(item.status),
    ).length;
    const outstandingBalance = history.reduce(
      (total, row) => total + (row.invoice?.outstandingTotal ?? row.outstandingBalance),
      0,
    );
    const lifetimeSpend = history.reduce(
      (total, row) => total + (row.invoice?.total ?? row.invoiceTotal),
      0,
    );
    const latestReading = readings[0] ?? {};
    const summary: FleetSummaryBullet[] = [];

    if (deriveStatus(requests) === "oos") {
      summary.push(
        priorityBullet(
          "oos",
          "critical",
          "Unit needs immediate attention",
          "An open safety or compliance request is keeping this unit out of service.",
          "overview",
        ),
      );
    }
    if (activePmDue > 0) {
      summary.push(
        priorityBullet(
          "pm",
          "attention",
          `${activePmDue} PM item${activePmDue === 1 ? "" : "s"} need review`,
          "Open Maintenance to schedule, defer, or turn due work into a service request.",
          "maintenance",
        ),
      );
    }
    if (openApprovals > 0) {
      summary.push(
        priorityBullet(
          "approvals",
          "attention",
          `${openApprovals} estimate line${openApprovals === 1 ? "" : "s"} await approval`,
          "Review the exact estimate lines in service history or Fleet Billing.",
          "history",
        ),
      );
    }
    if (outstandingBalance > 0) {
      summary.push(
        priorityBullet(
          "balance",
          "info",
          "Invoice balance is outstanding",
          "Fleet Billing shows the issued invoice and online payment option.",
          "history",
        ),
      );
    }
    if (!summary.length) {
      summary.push(
        priorityBullet(
          "healthy",
          "good",
          "No urgent fleet action for this unit",
          "PM, requests, approvals, and invoices are currently clear.",
          "overview",
        ),
      );
    }

    const fleet = (fleetResult.data ?? {}) as Row;
    const label =
      text(enrollment.nickname) ??
      text(vehicle.unit_number) ??
      text(vehicle.license_plate) ??
      text(vehicle.vin) ??
      "Fleet unit";

    const payload: FleetUnitWorkspacePayload = {
      unit: {
        id: unitId,
        fleetId,
        fleetName: text(fleet.name) ?? "Fleet",
        label,
        status: deriveStatus(requests),
        year: numberValue(vehicle.year),
        make: text(vehicle.make),
        model: text(vehicle.model),
        vin: text(vehicle.vin),
        plate: text(vehicle.license_plate),
        assetType: text(vehicle.asset_type),
        bodyType: text(vehicle.body_type),
        engine: text(vehicle.engine),
        transmission: text(vehicle.transmission),
        fuelType: text(vehicle.fuel_type),
        tags: text(vehicle.tags),
        notes: text(vehicle.notes),
        currentOdometerKm:
          numberValue(latestReading.odometer_km) ??
          numberValue(vehicle.mileage),
        currentEngineHours:
          numberValue(latestReading.engine_hours) ??
          numberValue(vehicle.engine_hours),
        lastReadingAt: iso(latestReading.recorded_at),
        nextInspectionDate: text((inspectionResult.data as Row | null)?.next_inspection_date),
      },
      metrics: {
        openRequests,
        openApprovals,
        activePmDue,
        lifetimeWorkOrders: history.length,
        lifetimeSpend,
        outstandingBalance,
      },
      summary,
      maintenance,
      requests: requests.map((row) => ({
        id: String(row.id),
        title: text(row.title) ?? "Service request",
        summary: text(row.summary) ?? "",
        severity: text(row.severity) ?? "recommend",
        status: text(row.status) ?? "open",
        createdAt: iso(row.created_at) ?? new Date().toISOString(),
        scheduledForDate: text(row.scheduled_for_date),
        workOrderId: text(row.work_order_id),
      })),
      workOrders: history,
      readings: readings.map((row) => ({
        id: String(row.id),
        odometerKm: numberValue(row.odometer_km),
        engineHours: numberValue(row.engine_hours),
        sourceType: text(row.source_type) ?? "manual",
        recordedAt: iso(row.recorded_at) ?? new Date().toISOString(),
      })),
      pretrips: rowArray(pretripResult.data).map((row) => ({
        id: String(row.id),
        driverName: text(row.driver_name) ?? "Driver",
        inspectionDate: text(row.inspection_date) ?? "",
        odometerKm: numberValue(row.odometer_km),
        hasDefects: row.has_defects === true,
        status: text(row.status) ?? "open",
        notes: text(row.notes),
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[fleet/unit-workspace] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load unit workspace" },
      { status: 500 },
    );
  }
}
