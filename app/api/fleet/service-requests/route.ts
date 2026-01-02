// app/api/fleet/service-requests/route.ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type FleetMemberRow = DB["public"]["Tables"]["fleet_members"]["Row"];

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

async function requireUser(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

async function resolveFleetIdForUser(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  explicitFleetId?: string | null,
): Promise<string | null> {
  const user = await requireUser(supabase);
  if (!user) return null;

  if (explicitFleetId) {
    const { data, error } = await supabase
      .from("fleet_members")
      .select("fleet_id")
      .eq("fleet_id", explicitFleetId)
      .eq("user_id", user.id)
      .maybeSingle<Pick<FleetMemberRow, "fleet_id">>();

    if (error || !data?.fleet_id) return null;
    return data.fleet_id;
  }

  const { data, error } = await supabase
    .from("fleet_members")
    .select("fleet_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<Pick<FleetMemberRow, "fleet_id">>();

  if (error || !data?.fleet_id) return null;
  return data.fleet_id;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const body = (await req.json().catch(() => ({}))) as Body;

    const user = await requireUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fleetId = await resolveFleetIdForUser(supabase, body.fleetId ?? null);
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