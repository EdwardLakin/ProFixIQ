// app/api/fleet/units/route.ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type FleetUnitListItem = {
  id: string;
  label: string;
  fleetName?: string | null;
  plate?: string | null;
  vin?: string | null;
  status: "in_service" | "limited" | "oos";
  nextInspectionDate?: string | null;
  location?: string | null;
};

type FleetVehicleRow = DB["public"]["Tables"]["fleet_vehicles"]["Row"];
type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type FleetInspectionScheduleRow =
  DB["public"]["Tables"]["fleet_inspection_schedules"]["Row"];

type FleetVehicleJoinedRow = FleetVehicleRow & {
  fleets: Pick<FleetRow, "id" | "shop_id" | "name"> | null;
  vehicles: Pick<
    VehicleRow,
    "id" | "unit_number" | "license_plate" | "vin" | "make" | "model" | "year"
  > | null;
};

type ServiceRequestSelect = Pick<
  FleetServiceRequestRow,
  "id" | "vehicle_id" | "severity" | "status"
>;

type InspectionScheduleSelect = Pick<
  FleetInspectionScheduleRow,
  "vehicle_id" | "next_inspection_date"
>;

type UnitsBody = {
  shopId?: string | null;
};

// ───────────────── helpers ─────────────────

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

/**
 * Derive a unit's status from its open / scheduled fleet service requests.
 *
 * Rules:
 * - Any open/scheduled SAFETY or COMPLIANCE request → OOS
 * - Else any open/scheduled request (maintenance / recommend) → LIMITED
 * - Else → IN SERVICE
 */
function deriveUnitStatus(
  requests: ServiceRequestSelect[],
): FleetUnitListItem["status"] {
  if (!requests || requests.length === 0) return "in_service";

  const severe = requests.some((r) => {
    const sev = (r.severity ?? "").toLowerCase();
    const st = (r.status ?? "").toLowerCase();
    return (
      (st === "open" || st === "scheduled") &&
      (sev === "safety" || sev === "compliance")
    );
  });

  if (severe) return "oos";

  const anyLimited = requests.some((r) => {
    const st = (r.status ?? "").toLowerCase();
    return st === "open" || st === "scheduled";
  });

  if (anyLimited) return "limited";

  return "in_service";
}

// ───────────────── route ─────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const body = (await req.json().catch(() => ({}))) as UnitsBody;

    const shopId = await resolveShopId(supabase, body.shopId ?? null);

    if (!shopId) {
      return NextResponse.json(
        { error: "Unable to resolve shop for fleet units." },
        { status: 400 },
      );
    }

    // 1) Base fleet_vehicles + vehicles + fleets
    const { data: rows, error } = await supabase
      .from("fleet_vehicles")
      .select(
        `
        vehicle_id,
        active,
        nickname,
        custom_interval_days,
        fleets!inner (
          id,
          shop_id,
          name
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

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[fleet/units] fleet_vehicles error", error);
      return NextResponse.json(
        { error: "Failed to load fleet units." },
        { status: 500 },
      );
    }

    const joinedRows =
      (rows ?? []) as unknown as FleetVehicleJoinedRow[];

    const vehicleIds = joinedRows.map((row) => row.vehicle_id);

    // Short-circuit if no fleet units
    if (vehicleIds.length === 0) {
      return NextResponse.json({ units: [] as FleetUnitListItem[] });
    }

    // 2) Open/scheduled service requests for those units
    let serviceRequestsByVehicle = new Map<string, ServiceRequestSelect[]>();

    {
      const { data: serviceRequests, error: srError } = await supabase
        .from("fleet_service_requests")
        .select(
          `
          id,
          vehicle_id,
          severity,
          status
        `,
        )
        .eq("shop_id", shopId)
        .in("vehicle_id", vehicleIds)
        .neq("status", "cancelled");

      if (srError) {
        // eslint-disable-next-line no-console
        console.error("[fleet/units] service_requests error", srError);
        return NextResponse.json(
          { error: "Failed to load fleet units." },
          { status: 500 },
        );
      }

      const typedRequests =
        (serviceRequests ?? []) as unknown as ServiceRequestSelect[];

      serviceRequestsByVehicle = typedRequests.reduce(
        (map, sr) => {
          const arr = map.get(sr.vehicle_id) ?? [];
          arr.push(sr);
          map.set(sr.vehicle_id, arr);
          return map;
        },
        new Map<string, ServiceRequestSelect[]>(),
      );
    }

    // 3) Inspection schedules (CVIP) for those units
    let inspectionByVehicle = new Map<string, string | null>();

    {
      const { data: schedules, error: scheduleError } = await supabase
        .from("fleet_inspection_schedules")
        .select("vehicle_id, next_inspection_date")
        .eq("shop_id", shopId)
        .in("vehicle_id", vehicleIds);

      if (scheduleError) {
        // eslint-disable-next-line no-console
        console.error(
          "[fleet/units] inspection_schedules error",
          scheduleError,
        );
        return NextResponse.json(
          { error: "Failed to load fleet inspection schedules." },
          { status: 500 },
        );
      }

      const typedSchedules =
        (schedules ?? []) as unknown as InspectionScheduleSelect[];

      inspectionByVehicle = typedSchedules.reduce(
        (map, row) => {
          map.set(row.vehicle_id, row.next_inspection_date ?? null);
          return map;
        },
        new Map<string, string | null>(),
      );
    }

    // 4) Build unit list items
    const units: FleetUnitListItem[] = joinedRows.map((row) => {
      const fleet = row.fleets;
      const vehicle = row.vehicles;

      const label =
        row.nickname ||
        vehicle?.unit_number ||
        vehicle?.license_plate ||
        vehicle?.vin ||
        "Unit";

      const requestsForUnit =
        serviceRequestsByVehicle.get(row.vehicle_id) ?? [];

      const status = deriveUnitStatus(requestsForUnit);

      const nextInspectionDate =
        inspectionByVehicle.get(row.vehicle_id) ?? null;

      return {
        id: row.vehicle_id,
        label,
        fleetName: fleet?.name ?? null,
        plate: vehicle?.license_plate ?? null,
        vin: vehicle?.vin ?? null,
        status,
        nextInspectionDate,
        location: null, // TODO: region / yard once stored
      };
    });

    return NextResponse.json({ units });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fleet/units] error", err);
    return NextResponse.json(
      { error: "Failed to load fleet units." },
      { status: 500 },
    );
  }
}