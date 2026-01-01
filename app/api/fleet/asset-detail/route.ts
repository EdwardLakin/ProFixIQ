// app/api/fleet/asset-detail/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WoRow = DB["public"]["Tables"]["work_orders"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type FleetVehicleRow = DB["public"]["Tables"]["fleet_vehicles"]["Row"];
type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];

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
};

type ResponseBody = {
  unit: FleetUnit | null;
  issues: FleetIssue[];
  stats: UnitStats;
};

// ---- small helpers so we don't fight Supabase types ----
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

  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

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

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body?.unitId) {
      return NextResponse.json(
        { error: "unitId is required." },
        { status: 400 },
      );
    }

    const unitId = body.unitId;

    // Resolve shop for current user
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileErr || !profile?.shop_id) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] profile error:", profileErr);
      return NextResponse.json(
        { error: "Must belong to a shop to view fleet assets." },
        { status: 400 },
      );
    }

    const shopId = profile.shop_id as string;

    // Look up any fleets + fleet_vehicles junction rows for this unit
    const [
      { data: fleetsData, error: fleetsErr },
      { data: fvData, error: fvErr },
    ] = await Promise.all([
      supabaseAdmin
        .from("fleets")
        .select("id, name, shop_id")
        .eq("shop_id", shopId),
      supabaseAdmin
        .from("fleet_vehicles")
        .select("*")
        .eq("vehicle_id", unitId),
    ]);

    if (fleetsErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] fleets error:", fleetsErr);
    }
    if (fvErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] fleet_vehicles error:", fvErr);
    }

    const fleets = (fleetsData as FleetRow[] | null) ?? [];
    const fvRows = (fvData as FleetVehicleRow[] | null) ?? [];

    const junction = fvRows[0] ?? null;
    const fleetForUnit =
      (junction && fleets.find((f) => f.id === junction.fleet_id)) ?? null;

    // Vehicle record (VIN / plate)
    const { data: vehicleData, error: vehicleErr } = await supabaseAdmin
      .from("vehicles")
      .select("id, vin, plate")
      .eq("id", unitId)
      .maybeSingle<{ id: string; vin: string | null; plate: string | null }>();

    if (vehicleErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] vehicles error:", vehicleErr);
    }

    // Service requests for this unit to build issues + status
    const { data: srData, error: srErr } = await supabaseAdmin
      .from("fleet_service_requests")
      .select("*")
      .eq("shop_id", shopId)
      .eq("vehicle_id", unitId);

    if (srErr) {
      // eslint-disable-next-line no-console
      console.error("[fleet/asset-detail] service requests error:", srErr);
    }

    const serviceRequests =
      (srData as FleetServiceRequestRow[] | null) ?? [];

    // Build issues list
    const issues: FleetIssue[] = serviceRequests.map((r) => ({
      id: r.id,
      unitId,
      unitLabel:
        (junction?.nickname as string | null) ??
        (r.title as string | null) ??
        "Unit",
      severity:
        (r.severity as FleetIssue["severity"] | null) ?? "recommend",
      summary:
        (r.summary as string | null) ??
        (r.title as string | null) ??
        "No summary",
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
      status: (r.status as FleetIssue["status"] | null) ?? "open",
    }));

    // Derive live status
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

    // Resolve label & basic identity
    const plate = (vehicleData?.plate as string | null) ?? null;
    const vin = (vehicleData?.vin as string | null) ?? null;
    const nickname = (junction?.nickname as string | null) ?? null;

    const label =
      nickname ||
      plate ||
      vin ||
      ((fleetForUnit?.name as string | null) ?? unitId);

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
    const now = new Date();

    const { data: woData, error: woErr } = await supabaseAdmin
      .from("work_orders")
      .select("*")
      .eq("shop_id", shopId)
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

      if (amount != null) {
        last12MonthsSpend += amount;
      }
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