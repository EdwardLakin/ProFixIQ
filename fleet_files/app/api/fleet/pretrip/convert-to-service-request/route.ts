// app/api/fleet/pretrip/convert-to-service-request/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type FleetPretripRow =
  DB["public"]["Tables"]["fleet_pretrip_reports"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];

type RequestBody = {
  pretripId: string;
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
    if (!body?.pretripId) {
      return NextResponse.json(
        { error: "pretripId is required." },
        { status: 400 },
      );
    }

    const pretripId = body.pretripId;

    const { data: pretrip, error: pretripErr } = await supabaseAdmin
      .from("fleet_pretrip_reports")
      .select("*")
      .eq("id", pretripId)
      .maybeSingle<FleetPretripRow>();

    if (pretripErr || !pretrip) {
      console.error("[pretrip→sr] pretrip error:", pretripErr);
      return NextResponse.json(
        { error: "Pre-trip not found." },
        { status: 404 },
      );
    }

    // If already linked, short-circuit
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("fleet_service_requests")
      .select("id")
      .eq("source_pretrip_id", pretripId)
      .maybeSingle<FleetServiceRequestRow>();

    if (existingErr) {
      console.error("[pretrip→sr] existing error:", existingErr);
    }

    if (existing) {
      return NextResponse.json({
        status: "already_linked",
        serviceRequestId: existing.id,
      });
    }

    const checklist = (pretrip.checklist as Record<string, string> | null) || {};

    const criticalKeys = ["brakes", "steering", "suspension", "tires"];
    const hasCritical = criticalKeys.some(
      (k) => checklist[k] && checklist[k] === "defect",
    );

    const severity: FleetServiceRequestRow["severity"] =
      (hasCritical ? "safety" : "compliance") as FleetServiceRequestRow["severity"];

    const defectLines = Object.entries(checklist)
      .filter(([, v]) => v === "defect")
      .map(([k]) => `• ${k}`);

    const title =
      defectLines.length > 0
        ? "Pre-trip defects reported"
        : "Pre-trip concern";

    const summaryParts: string[] = [];
    if (defectLines.length > 0) {
      summaryParts.push("Defects:\n" + defectLines.join("\n"));
    }
    if (pretrip.notes) summaryParts.push(`Notes:\n${pretrip.notes}`);

    const summary =
      summaryParts.join("\n\n") || "Defects / concerns from pre-trip.";

    const { data: created, error: createErr } = await supabaseAdmin
      .from("fleet_service_requests")
      .insert({
        shop_id: pretrip.shop_id,
        vehicle_id: pretrip.vehicle_id,
        source_pretrip_id: pretrip.id,
        title,
        summary,
        severity,
        status: "open",
        scheduled_for_date: null,
        work_order_id: null,
        created_by_profile_id: pretrip.driver_profile_id,
      })
      .select("id")
      .maybeSingle<FleetServiceRequestRow>();

    if (createErr || !created) {
      console.error("[pretrip→sr] create error:", createErr);
      return NextResponse.json(
        { error: "Failed to create service request." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: "created",
      serviceRequestId: created.id,
    });
  } catch (err) {
    console.error("[pretrip→sr] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to convert pre-trip to service request." },
      { status: 500 },
    );
  }
}