import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type SummaryResponse = {
  summary: string;
  lastUpdated: string;
};

async function resolveShopId(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  explicitShopId: string | null,
) {
  if (explicitShopId) return explicitShopId;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.shop_id) {
    return null;
  }

  return profile.shop_id;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const body = (await req.json().catch(() => ({}))) as {
      shopId?: string | null;
    };

    const shopId = await resolveShopId(
      supabase,
      body.shopId ?? null,
    );

    if (!shopId) {
      return NextResponse.json(
        { error: "Unable to resolve shop for AI summary." },
        { status: 400 },
      );
    }

    // Active fleet units for the shop
    const { data: fleetUnits, error: fleetError } = await supabase
      .from("fleet_vehicles")
      .select(
        `
        vehicle_id,
        active,
        fleets!inner (
          shop_id
        )
      `,
      )
      .eq("active", true)
      .eq("fleets.shop_id", shopId);

    if (fleetError) {
      return NextResponse.json(
        { error: "Failed to load fleet vehicles." },
        { status: 500 },
      );
    }

    const vehicleIds =
      fleetUnits?.map((fv) => fv.vehicle_id).filter(Boolean) ?? [];

    // Open / scheduled service requests
    const { data: serviceRequests, error: srError } = await supabase
      .from("fleet_service_requests")
      .select("id, severity, status, vehicle_id")
      .eq("shop_id", shopId)
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

    // Recent pre-trips
    const { data: pretrips, error: pretripError } = await supabase
      .from("fleet_pretrip_reports")
      .select("id, has_defects, inspection_date")
      .eq("shop_id", shopId)
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
      serviceRequests?.filter((sr) => sr.severity === "compliance").length ??
      0;

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
        `${openRequests} service request${openRequests === 1 ? " is" : "s are"} open or scheduled, including ${safetyRequests} safety and ${complianceRequests} compliance item${complianceRequests === 1 ? "" : "s"}.`,
      );
    }

    if (totalPretrips === 0) {
      lines.push(
        "No pre-trip reports in the last 7 days. Encourage drivers to complete daily DVIRs.",
      );
    } else {
      lines.push(
        `${totalPretrips} pre-trip report${totalPretrips === 1 ? "" : "s"} logged in the last 7 days; ${defectPretrips} had reported defects.`,
      );
    }

    lines.push(
      "Focus on clearing safety items first, then compliance, then use maintenance/recommend items to plan shop capacity.",
    );

    const summary: SummaryResponse = {
      summary: lines.join("\n"),
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(summary);
  } catch (err) {
    console.error("[fleet/ai-summary] error", err);
    return NextResponse.json(
      { error: "Failed to generate fleet AI summary." },
      { status: 500 },
    );
  }
}
