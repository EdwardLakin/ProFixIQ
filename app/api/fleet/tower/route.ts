// app/api/fleet/tower/route.ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type {
  FleetUnit,
  FleetIssue,
  DispatchAssignment,
} from "@/features/fleet/components/FleetControlTower";

type DB = Database;

type FleetVehicleRow = DB["public"]["Tables"]["fleet_vehicles"]["Row"];
type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type DispatchRow =
  DB["public"]["Tables"]["fleet_dispatch_assignments"]["Row"];
type FleetInspectionScheduleRow =
  DB["public"]["Tables"]["fleet_inspection_schedules"]["Row"];

type FleetVehicleJoinedRow = FleetVehicleRow & {
  fleets: Pick<FleetRow, "shop_id"> | null;
  vehicles: Pick<
    VehicleRow,
    "id" | "unit_number" | "license_plate" | "vin" | "make" | "model" | "year"
  > | null;
};

type ServiceRequestSelect = Pick<
  FleetServiceRequestRow,
  "id" | "vehicle_id" | "title" | "summary" | "severity" | "status" | "created_at"
>;

type DispatchSelect = Pick<
  DispatchRow,
  | "id"
  | "shop_id"
  | "vehicle_id"
  | "driver_profile_id"
  | "driver_name"
  | "route_label"
  | "next_pretrip_due"
  | "state"
  | "unit_label"
  | "vehicle_identifier"
>;

type InspectionScheduleSelect = Pick<
  FleetInspectionScheduleRow,
  "vehicle_id" | "next_inspection_date"
>;

