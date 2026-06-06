// app/api/fleet/service-requests/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

type DB = Database;

type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

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

type Body = {
  fleetId?: string | null; // optional for future fleet switching
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseRoute();

    const body = (await req.json().catch(() => ({}))) as Body;

    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: body.fleetId ?? null,
    });
    if (!actor.userId || !actor.capabilities.canSeeFleetWideUnits) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = resolveFleetActorScope(actor, {
      explicitFleetId: body.fleetId ?? null,
    });
    const fleetId = scope?.fleetId;
    if (!fleetId) {
      return NextResponse.json(
        { error: "No fleet access for this account." },
        { status: 403 },
      );
    }

    // RLS + membership policies enforce access
    const { data: requests, error: requestError } = await supabase
      .from("fleet_service_requests")
      .select(
        "id, vehicle_id, title, summary, severity, status, created_at, scheduled_for_date",
      )
      .eq("fleet_id", fleetId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (requestError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/service-requests] query error:", requestError);
      return NextResponse.json(
        { error: "Failed to load service requests." },
        { status: 500 },
      );
    }

    const typed = (requests ?? []) as Pick<
      FleetServiceRequestRow,
      | "id"
      | "vehicle_id"
      | "title"
      | "summary"
      | "severity"
      | "status"
      | "created_at"
      | "scheduled_for_date"
    >[];

    const vehicleIds = Array.from(new Set(typed.map((r) => r.vehicle_id)));

    // Optional enrichment (requires vehicles SELECT RLS for fleet members)
    const vehiclesMap = new Map<
      string,
      { unitLabel: string | null; plate: string | null }
    >();

    if (vehicleIds.length > 0) {
      const { data: vehicleRows, error: vehiclesError } = await supabase
        .from("vehicles")
        .select("id, unit_number, license_plate, vin")
        .in("id", vehicleIds);

      if (vehiclesError) {
        // eslint-disable-next-line no-console
        console.error("[fleet/service-requests] vehicles error:", vehiclesError);
      } else {
        const vrows = (vehicleRows ?? []) as Pick<
          VehicleRow,
          "id" | "unit_number" | "license_plate" | "vin"
        >[];

        for (const v of vrows) {
          const primaryLabel =
            (v.unit_number && v.unit_number.trim().length > 0
              ? v.unit_number
              : v.license_plate || v.vin) ?? null;

          vehiclesMap.set(v.id, {
            unitLabel: primaryLabel,
            plate: v.license_plate ?? null,
          });
        }
      }
    }

    const payload: PortalServiceRequest[] = typed.map((r) => {
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

    return NextResponse.json({ requests: payload, fleetId });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[fleet/service-requests] unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to load service requests." },
      { status: 500 },
    );
  }
}
