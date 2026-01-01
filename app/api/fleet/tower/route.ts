import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type {
  DispatchAssignment,
  FleetIssue,
  FleetUnit,
} from "@/features/fleet/components/FleetControlTower";

type DB = Database;

type FleetVehicleRow = DB["public"]["Tables"]["fleet_vehicles"]["Row"];
type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type DispatchRow = DB["public"]["Tables"]["fleet_dispatch_assignments"]["Row"];

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

async function resolveShopId(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  explicitShopId: string | null,
) {
  if (explicitShopId) return explicitShopId;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.shop_id) {
    return null;
  }

  return profile.shop_id;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const body = (await req.json().catch(() => ({}))) as {
      shopId?: string | null;
    };

    const shopId = await resolveShopId(
      supabase,
      body.shopId ?? null,
    );

    if (!shopId) {
      return NextResponse.json(
        { error: "Unable to resolve shop for fleet tower." },
        { status: 400 },
      );
    }

    // Active fleet vehicles + their vehicle records
    const { data: fleetRows, error: fleetError } = await supabase
      .from("fleet_vehicles")
      .select(
        `
        vehicle_id,
        active,
        nickname,
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

    const fleetJoinedRows =
      (fleetRows ?? []) as unknown as FleetVehicleJoinedRow[];

    const vehicleIds = fleetJoinedRows.map((row) => row.vehicle_id);

    // Open / scheduled service requests for these vehicles
    const { data: serviceRequests, error: srError } = await supabase
      .from("fleet_service_requests")
      .select("id, vehicle_id, title, summary, severity, status, created_at")
      .eq("shop_id", shopId)
      .in("vehicle_id", vehicleIds);

    if (srError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/tower] service_requests error", srError);
      return NextResponse.json(
        { error: "Failed to load fleet service requests." },
        { status: 500 },
      );
    }

    const serviceRequestsTyped =
      (serviceRequests ?? []) as unknown as ServiceRequestSelect[];

    // Dispatch assignments
    const { data: dispatchRows, error: dispatchError } = await supabase
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

    const dispatchTyped =
      (dispatchRows ?? []) as unknown as DispatchSelect[];

    // Map of vehicle_id -> basic label info
    const vehicleMeta = new Map<
      string,
      {
        label: string;
        plate: string | null;
        vin: string | null;
      }
    >();

    for (const row of fleetJoinedRows) {
      const vehicle = row.vehicles;

      if (!vehicle) continue;

      const label =
        row.nickname ||
        vehicle.unit_number ||
        vehicle.license_plate ||
        vehicle.vin ||
        "Unit";

      vehicleMeta.set(row.vehicle_id, {
        label,
        plate: vehicle.license_plate,
        vin: vehicle.vin,
      });
    }

    // Build units with derived status
    const units: FleetUnit[] = fleetJoinedRows.map((row) => {
      const meta = vehicleMeta.get(row.vehicle_id);
      const relatedRequests = serviceRequestsTyped.filter(
        (sr) => sr.vehicle_id === row.vehicle_id,
      );

      let status: FleetUnit["status"] = "in_service";

      const hasSafety = relatedRequests.some(
        (sr) => sr.status !== "completed" && sr.severity === "safety",
      );
      const hasComplianceOrMaint = relatedRequests.some(
        (sr) =>
          sr.status !== "completed" &&
          (sr.severity === "compliance" ||
            sr.severity === "maintenance"),
      );

      if (hasSafety) status = "oos";
      else if (hasComplianceOrMaint) status = "limited";

      return {
        id: row.vehicle_id,
        label: meta?.label ?? "Unit",
        plate: meta?.plate ?? null,
        vin: meta?.vin ?? null,
        class: null,
        location: null,
        status,
        nextInspectionDate: null, // TODO: wire to CVIP / interval logic
      };
    });

    // Build issues from service requests
    const issues: FleetIssue[] = serviceRequestsTyped
      .filter((sr) => sr.status !== "cancelled")
      .map((sr) => {
        const meta = vehicleMeta.get(sr.vehicle_id);
        const severity: FleetIssue["severity"] =
          sr.severity === "safety" || sr.severity === "compliance"
            ? (sr.severity as FleetIssue["severity"])
            : "recommend"; // map maintenance/recommend -> recommend bucket

        let status: FleetIssue["status"] = "open";
        if (sr.status === "scheduled") status = "scheduled";
        if (sr.status === "completed") status = "completed";

        return {
          id: sr.id,
          unitId: sr.vehicle_id,
          unitLabel: meta?.label ?? "Unit",
          severity,
          summary: sr.summary ?? sr.title ?? "",
          createdAt: sr.created_at,
          status,
        };
      });

    // Build assignments
    const assignments: DispatchAssignment[] = dispatchTyped.map((row) => {
      const meta = vehicleMeta.get(row.vehicle_id);
      const state: DispatchAssignment["state"] =
        row.state === "completed"
          ? "in_shop"
          : (row.state as DispatchAssignment["state"]);

      return {
        id: row.id,
        driverName: row.driver_name ?? "Unassigned",
        driverId: row.driver_profile_id,
        unitLabel: row.unit_label ?? meta?.label ?? "Unit",
        unitId: row.vehicle_id,
        routeLabel: row.route_label,
        nextPreTripDue: row.next_pretrip_due,
        state,
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