async function resolveShopId(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  explicitShopId: string | null,
): Promise<string | null> {
  if (explicitShopId) return explicitShopId;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.shop_id) return null;

  return profile.shop_id;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const body = (await req.json().catch(() => ({}))) as {
      shopId?: string | null;
    };

    const shopId = await resolveShopId(supabase, body.shopId ?? null);

    if (!shopId) {
      return NextResponse.json(
        { error: "Unable to resolve shop for fleet tower." },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // 1) Active fleet vehicles for this shop (joined to fleets + vehicles)
    // -----------------------------------------------------------------------
    const { data: fleetRowsRaw, error: fleetError } = await supabase
      .from("fleet_vehicles")
      .select(
        `
        fleet_id,
        vehicle_id,
        active,
        nickname,
        custom_interval_km,
        custom_interval_hours,
        custom_interval_days,
        fleets!inner (
          shop_id
        ),
        vehicles!inner (
          id,
          unit_number,
          license_plate,
          vin,
          make,
          model,
          year
        )
      `,
      )
      .eq("active", true)
      .eq("fleets.shop_id", shopId);

    if (fleetError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/tower] fleet_vehicles error", fleetError);
      return NextResponse.json(
        { error: "Failed to load fleet units." },
        { status: 500 },
      );
    }

    const fleetRows: FleetVehicleJoinedRow[] =
      (fleetRowsRaw ?? []) as unknown as FleetVehicleJoinedRow[];

    const vehicleIds = fleetRows.map((row) => row.vehicle_id);

    // Map of vehicle_id -> label/plate/vin
    const vehicleMeta = new Map<
      string,
      { label: string; plate: string | null; vin: string | null }
    >();

    for (const row of fleetRows) {
      const vehicle = row.vehicles;

      const label =
        row.nickname ||
        vehicle?.unit_number ||
        vehicle?.license_plate ||
        vehicle?.vin ||
        "Unit";

      vehicleMeta.set(row.vehicle_id, {
        label,
        plate: vehicle?.license_plate ?? null,
        vin: vehicle?.vin ?? null,
      });
    }

    // -----------------------------------------------------------------------
    // 2) CVIP / inspection schedules (per vehicle) → nextInspectionDate
    //    (only if we actually have vehicles)
    // -----------------------------------------------------------------------
    let scheduleRowsTyped: InspectionScheduleSelect[] = [];

    if (vehicleIds.length > 0) {
      const { data: scheduleRows, error: scheduleError } = await supabase
        .from("fleet_inspection_schedules")
        .select("vehicle_id, next_inspection_date")
        // rely on RLS + vehicle_id, don't over-filter by shop_id
        .in("vehicle_id", vehicleIds);

      if (scheduleError) {
        // eslint-disable-next-line no-console
        console.error(
          "[fleet/tower] inspection_schedules error",
          scheduleError,
        );
        return NextResponse.json(
          { error: "Failed to load inspection schedules." },
          { status: 500 },
        );
      }

      scheduleRowsTyped =
        (scheduleRows ?? []) as unknown as InspectionScheduleSelect[];
    }

    const inspectionByVehicle = new Map<string, string | null>();
    for (const row of scheduleRowsTyped) {
      inspectionByVehicle.set(
        row.vehicle_id,
        row.next_inspection_date ?? null,
      );
    }

    // -----------------------------------------------------------------------
    // 3) Service requests for these vehicles (open/scheduled/completed)
    // -----------------------------------------------------------------------
    let serviceRequestsTyped: ServiceRequestSelect[] = [];

    if (vehicleIds.length > 0) {
      const { data: serviceRequests, error: srError } = await supabase
        .from("fleet_service_requests")
        .select(
          "id, vehicle_id, title, summary, severity, status, created_at",
        )
        .eq("shop_id", shopId)
        .in("vehicle_id", vehicleIds)
        .neq("status", "cancelled");

      if (srError) {
        // eslint-disable-next-line no-console
        console.error("[fleet/tower] service_requests error", srError);
        return NextResponse.json(
          { error: "Failed to load fleet service requests." },
          { status: 500 },
        );
      }

      serviceRequestsTyped =
        (serviceRequests ?? []) as unknown as ServiceRequestSelect[];
    }

    // Group service requests by vehicle for quick lookup
    const requestsByVehicle = new Map<string, ServiceRequestSelect[]>();
    for (const sr of serviceRequestsTyped) {
      const arr = requestsByVehicle.get(sr.vehicle_id) ?? [];
      arr.push(sr);
      requestsByVehicle.set(sr.vehicle_id, arr);
    }

    // -----------------------------------------------------------------------
    // 4) Dispatch assignments (independent of whether units exist)
    // -----------------------------------------------------------------------
    const { data: dispatchRaw, error: dispatchError } = await supabase
      .from("fleet_dispatch_assignments")
      .select(
        "id, shop_id, vehicle_id, driver_profile_id, driver_name, route_label, next_pretrip_due, state, unit_label, vehicle_identifier",
      )
      .eq("shop_id", shopId);

    if (dispatchError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/tower] dispatch_assignments error", dispatchError);
      return NextResponse.json(
        { error: "Failed to load dispatch assignments." },
        { status: 500 },
      );
    }

    const dispatchRows: DispatchSelect[] =
      (dispatchRaw ?? []) as unknown as DispatchSelect[];

    // -----------------------------------------------------------------------
    // 5) Build units payload (status + nextInspectionDate)
    // -----------------------------------------------------------------------
    const units: FleetUnit[] = fleetRows.map((row) => {
      const meta = vehicleMeta.get(row.vehicle_id) ?? {
        label: "Unit",
        plate: null,
        vin: null,
      };

      const relatedRequests = requestsByVehicle.get(row.vehicle_id) ?? [];

      let status: FleetUnit["status"] = "in_service";

      const hasSafety = relatedRequests.some((sr) => {
        const st = (sr.status ?? "").toLowerCase();
        const sev = (sr.severity ?? "").toLowerCase();
        return (
          (st === "open" || st === "scheduled") &&
          (sev === "safety" || sev === "compliance")
        );
      });

      const hasOther = relatedRequests.some((sr) => {
        const st = (sr.status ?? "").toLowerCase();
        return st === "open" || st === "scheduled";
      });

      if (hasSafety) status = "oos";
      else if (hasOther) status = "limited";

      const nextInspectionDate = inspectionByVehicle.get(row.vehicle_id) ?? null;

      return {
        id: row.vehicle_id,
        label: meta.label,
        plate: meta.plate,
        vin: meta.vin,
        class: null,
        location: null,
        status,
        nextInspectionDate,
      };
    });

    // -----------------------------------------------------------------------
    // 6) Build issues payload
    // -----------------------------------------------------------------------
    const issues: FleetIssue[] = serviceRequestsTyped.map((sr) => {
      const meta = vehicleMeta.get(sr.vehicle_id) ?? {
        label: "Unit",
        plate: null,
        vin: null,
      };

      const sevLower = (sr.severity ?? "").toLowerCase();
      let severity: FleetIssue["severity"] = "recommend";
      if (sevLower === "safety" || sevLower === "compliance") {
        severity = sevLower as FleetIssue["severity"];
      }

      const stLower = (sr.status ?? "").toLowerCase();
      let status: FleetIssue["status"] = "open";
      if (stLower === "scheduled") status = "scheduled";
      if (stLower === "completed") status = "completed";

      return {
        id: sr.id,
        unitId: sr.vehicle_id,
        unitLabel: meta.label,
        severity,
        summary: sr.summary || sr.title,
        createdAt: sr.created_at,
        status,
      };
    });

    // -----------------------------------------------------------------------
    // 7) Build assignments payload
    // -----------------------------------------------------------------------
    const assignments: DispatchAssignment[] = dispatchRows.map((row) => {
      const meta = vehicleMeta.get(row.vehicle_id) ?? {
        label: "Unit",
        plate: null,
        vin: null,
      };

      const stateLower = (row.state ?? "").toLowerCase();

      let uiState: DispatchAssignment["state"];
      if (stateLower === "completed") {
        uiState = "in_shop";
      } else if (
        stateLower === "pretrip_due" ||
        stateLower === "en_route" ||
        stateLower === "in_shop"
      ) {
        uiState = stateLower as DispatchAssignment["state"];
      } else {
        uiState = "pretrip_due";
      }

      return {
        id: row.id,
        driverName: row.driver_name ?? "Unassigned",
        driverId: row.driver_profile_id,
        unitLabel: row.unit_label || meta.label,
        unitId: row.vehicle_id,
        routeLabel: row.route_label,
        nextPreTripDue: row.next_pretrip_due,
        state: uiState,
      };
    });

    return NextResponse.json({
      units,
      issues,
      assignments,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fleet/tower] error", err);
    return NextResponse.json(
      { error: "Failed to load fleet tower data." },
      { status: 500 },
    );
  }
}