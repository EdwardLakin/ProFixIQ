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

type UnitsBody = {
  shopId?: string | null;
};

type FleetVehicleRow = DB["public"]["Tables"]["fleet_vehicles"]["Row"];
type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type FleetInspectionScheduleRow =
  DB["public"]["Tables"]["fleet_inspection_schedules"]["Row"];

type ServiceRequestSelect = Pick<
  FleetServiceRequestRow,
  "vehicle_id" | "severity" | "status"
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

/**
 * Status rules:
 * - Any open/scheduled SAFETY or COMPLIANCE request → OOS
 * - Else any open/scheduled request → LIMITED
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

    // 1) Find fleets for this shop (authoritative scoping)
    const { data: fleets, error: fleetsError } = await supabase
      .from("fleets")
      .select("id, shop_id, name")
      .eq("shop_id", shopId);

    if (fleetsError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/units] fleets error", fleetsError);
      return NextResponse.json(
        { error: "Failed to load fleets." },
        { status: 500 },
      );
    }

    const fleetRows = (fleets ?? []) as Pick<FleetRow, "id" | "shop_id" | "name">[];
    const fleetIds = fleetRows.map((f) => f.id);

    if (fleetIds.length === 0) {
      return NextResponse.json({ units: [] as FleetUnitListItem[] });
    }

    const fleetsById = new Map<string, { name: string | null }>();
    for (const f of fleetRows) {
      fleetsById.set(f.id, { name: f.name ?? null });
    }

    // 2) Get fleet_vehicles for those fleets.
    // IMPORTANT: treat active NULL as active (common in seeds) + active true.
    const { data: fleetVehiclesRaw, error: fvError } = await supabase
      .from("fleet_vehicles")
      .select("fleet_id, vehicle_id, active, nickname, custom_interval_days")
      .in("fleet_id", fleetIds)
      .or("active.is.null,active.eq.true");

    if (fvError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/units] fleet_vehicles error", fvError);
      return NextResponse.json(
        { error: "Failed to load fleet vehicles." },
        { status: 500 },
      );
    }

    const fleetVehicles = (fleetVehiclesRaw ?? []) as Pick<
      FleetVehicleRow,
      "fleet_id" | "vehicle_id" | "active" | "nickname" | "custom_interval_days"
    >[];

    if (fleetVehicles.length === 0) {
      return NextResponse.json({ units: [] as FleetUnitListItem[] });
    }

    const vehicleIds = Array.from(
      new Set(fleetVehicles.map((r) => r.vehicle_id).filter(Boolean)),
    );

    // 3) Load vehicles
    const { data: vehiclesRaw, error: vError } = await supabase
      .from("vehicles")
      .select("id, unit_number, license_plate, vin, make, model, year")
      .in("id", vehicleIds);

    if (vError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/units] vehicles error", vError);
      return NextResponse.json(
        { error: "Failed to load vehicles." },
        { status: 500 },
      );
    }

    const vehicles = (vehiclesRaw ?? []) as Pick<
      VehicleRow,
      "id" | "unit_number" | "license_plate" | "vin" | "make" | "model" | "year"
    >[];

    const vehiclesById = new Map<string, typeof vehicles[number]>();
    for (const v of vehicles) vehiclesById.set(v.id, v);

    // 4) Load service requests (for status)
    const { data: srsRaw, error: srError } = await supabase
      .from("fleet_service_requests")
      .select("vehicle_id, severity, status")
      .eq("shop_id", shopId)
      .in("vehicle_id", vehicleIds)
      .neq("status", "cancelled");

    if (srError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/units] service_requests error", srError);
      return NextResponse.json(
        { error: "Failed to load service requests." },
        { status: 500 },
      );
    }

    const srs = (srsRaw ?? []) as ServiceRequestSelect[];
    const srsByVehicle = new Map<string, ServiceRequestSelect[]>();
    for (const sr of srs) {
      const arr = srsByVehicle.get(sr.vehicle_id) ?? [];
      arr.push(sr);
      srsByVehicle.set(sr.vehicle_id, arr);
    }

    // 5) Load inspection schedules (CVIP)
    const { data: schedRaw, error: schedError } = await supabase
      .from("fleet_inspection_schedules")
      .select("vehicle_id, next_inspection_date")
      .eq("shop_id", shopId)
      .in("vehicle_id", vehicleIds);

    if (schedError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/units] inspection_schedules error", schedError);
      return NextResponse.json(
        { error: "Failed to load inspection schedules." },
        { status: 500 },
      );
    }

    const scheds = (schedRaw ?? []) as InspectionScheduleSelect[];
    const nextByVehicle = new Map<string, string | null>();
    for (const row of scheds) {
      nextByVehicle.set(row.vehicle_id, row.next_inspection_date ?? null);
    }

    // 6) Build units
    const units: FleetUnitListItem[] = fleetVehicles.map((fv) => {
      const vehicle = vehiclesById.get(fv.vehicle_id);
      const fleetName = fleetsById.get(fv.fleet_id)?.name ?? null;

      const label =
        fv.nickname ||
        vehicle?.unit_number ||
        vehicle?.license_plate ||
        vehicle?.vin ||
        "Unit";

      const status = deriveUnitStatus(srsByVehicle.get(fv.vehicle_id) ?? []);

      return {
        id: fv.vehicle_id,
        label,
        fleetName,
        plate: vehicle?.license_plate ?? null,
        vin: vehicle?.vin ?? null,
        status,
        nextInspectionDate: nextByVehicle.get(fv.vehicle_id) ?? null,
        location: null,
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