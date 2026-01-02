// app/api/fleet/asset-detail/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WoRow = DB["public"]["Tables"]["work_orders"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type FleetVehicleRow = DB["public"]["Tables"]["fleet_vehicles"]["Row"];
type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type FleetUnitStatus = "in_service" | "limited" | "oos";

type FleetUnit = {
  id: string;
  label: string;
  plate?: string | null;
  vin?: string | null;
  class?: string | null;
  location?: string | null;
  status: FleetUnitStatus;
  nextInspectionDate?: string | null;
};

type FleetIssue = {
  id: string;
  unitId: string;
  unitLabel: string;
  severity: "safety" | "compliance" | "recommend";
  summary: string;
  createdAt: string;
  status: "open" | "scheduled" | "completed";
};

type UnitStats = {
  lifetimeWorkOrders: number;
  last12MonthsSpend: number; // shop currency
  daysSinceLastOos: number | null;
  openApprovals: number;
};

type RequestBody = {
  unitId: string;
  fleetId?: string | null; // optional for future fleet switching
};

type ResponseBody = {
  unit: FleetUnit | null;
  issues: FleetIssue[];
  stats: UnitStats;
  fleetId: string;
};

type Junction = Pick<FleetVehicleRow, "fleet_id" | "vehicle_id" | "nickname" | "active">;

type VehicleMeta = Pick<VehicleRow, "id" | "vin" | "unit_number" | "license_plate">;

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

