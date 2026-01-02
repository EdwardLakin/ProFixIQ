// app/api/fleet/ai-summary/route.ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type SummaryResponse = {
  summary: string;
  lastUpdated: string;
  fleetId: string;
};

type Body = {
  fleetId?: string | null;
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

    // Active fleet units for the fleet
    const { data: fleetUnits, error: fleetError } = await supabase
      .from("fleet_vehicles")
      .select("vehicle_id, active")
      .eq("fleet_id", fleetId)
      .or("active.is.null,active.eq.true");

    if (fleetError) {
      return NextResponse.json(
        { error: "Failed to load fleet vehicles." },
        { status: 500 },
      );
    }

    const vehicleIds =
      fleetUnits?.map((fv) => fv.vehicle_id).filter(Boolean) ?? [];

    // Open / scheduled service requests (fleet scoped)
    const { data: serviceRequests, error: srError } = await supabase
      .from("fleet_service_requests")
      .select("id, severity, status, vehicle_id")
      .eq("fleet_id", fleetId)
      .in("status", ["open", "scheduled"]);

    if (srError) {
      return NextResponse.json(
        { error: "Failed to load fleet service requests." },
        { status: 500 },
      );
    }

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

    // Recent pre-trips (fleet scoped)
    const { data: pretrips, error: pretripError } = await supabase
      .from("fleet_pretrip_reports")
      .select("id, has_defects, inspection_date")
      .eq("fleet_id", fleetId)
      .gte("inspection_date", sevenDaysAgoStr);

    if (pretripError) {
      return NextResponse.json(
        { error: "Failed to load pre-trip reports." },
        { status: 500 },
      );
    }

    const totalUnits = vehicleIds.length;
    const openRequests = serviceRequests?.length ?? 0;
    const safetyRequests =
      serviceRequests?.filter((sr) => sr.severity === "safety").length ?? 0;
    const complianceRequests =
      serviceRequests?.filter((sr) => sr.severity === "compliance").length ?? 0;

    const totalPretrips = pretrips?.length ?? 0;
    const defectPretrips =
      pretrips?.filter((p) => p.has_defects === true).length ?? 0;

    const lines: string[] = [];

    lines.push(
      `You currently have ${totalUnits} fleet unit${totalUnits === 1 ? "" : "s"} enrolled.`,
    );

    if (openRequests === 0) {
      lines.push("No open or scheduled fleet service requests right now.");
    } else {
      lines.push(
        `${openRequests} service request${
          openRequests === 1 ? " is" : "s are"
        } open or scheduled, including ${safetyRequests} safety and ${complianceRequests} compliance item${
          complianceRequests === 1 ? "" : "s"
        }.`,
      );
    }

    if (totalPretrips === 0) {
      lines.push(
        "No pre-trip reports in the last 7 days. Encourage drivers to complete daily DVIRs.",
      );
    } else {
      lines.push(
        `${totalPretrips} pre-trip report${
          totalPretrips === 1 ? "" : "s"
        } logged in the last 7 days; ${defectPretrips} had reported defects.`,
      );
    }

    lines.push(
      "Focus on clearing safety items first, then compliance, then use maintenance/recommend items to plan shop capacity.",
    );

    const summary: SummaryResponse = {
      fleetId,
      summary: lines.join("\n"),
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(summary);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fleet/ai-summary] error", err);
    return NextResponse.json(
      { error: "Failed to generate fleet AI summary." },
      { status: 500 },
    );
  }
}