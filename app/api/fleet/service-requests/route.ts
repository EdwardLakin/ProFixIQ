import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

const supabaseAdmin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

export type PortalServiceRequest = {
  id: string;
  vehicleId: string;
  unitLabel: string | null;
  plate: string | null;
  title: string;
  summary: string;
  severity: FleetServiceRequestRow["severity"];
  status: FleetServiceRequestRow["status"];
  createdAt: string;
  scheduledForDate: string | null;
};

export async function POST(req: Request) {
  try {
    // shopId is accepted for future scoping, but currently unused because
    // fleet_service_requests already link to vehicles and shops.
    const body = await req.json().catch(() => ({ shopId: null }));
    const _shopId = (body as { shopId?: string | null }).shopId ?? null;

    const { data: baseRequests, error: requestError } =
      await supabaseAdmin
        .from("fleet_service_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

    if (requestError) {
      // eslint-disable-next-line no-console
      console.error(
        "[fleet/service-requests] base query error:",
        requestError,
      );
      return NextResponse.json(
        { error: "Failed to load service requests." },
        { status: 500 },
      );
    }

    const requests: FleetServiceRequestRow[] = baseRequests ?? [];
    const vehicleIds = Array.from(
      new Set(requests.map((r) => r.vehicle_id)),
    );

    const vehiclesMap = new Map<
      string,
      { unitLabel: string | null; plate: string | null }
    >();

    if (vehicleIds.length > 0) {
      const { data: vehicleRows, error: vehiclesError } =
        await supabaseAdmin
          .from("vehicles")
          .select("id, unit_number, license_plate")
          .in("id", vehicleIds);

      if (vehiclesError) {
        // eslint-disable-next-line no-console
        console.error(
          "[fleet/service-requests] vehicles query error:",
          vehiclesError,
        );
      }

      const vehiclesTyped:
        | Pick<VehicleRow, "id" | "unit_number" | "license_plate">[]
        = vehicleRows ?? [];

      for (const v of vehiclesTyped) {
        const primaryLabel =
          (v.unit_number && v.unit_number.trim().length > 0
            ? v.unit_number
            : v.license_plate) ?? null;

        vehiclesMap.set(v.id, {
          unitLabel: primaryLabel,
          plate: v.license_plate ?? null,
        });
      }
    }

    const payload: PortalServiceRequest[] = requests.map((r) => {
      const vehicle = vehiclesMap.get(r.vehicle_id) ?? {
        unitLabel: null,
        plate: null,
      };

      return {
        id: r.id,
        vehicleId: r.vehicle_id,
        unitLabel: vehicle.unitLabel,
        plate: vehicle.plate,
        title: r.title,
        summary: r.summary,
        severity: r.severity,
        status: r.status,
        createdAt: r.created_at,
        scheduledForDate: r.scheduled_for_date,
      };
    });

    return NextResponse.json({ requests: payload });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[fleet/service-requests] unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to load service requests." },
      { status: 500 },
    );
  }
}