// ---- helpers so we don't fight Supabase loose row typing ----
function getStringField(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function getNumberField(
  row: Record<string, unknown>,
  key: string,
): number | null {
  const value = row[key];
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function normalizeIssueStatus(st: string | null): FleetIssue["status"] {
  const s = (st ?? "").toLowerCase();
  if (s === "scheduled") return "scheduled";
  if (s === "completed") return "completed";
  return "open";
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const user = await requireUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body?.unitId) {
      return NextResponse.json({ error: "unitId is required." }, { status: 400 });
    }

    const unitId = body.unitId;

    // Resolve fleet for this account (membership = source of truth)
    const fleetId = await resolveFleetIdForUser(supabase, body.fleetId ?? null);
    if (!fleetId) {
      return NextResponse.json(
        { error: "No fleet access for this account." },
        { status: 403 },
      );
    }

    // Ensure this unit belongs to this fleet (and load nickname)
    const { data: junctionRaw, error: junctionErr } = await supabase
      .from("fleet_vehicles")
      .select("fleet_id, vehicle_id, nickname, active")
      .eq("fleet_id", fleetId)
      .eq("vehicle_id", unitId)
      .maybeSingle();

    if (junctionErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] fleet_vehicles error:", junctionErr);
      return NextResponse.json(
        { error: "Failed to load unit enrollment." },
        { status: 500 },
      );
    }

    const junction = (junctionRaw ?? null) as unknown as Junction | null;

    if (!junction) {
      return NextResponse.json(
        { error: "Unit not found in this fleet." },
        { status: 404 },
      );
    }

    // Fleet info (name)
    const { data: fleetRaw, error: fleetErr } = await supabase
      .from("fleets")
      .select("id, name")
      .eq("id", fleetId)
      .maybeSingle();

    if (fleetErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] fleets error:", fleetErr);
    }

    const fleetRow = (fleetRaw ?? null) as unknown as Pick<FleetRow, "id" | "name"> | null;

    // Vehicle identity (VIN / license_plate / unit_number)
    // IMPORTANT: your vehicles table uses `license_plate` (NOT `plate`)
    const { data: vehicleRaw, error: vehicleErr } = await supabase
      .from("vehicles")
      .select("id, vin, unit_number, license_plate")
      .eq("id", unitId)
      .maybeSingle();

    if (vehicleErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] vehicles error:", vehicleErr);
    }

    const vehicleData = (vehicleRaw ?? null) as unknown as VehicleMeta | null;

    // Service requests for this unit (fleet-scoped)
    const { data: srData, error: srErr } = await supabase
      .from("fleet_service_requests")
      .select("*")
      .eq("fleet_id", fleetId)
      .eq("vehicle_id", unitId);

    if (srErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] service requests error:", srErr);
      return NextResponse.json(
        { error: "Failed to load service requests." },
        { status: 500 },
      );
    }

    const serviceRequests = (srData as FleetServiceRequestRow[] | null) ?? [];

    const unitLabelBase =
      (junction.nickname as string | null) ??
      vehicleData?.unit_number ??
      vehicleData?.license_plate ??
      vehicleData?.vin ??
      "Unit";

    const issues: FleetIssue[] = serviceRequests.map((r) => ({
      id: r.id,
      unitId,
      unitLabel: unitLabelBase,
      severity: (r.severity as FleetIssue["severity"] | null) ?? "recommend",
      summary:
        (r.summary as string | null) ??
        (r.title as string | null) ??
        "No summary",
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
      status: normalizeIssueStatus(r.status as string | null),
    }));

    // Derive status
    const hasSafety = issues.some(
      (i) => i.severity === "safety" && i.status !== "completed",
    );
    const hasCompliance = issues.some(
      (i) => i.severity === "compliance" && i.status !== "completed",
    );

    let status: FleetUnitStatus = "in_service";
    if (hasSafety) status = "oos";
    else if (hasCompliance) status = "limited";

    const scheduledDates = serviceRequests
      .filter((r) => r.scheduled_for_date)
      .map((r) => r.scheduled_for_date as string);

    const nextInspectionDate =
      scheduledDates.length > 0 ? scheduledDates.sort()[0] : null;

    const plate = vehicleData?.license_plate ?? null;
    const vin = vehicleData?.vin ?? null;

    const label =
      (junction.nickname as string | null) ||
      vehicleData?.unit_number ||
      plate ||
      vin ||
      (fleetRow?.name ?? unitId);

    const unit: FleetUnit = {
      id: unitId,
      label,
      plate,
      vin,
      class: null,
      location: null,
      status,
      nextInspectionDate,
    };

    // ===== History & cost snapshot stats =====
    // NOTE: work_orders are still shop-scoped in your schema.
    // If fleet members can't read these via RLS, you'll want an RPC.
    const now = new Date();
    const { data: woData, error: woErr } = await supabase
      .from("work_orders")
      .select("*")
      .eq("vehicle_id", unitId);

    if (woErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] work_orders error:", woErr);
    }

    const workOrders = (woData as WoRow[] | null) ?? [];
    const lifetimeWorkOrders = workOrders.length;

    const oneYearAgoIso = new Date(
      now.getFullYear() - 1,
      now.getMonth(),
      now.getDate(),
    ).toISOString();

    let last12MonthsSpend = 0;

    for (const wo of workOrders) {
      const row = wo as unknown as Record<string, unknown>;

      const completedAt =
        getStringField(row, "completed_at") ??
        getStringField(row, "closed_at") ??
        getStringField(row, "updated_at") ??
        getStringField(row, "created_at");

      if (!completedAt || completedAt < oneYearAgoIso) continue;

      let amount =
        getNumberField(row, "grand_total") ??
        getNumberField(row, "total") ??
        getNumberField(row, "grand_total_cents") ??
        getNumberField(row, "total_cents");

      if (amount == null) {
        const labor = getNumberField(row, "labor_total") ?? 0;
        const parts = getNumberField(row, "parts_total") ?? 0;
        amount = labor + parts;
      }

      if (amount != null) last12MonthsSpend += amount;
    }

    const openApprovals = workOrders.filter((wo) => {
      const row = wo as unknown as Record<string, unknown>;

      const approval =
        getStringField(row, "approval_status") ??
        getStringField(row, "approval_state") ??
        "";

      const statusStr = (wo.status as string | null) ?? "";

      return (
        approval === "awaiting_approval" ||
        approval === "pending_approval" ||
        statusStr === "awaiting_approval" ||
        statusStr === "estimate_sent"
      );
    }).length;

    const lastOosIssue = issues
      .filter((i) => i.severity === "safety")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

    let daysSinceLastOos: number | null = null;
    if (lastOosIssue) {
      const last = new Date(lastOosIssue.createdAt);
      daysSinceLastOos = Math.max(
        0,
        Math.floor(
          (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
    }

    const stats: UnitStats = {
      lifetimeWorkOrders,
      last12MonthsSpend,
      daysSinceLastOos,
      openApprovals,
    };

    const payload: ResponseBody = {
      unit,
      issues,
      stats,
      fleetId,
    };

    return NextResponse.json(payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fleet/asset-detail] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load asset detail." },
      { status: 500 },
    );
  }
}