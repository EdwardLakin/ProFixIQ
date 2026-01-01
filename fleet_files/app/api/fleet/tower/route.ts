// app/api/fleet/tower/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type FleetPretripRow =
  DB["public"]["Tables"]["fleet_pretrip_reports"]["Row"];
type FleetDispatchRow =
  DB["public"]["Tables"]["fleet_dispatch_assignments"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

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

type DispatchAssignment = {
  id: string;
  driverName: string;
  driverId: string;
  unitLabel: string;
  unitId: string;
  routeLabel?: string | null;
  nextPreTripDue?: string | null;
  state: "pretrip_due" | "en_route" | "in_shop";
};

type TowerPayload = {
  units: FleetUnit[];
  issues: FleetIssue[];
  assignments: DispatchAssignment[];
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
      console.error("[fleet/tower] profile error:", profileErr);
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

    const [serviceRes, pretripRes, dispatchRes] = await Promise.all([
      supabaseAdmin
        .from("fleet_service_requests")
        .select("*")
        .eq("shop_id", shopId),
      supabaseAdmin
        .from("fleet_pretrip_reports")
        .select("*")
        .eq("shop_id", shopId),
      supabaseAdmin
        .from("fleet_dispatch_assignments")
        .select("*")
        .eq("shop_id", shopId),
    ]);

    if (serviceRes.error) {
      console.error("[fleet/tower] service requests error:", serviceRes.error);
    }
    if (pretripRes.error) {
      console.error("[fleet/tower] pretrips error:", pretripRes.error);
    }
    if (dispatchRes.error) {
      console.error("[fleet/tower] dispatch error:", dispatchRes.error);
    }

    const serviceRequests =
      (serviceRes.data as FleetServiceRequestRow[] | null) ?? [];
    const pretrips = (pretripRes.data as FleetPretripRow[] | null) ?? [];
    const dispatchAssignments =
      (dispatchRes.data as FleetDispatchRow[] | null) ?? [];

    // Map dispatch rows → front-end assignments
    const assignments: DispatchAssignment[] = dispatchAssignments.map((d) => ({
      id: d.id,
      driverName: (d.driver_name as string | null) ?? "Unassigned",
      driverId: (d.driver_profile_id as string | null) ?? "unknown-driver",
      unitLabel:
        (d.unit_label as string | null) ??
        (d.vehicle_identifier as string | null) ??
        "Unit",
      unitId: (d.vehicle_id as string | null) ?? "unknown-vehicle",
      routeLabel: d.route_label as string | null,
      nextPreTripDue: d.next_pretrip_due as string | null,
      state: (d.state as DispatchAssignment["state"]) ?? "pretrip_due",
    }));

    // Map service requests → issues
    const issues: FleetIssue[] = serviceRequests.map((r) => ({
      id: r.id,
      unitId: (r.vehicle_id as string | null) ?? "unknown-vehicle",
      unitLabel:
        (r.title as string | null) ??
        (r.vehicle_id as string | null) ??
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

    // Build unit map from everything we know about vehicles
    const unitMap = new Map<string, FleetUnit>();

    const ensureUnit = (vehicleId: string, label?: string | null) => {
      if (!vehicleId) return;
      if (!unitMap.has(vehicleId)) {
        unitMap.set(vehicleId, {
          id: vehicleId,
          label: label || vehicleId,
          plate: null,
          vin: null,
          class: null,
          location: null,
          status: "in_service",
          nextInspectionDate: undefined,
        });
      } else if (label) {
        const existing = unitMap.get(vehicleId)!;
        if (!existing.label || existing.label === vehicleId) {
          existing.label = label;
        }
      }
    };

    assignments.forEach((a) => {
      ensureUnit(a.unitId, a.unitLabel);
    });

    issues.forEach((i) => {
      ensureUnit(i.unitId, i.unitLabel);
    });

    pretrips.forEach((p) => {
      const vid = p.vehicle_id as string | null;
      if (vid) ensureUnit(vid, null);
    });

    const units = Array.from(unitMap.values());

    // Derive status & next inspection date from issues / scheduling info
    for (const unit of units) {
      const unitIssues = issues.filter((i) => i.unitId === unit.id);
      const hasSafety = unitIssues.some(
        (i) => i.severity === "safety" && i.status !== "completed",
      );
      const hasCompliance = unitIssues.some(
        (i) => i.severity === "compliance" && i.status !== "completed",
      );

      if (hasSafety) {
        unit.status = "oos";
      } else if (hasCompliance) {
        unit.status = "limited";
      } else {
        unit.status = "in_service";
      }

      const scheduledDates = serviceRequests
        .filter((r) => r.vehicle_id === unit.id && r.scheduled_for_date)
        .map((r) => r.scheduled_for_date as string);

      if (scheduledDates.length > 0) {
        const next = scheduledDates.sort()[0];
        unit.nextInspectionDate = next;
      }
    }

    const payload: TowerPayload = {
      units,
      issues,
      assignments,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[fleet/tower] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load fleet tower data." },
      { status: 500 },
    );
  }
}