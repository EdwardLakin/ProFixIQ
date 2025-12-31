// app/api/fleet/units/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];
type FleetVehicleRow =
  DB["public"]["Tables"]["fleet_vehicles"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

export type FleetUnitListItem = {
  id: string;
  label: string;
  fleetName?: string | null;
  plate?: string | null;
  vin?: string | null;
  class?: string | null;
  location?: string | null;
  status: "in_service" | "limited" | "oos";
  nextInspectionDate?: string | null;
};

type ResponseBody = {
  units: FleetUnitListItem[];
};

export async function POST(req: Request) {
  try {
    const supabaseUser = createRouteHandlerClient<DB>({ cookies });
    const supabaseAdmin = createAdminSupabase();

    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let bodyShopId: string | null = null;
    try {
      const body = (await req.json().catch(() => null)) as
        | { shopId?: string | null }
        | null;
      if (body?.shopId && typeof body.shopId === "string") {
        bodyShopId = body.shopId;
      }
    } catch {
      // ignore
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileErr) {
      console.error("[fleet/units] profile error:", profileErr);
      return NextResponse.json(
        { error: "Could not resolve shop for current user." },
        { status: 400 },
      );
    }

    const shopId = (bodyShopId ?? (profile?.shop_id as string | null)) ?? null;
    if (!shopId) {
      return NextResponse.json(
        { error: "No shop associated with current user." },
        { status: 400 },
      );
    }

    // Fleets for this shop
    const { data: fleets, error: fleetsErr } = await supabaseAdmin
      .from("fleets")
      .select("id, name, shop_id")
      .eq("shop_id", shopId);

    if (fleetsErr) {
      console.error("[fleet/units] fleets error:", fleetsErr);
      return NextResponse.json(
        { error: "Failed to load fleets." },
        { status: 500 },
      );
    }

    const fleetRows = (fleets as FleetRow[] | null) ?? [];
    const fleetIds = fleetRows.map((f) => f.id);

    if (fleetIds.length === 0) {
      const empty: ResponseBody = { units: [] };
      return NextResponse.json(empty);
    }

    // Junction rows fleet_vehicles
    const { data: fvData, error: fvErr } = await supabaseAdmin
      .from("fleet_vehicles")
      .select("*")
      .in("fleet_id", fleetIds);

    if (fvErr) {
      console.error("[fleet/units] fleet_vehicles error:", fvErr);
      return NextResponse.json(
        { error: "Failed to load fleet vehicles." },
        { status: 500 },
      );
    }

    const fvRows = (fvData as FleetVehicleRow[] | null) ?? [];
    const vehicleIds = Array.from(
      new Set(
        fvRows
          .map((fv) => fv.vehicle_id as string | null)
          .filter(Boolean) as string[],
      ),
    );

    // Vehicles (minimal columns we know we'll use)
    const { data: vehiclesData, error: vehiclesErr } = await supabaseAdmin
      .from("vehicles")
      .select("id, vin, plate")
      .in("id", vehicleIds);

    if (vehiclesErr) {
      console.error("[fleet/units] vehicles error:", vehiclesErr);
      // Don't hard fail – we can still show units with less detail
    }

    const vehiclesById = new Map<string, any>();
    (vehiclesData ?? []).forEach((v: any) => {
      vehiclesById.set(v.id, v);
    });

    // Service requests to determine status / next inspection date
    const { data: serviceData, error: serviceErr } = await supabaseAdmin
      .from("fleet_service_requests")
      .select("vehicle_id, severity, status, scheduled_for_date, title")
      .eq("shop_id", shopId);

    if (serviceErr) {
      console.error("[fleet/units] service requests error:", serviceErr);
    }

    const serviceRequests =
      (serviceData as FleetServiceRequestRow[] | null) ?? [];

    const units: FleetUnitListItem[] = fvRows.map((fv) => {
      const vid = fv.vehicle_id as string;
      const fid = fv.fleet_id as string;
      const fleet = fleetRows.find((f) => f.id === fid);
      const vehicle = vehiclesById.get(vid) as
        | { id: string; vin?: string | null; plate?: string | null }
        | undefined;

      const nickname = fv.nickname as string | null;
      const labelBase =
        nickname ||
        (vehicle?.plate as string | null) ||
        (vehicle?.vin as string | null) ||
        vid;

      const unitRequests = serviceRequests.filter(
        (r) => (r.vehicle_id as string | null) === vid,
      );
      const hasSafety = unitRequests.some(
        (r) => (r.severity as string | null) === "safety" &&
          (r.status as string | null) !== "completed",
      );
      const hasCompliance = unitRequests.some(
        (r) => (r.severity as string | null) === "compliance" &&
          (r.status as string | null) !== "completed",
      );

      let status: "in_service" | "limited" | "oos" = "in_service";
      if (hasSafety) status = "oos";
      else if (hasCompliance) status = "limited";

      const scheduledDates = unitRequests
        .filter((r) => r.scheduled_for_date)
        .map((r) => r.scheduled_for_date as string);

      const nextInspectionDate =
        scheduledDates.length > 0
          ? scheduledDates.sort()[0]
          : undefined;

      const item: FleetUnitListItem = {
        id: vid,
        label: labelBase,
        fleetName: fleet?.name ?? null,
        plate: (vehicle?.plate as string | null) ?? null,
        vin: (vehicle?.vin as string | null) ?? null,
        class: null,
        location: null,
        status,
        nextInspectionDate,
      };

      return item;
    });

    const body: ResponseBody = { units };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[fleet/units] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load fleet units." },
      { status: 500 },
    );
  }
}