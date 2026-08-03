import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  canManageFleetForActor,
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

export const dynamic = "force-dynamic";

type Body = {
  action?: "context" | "search_vehicles" | "enroll_existing" | "create_and_enroll" | "assign";
  fleetId?: string | null;
  vehicleId?: string | null;
  driverProfileId?: string | null;
  unitNumber?: string | null;
  vin?: string | null;
  licensePlate?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  nickname?: string | null;
  routeLabel?: string | null;
  pretripDueLocalTime?: string | null;
  query?: string | null;
};

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: body.fleetId ?? null,
    });
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = resolveFleetActorScope(actor, {
      explicitFleetId: body.fleetId ?? null,
    });
    if (!scope?.shopId || !actor.isInternal) {
      return NextResponse.json(
        { error: "Internal fleet management access required" },
        { status: 403 },
      );
    }

    const action = body.action ?? "context";
    const admin = createAdminSupabase();

    if (action === "search_vehicles") {
      const needle = (clean(body.query) ?? "").replace(/[,%()]/g, "").slice(0, 80);
      let vehicleQuery = admin
        .from("vehicles")
        .select("id,unit_number,vin,license_plate,year,make,model")
        .eq("shop_id", scope.shopId)
        .order("unit_number", { ascending: true })
        .limit(50);
      if (needle) {
        vehicleQuery = vehicleQuery.or(
          `unit_number.ilike.%${needle}%,vin.ilike.%${needle}%,license_plate.ilike.%${needle}%,make.ilike.%${needle}%,model.ilike.%${needle}%`,
        );
      }
      const { data, error } = await vehicleQuery;
      if (error) throw new Error(error.message);
      return NextResponse.json({
        vehicles: rows(data).map((row) => ({
          id: String(row.id),
          unitNumber: clean(row.unit_number),
          vin: clean(row.vin),
          licensePlate: clean(row.license_plate),
          description: [row.year, clean(row.make), clean(row.model)].filter(Boolean).join(" "),
        })),
      });
    }

    if (action === "context") {
      const [fleetResult, vehicleResult] = await Promise.all([
        admin
          .from("fleets")
          .select("id,name")
          .eq("shop_id", scope.shopId)
          .order("name", { ascending: true }),
        admin
          .from("vehicles")
          .select("id,unit_number,vin,license_plate,year,make,model")
          .eq("shop_id", scope.shopId)
          .order("unit_number", { ascending: true })
          .limit(100),
      ]);
      if (fleetResult.error) throw new Error(fleetResult.error.message);
      if (vehicleResult.error) throw new Error(vehicleResult.error.message);

      const fleetRows = rows(fleetResult.data);
      const fleetIds = fleetRows.map((row) => String(row.id));
      const [memberResult, enrollmentResult, assignmentResult] = fleetIds.length
        ? await Promise.all([
            admin
              .from("fleet_members")
              .select("fleet_id,user_id,role")
              .in("fleet_id", fleetIds)
              .in("role", ["driver", "viewer"]),
            admin
              .from("fleet_vehicles")
              .select("fleet_id,vehicle_id,nickname,active")
              .in("fleet_id", fleetIds),
            admin
              .from("fleet_dispatch_assignments")
              .select("id,fleet_id,vehicle_id,driver_profile_id,driver_name,route_label,next_pretrip_due,state")
              .in("fleet_id", fleetIds)
              .neq("state", "completed"),
          ])
        : [
            { data: [] as unknown[], error: null },
            { data: [] as unknown[], error: null },
            { data: [] as unknown[], error: null },
          ];
      const firstError = [memberResult.error, enrollmentResult.error, assignmentResult.error].find(Boolean);
      if (firstError) throw new Error(firstError.message);

      const memberRows = rows(memberResult.data);
      const memberIds = Array.from(new Set(memberRows.map((row) => String(row.user_id))));
      const { data: profileData, error: profileError } = memberIds.length
        ? await admin.from("profiles").select("id,full_name,email").in("id", memberIds)
        : { data: [] as unknown[], error: null };
      if (profileError) throw new Error(profileError.message);
      const profiles = new Map(rows(profileData).map((row) => [String(row.id), row]));

      return NextResponse.json({
        fleets: fleetRows.map((row) => ({ id: String(row.id), name: clean(row.name) ?? "Fleet" })),
        vehicles: rows(vehicleResult.data).map((row) => ({
          id: String(row.id),
          unitNumber: clean(row.unit_number),
          vin: clean(row.vin),
          licensePlate: clean(row.license_plate),
          description: [row.year, clean(row.make), clean(row.model)].filter(Boolean).join(" "),
        })),
        drivers: memberRows.map((row) => {
          const profile = profiles.get(String(row.user_id)) ?? {};
          return {
            fleetId: String(row.fleet_id),
            id: String(row.user_id),
            name: clean(profile.full_name) ?? clean(profile.email) ?? "Driver",
          };
        }),
        enrollments: rows(enrollmentResult.data).map((row) => ({
          fleetId: String(row.fleet_id),
          vehicleId: String(row.vehicle_id),
          nickname: clean(row.nickname),
          active: row.active !== false,
        })),
        assignments: rows(assignmentResult.data).map((row) => ({
          id: String(row.id),
          fleetId: String(row.fleet_id),
          vehicleId: String(row.vehicle_id),
          driverProfileId: String(row.driver_profile_id),
          driverName: clean(row.driver_name) ?? "Driver",
          routeLabel: clean(row.route_label),
          nextPretripDue: clean(row.next_pretrip_due),
          state: clean(row.state) ?? "pretrip_due",
        })),
      });
    }

    const fleetId = clean(body.fleetId);
    if (!fleetId || !UUID.test(fleetId) || !canManageFleetForActor(actor, fleetId)) {
      return NextResponse.json({ error: "Valid fleet management scope required" }, { status: 403 });
    }
    const dueTime = clean(body.pretripDueLocalTime) ?? "07:00";
    if (!TIME.test(dueTime)) {
      return NextResponse.json({ error: "Pre-trip due time must be HH:MM" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("manage_fleet_unit_enrollment", {
      p_action: action,
      p_fleet_id: fleetId,
      p_vehicle_id: clean(body.vehicleId) ?? undefined,
      p_driver_profile_id: clean(body.driverProfileId) ?? undefined,
      p_unit_number: clean(body.unitNumber) ?? undefined,
      p_vin: clean(body.vin) ?? undefined,
      p_license_plate: clean(body.licensePlate) ?? undefined,
      p_year: body.year ?? undefined,
      p_make: clean(body.make) ?? undefined,
      p_model: clean(body.model) ?? undefined,
      p_nickname: clean(body.nickname) ?? undefined,
      p_route_label: clean(body.routeLabel) ?? undefined,
      p_pretrip_due_local_time: dueTime,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[fleet/enrollment] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to manage fleet units" },
      { status: 500 },
    );
  }
}
