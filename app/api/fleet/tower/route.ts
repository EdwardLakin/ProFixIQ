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
type DispatchRow = DB["public"]["Tables"]["fleet_dispatch_assignments"]["Row"];
type FleetInspectionScheduleRow =
  DB["public"]["Tables"]["fleet_inspection_schedules"]["Row"];

/**
 * NOTE (post-RLS pivot):
 * - fleet_dispatch_assignments / fleet_service_requests / fleet_pretrip_reports / fleet_inspection_schedules
 *   are now fleet-scoped via fleet_id (NOT NULL) and membership-based RLS.
 * - These routes should therefore stop relying on shop_id filtering as the primary authorization path.
 */

type FleetVehicleJoinedRow = FleetVehicleRow & {
  // keep this type for backwards compatibility with older joins if you re-add them,
  // but we no longer rely on fleets.shop_id for auth/scoping
  fleets?: Pick<FleetRow, "id" | "shop_id" | "name"> | null;
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
  | "fleet_id"
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

// ─────────────────────────────────────────────────────────────────────────────
// Auth + fleet scoping helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Resolve a fleet_id that the current user is a member of.
 * - If explicitFleetId is provided, we verify membership.
 * - Otherwise we pick the earliest membership as a stable default.
 *
 * If you later add a fleet switcher in the UI, pass fleetId in body.
 */
async function resolveFleetIdForUser(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  explicitFleetId: string | null,
): Promise<string | null> {
  const user = await requireUser(supabase);
  if (!user) return null;

  if (explicitFleetId) {
    const { data, error } = await supabase
      .from("fleet_members")
      .select("fleet_id")
      .eq("fleet_id", explicitFleetId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data?.fleet_id) return null;
    return data.fleet_id;
  }

  const { data, error } = await supabase
    .from("fleet_members")
    .select("fleet_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.fleet_id) return null;
  return data.fleet_id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeSeverity(sev: string | null): FleetIssue["severity"] | null {
  const s = (sev ?? "").toLowerCase();
  if (s === "safety") return "safety";
  if (s === "compliance") return "compliance";
  if (!s) return null;
  return "recommend";
}

function normalizeIssueStatus(st: string | null): FleetIssue["status"] {
  const s = (st ?? "").toLowerCase();
  if (s === "scheduled") return "scheduled";
  if (s === "completed") return "completed";
  return "open";
}

function normalizeDispatchState(st: string | null): DispatchAssignment["state"] {
  const s = (st ?? "").toLowerCase();
  if (s === "en_route") return "en_route";
  if (s === "in_shop") return "in_shop";
  // NOTE: some older rows may store "pretrip_due" or something else
  return "pretrip_due";
}

// ─────────────────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const user = await requireUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      // New: fleet scoped (membership-based)
      fleetId?: string | null;

      // Legacy: callers might still send shopId. We ignore it for auth/scoping now.
      shopId?: string | null;
    };

    const fleetId = await resolveFleetIdForUser(supabase, body.fleetId ?? null);

    if (!fleetId) {
      return NextResponse.json(
        { error: "No fleet access for this account." },
        { status: 403 },
      );
    }

    // ────────────────────────────────────────────────────────────────────────
    // 0) Fleet meta (name) – optional, but nice for UI
    // ────────────────────────────────────────────────────────────────────────
    const { data: fleetMeta, error: fleetMetaErr } = await supabase
      .from("fleets")
      .select("id, name")
      .eq("id", fleetId)
      .maybeSingle();

    if (fleetMetaErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/tower] fleets meta error", fleetMetaErr);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 1) Fleet vehicles (enrolled units) for this fleet
    // ────────────────────────────────────────────────────────────────────────
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
      .eq("fleet_id", fleetId)
      // IMPORTANT: treat active NULL as active (common in seeds) + active true
      .or("active.is.null,active.eq.true");

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

    // Build meta from enrolled vehicles (best labels)
    const vehicleMeta = new Map<
      string,
      { label: string; plate: string | null; vin: string | null }
    >();

    for (const row of fleetRows) {
      const v = row.vehicles;

      const label =
        row.nickname ||
        v?.unit_number ||
        v?.license_plate ||
        v?.vin ||
        "Unit";

      vehicleMeta.set(row.vehicle_id, {
        label,
        plate: v?.license_plate ?? null,
        vin: v?.vin ?? null,
      });
    }

    // Seed initial vehicle id set from enrolled fleet rows,
    // BUT DO NOT early return (tower is an activity dashboard).
    const vehicleIdSet = new Set<string>();
    for (const r of fleetRows) vehicleIdSet.add(r.vehicle_id);

    // ────────────────────────────────────────────────────────────────────────
    // 2) Dispatch assignments (pre-trip & who’s where)
    // ────────────────────────────────────────────────────────────────────────
    const { data: dispatchRaw, error: dispatchError } = await supabase
      .from("fleet_dispatch_assignments")
      .select(
        "id, fleet_id, shop_id, vehicle_id, driver_profile_id, driver_name, route_label, next_pretrip_due, state, unit_label, vehicle_identifier",
      )
      .eq("fleet_id", fleetId);

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

    for (const d of dispatchRows) {
      if (d.vehicle_id) vehicleIdSet.add(d.vehicle_id);
      // backfill meta if dispatch has a unit_label
      if (d.vehicle_id && !vehicleMeta.has(d.vehicle_id)) {
        const label = d.unit_label || d.vehicle_identifier || "Unit";
        vehicleMeta.set(d.vehicle_id, { label, plate: null, vin: null });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3) Service requests (issues) – fleet scoped
    // ────────────────────────────────────────────────────────────────────────
    const { data: serviceRequests, error: srError } = await supabase
      .from("fleet_service_requests")
      .select("id, vehicle_id, title, summary, severity, status, created_at")
      .eq("fleet_id", fleetId)
      .neq("status", "cancelled");

    if (srError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/tower] service_requests error", srError);
      return NextResponse.json(
        { error: "Failed to load fleet service requests." },
        { status: 500 },
      );
    }

    const serviceRequestsTyped: ServiceRequestSelect[] =
      (serviceRequests ?? []) as unknown as ServiceRequestSelect[];

    for (const sr of serviceRequestsTyped) {
      if (sr.vehicle_id) vehicleIdSet.add(sr.vehicle_id);
      if (sr.vehicle_id && !vehicleMeta.has(sr.vehicle_id)) {
        vehicleMeta.set(sr.vehicle_id, {
          label: "Unit",
          plate: null,
          vin: null,
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 4) Inspection schedules (CVIP) – fleet scoped
    // ────────────────────────────────────────────────────────────────────────
    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("fleet_inspection_schedules")
      .select("vehicle_id, next_inspection_date")
      .eq("fleet_id", fleetId);

    if (scheduleError) {
      // eslint-disable-next-line no-console
      console.error("[fleet/tower] inspection_schedules error", scheduleError);
      return NextResponse.json(
        { error: "Failed to load inspection schedules." },
        { status: 500 },
      );
    }

    const scheduleRowsTyped: InspectionScheduleSelect[] =
      (scheduleRows ?? []) as unknown as InspectionScheduleSelect[];

    const inspectionByVehicle = new Map<string, string | null>();
    for (const row of scheduleRowsTyped) {
      if (!row.vehicle_id) continue;
      vehicleIdSet.add(row.vehicle_id);
      inspectionByVehicle.set(row.vehicle_id, row.next_inspection_date ?? null);
      if (!vehicleMeta.has(row.vehicle_id)) {
        vehicleMeta.set(row.vehicle_id, {
          label: "Unit",
          plate: null,
          vin: null,
        });
      }
    }

    const vehicleIds = Array.from(vehicleIdSet);

    // ────────────────────────────────────────────────────────────────────────
    // 5) Group service requests by vehicle for quick lookups
    // ────────────────────────────────────────────────────────────────────────
    const requestsByVehicle = new Map<string, ServiceRequestSelect[]>();
    for (const sr of serviceRequestsTyped) {
      const vid = sr.vehicle_id;
      if (!vid) continue;
      const arr = requestsByVehicle.get(vid) ?? [];
      arr.push(sr);
      requestsByVehicle.set(vid, arr);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 6) Build units payload from the master vehicle id set
    // ────────────────────────────────────────────────────────────────────────
    const units: FleetUnit[] = vehicleIds.map((vehicleId) => {
      const meta = vehicleMeta.get(vehicleId) ?? {
        label: "Unit",
        plate: null,
        vin: null,
      };

      const relatedRequests = requestsByVehicle.get(vehicleId) ?? [];

      let status: FleetUnit["status"] = "in_service";

      const hasSafety = relatedRequests.some((sr) => {
        const st = (sr.status ?? "").toLowerCase();
        const sev = (sr.severity ?? "").toLowerCase();
        return st !== "completed" && sev === "safety";
      });

      const hasComplianceOrMaint = relatedRequests.some((sr) => {
        const st = (sr.status ?? "").toLowerCase();
        const sev = (sr.severity ?? "").toLowerCase();
        return (
          st !== "completed" &&
          (sev === "compliance" || sev === "maintenance" || sev === "recommend")
        );
      });

      if (hasSafety) status = "oos";
      else if (hasComplianceOrMaint) status = "limited";

      const nextInspectionDate = inspectionByVehicle.get(vehicleId) ?? null;

      return {
        id: vehicleId,
        label: meta.label,
        plate: meta.plate,
        vin: meta.vin,
        class: null,
        location: null,
        status,
        nextInspectionDate,
      };
    });

    // ────────────────────────────────────────────────────────────────────────
    // 7) Build issues payload
    // ────────────────────────────────────────────────────────────────────────
    const issues: FleetIssue[] = serviceRequestsTyped.map((sr) => {
      const meta = vehicleMeta.get(sr.vehicle_id) ?? {
        label: "Unit",
        plate: null,
        vin: null,
      };

      const severity = normalizeSeverity(sr.severity) ?? ("recommend" as const);
      const status = normalizeIssueStatus(sr.status);

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

    // ────────────────────────────────────────────────────────────────────────
    // 8) Build assignments payload
    // ────────────────────────────────────────────────────────────────────────
    const assignments: DispatchAssignment[] = dispatchRows
      .filter((r) => !!r.vehicle_id)
      .map((row) => {
        const meta = vehicleMeta.get(row.vehicle_id) ?? {
          label: "Unit",
          plate: null,
          vin: null,
        };

        // Normalize DB state -> UI state union
        let uiState: DispatchAssignment["state"];
        const raw = (row.state ?? "").toLowerCase();

        // Older: some code mapped "completed" => "in_shop"
        if (raw === "completed") {
          uiState = "in_shop";
        } else {
          uiState = normalizeDispatchState(raw);
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
      // helpful for the client if you add fleet switching later
      fleet: {
        id: fleetId,
        name: (fleetMeta as Pick<FleetRow, "name"> | null)?.name ?? null,
      },
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