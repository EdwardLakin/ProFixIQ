// app/api/fleet/asset-detail/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

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

type RequestBody = {
  unitId: string;
};

type ResponseBody = {
  unit: FleetUnit | null;
  issues: FleetIssue[];
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

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body?.unitId) {
      return NextResponse.json(
        { error: "unitId is required." },
        { status: 400 },
      );
    }

    const unitId = body.unitId;

    // Resolve shop
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileErr || !profile?.shop_id) {
      console.error("[fleet/asset-detail] profile error:", profileErr);
      return NextResponse.json(
        { error: "Must belong to a shop to view fleet assets." },
        { status: 400 },
      );
    }

    const shopId = profile.shop_id as string;

    // Find fleets and junction row for this unit (to get nickname / label)
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
      console.error("[fleet/asset-detail] fleets error:", fleetsErr);
    }
    if (fvErr) {
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
      .maybeSingle<any>();

    if (vehicleErr) {
      console.error("[fleet/asset-detail] vehicles error:", vehicleErr);
    }

    // Service requests for this unit to build issues + status
    const { data: srData, error: srErr } = await supabaseAdmin
      .from("fleet_service_requests")
      .select("*")
      .eq("shop_id", shopId)
      .eq("vehicle_id", unitId);

    if (srErr) {
      console.error("[fleet/asset-detail] service requests error:", srErr);
    }

    const serviceRequests =
      (srData as FleetServiceRequestRow[] | null) ?? [];

    // Build issues
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

    const payload: ResponseBody = {
      unit,
      issues,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[fleet/asset-detail] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load asset detail." },
      { status: 500 },
    );
  }
}