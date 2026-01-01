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

type FleetVehicleJoinedRow = FleetVehicleRow & {
  fleets: Pick<FleetRow, "id" | "shop_id" | "name"> | null;
  vehicles: Pick<
    VehicleRow,
    "id" | "unit_number" | "license_plate" | "vin" | "make" | "model" | "year"
  > | null;
};

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
        { error: "Unable to resolve shop for fleet units." },
        { status: 400 },
      );
    }

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

    const units: FleetUnitListItem[] = joinedRows.map((row) => {
      const fleet = row.fleets;
      const vehicle = row.vehicles;

      const label =
        row.nickname ||
        vehicle?.unit_number ||
        vehicle?.license_plate ||
        vehicle?.vin ||
        "Unit";

      return {
        id: row.vehicle_id,
        label,
        fleetName: fleet?.name ?? null,
        plate: vehicle?.license_plate ?? null,
        vin: vehicle?.vin ?? null,
        status: "in_service",
        nextInspectionDate: null,
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