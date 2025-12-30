// app/api/fleet/pretrip/convert-to-service-request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ChecklistStatus = "ok" | "defect" | "na";

type ConvertPayload = {
  pretripId: string;
  title?: string;
  severity?: "safety" | "compliance" | "maintenance" | "recommend";
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { pretripId, title, severity } =
    (await req.json().catch(() => ({}))) as ConvertPayload;

  if (!pretripId) {
    return NextResponse.json(
      { error: "pretripId is required." },
      { status: 400 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 },
    );
  }

  // Look up user profile to get shop_id
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json(
      { error: "Unable to resolve shop for user." },
      { status: 400 },
    );
  }

  const allowedRoles = [
    "owner",
    "admin",
    "manager",
    "fleet_manager",
    "dispatcher",
  ] as const;

  if (!allowedRoles.includes(profile.role as (typeof allowedRoles)[number])) {
    return NextResponse.json(
      { error: "Not authorized to create fleet service requests." },
      { status: 403 },
    );
  }

  // Fetch the pre-trip (guard by shop)
  const { data: pretrip, error: pretripError } = await supabase
    .from("fleet_pretrip_reports")
    .select("id, shop_id, vehicle_id, driver_name, checklist, has_defects")
    .eq("id", pretripId)
    .eq("shop_id", profile.shop_id)
    .maybeSingle();

  if (pretripError || !pretrip) {
    return NextResponse.json(
      { error: "Pre-trip not found for this shop." },
      { status: 404 },
    );
  }

  const checklist = (pretrip.checklist || {}) as Record<
    string,
    ChecklistStatus
  >;

  const defectEntries = Object.entries(checklist).filter(
    ([, status]) => status === "defect",
  );

  const autoSummary =
    defectEntries.length > 0
      ? defectEntries
          .map(([item]) => `Defect: ${item}`)
          .join("; ")
      : "Service request created from pre-trip (no explicit defects marked).";

  const effectiveTitle =
    title ||
    `Service request from pre-trip (${pretrip.driver_name} - ${pretripId.slice(
      0,
      8,
    )})`;

  const effectiveSeverity =
    severity || (pretrip.has_defects ? "maintenance" : "recommend");

  const { data: sr, error: srError } = await supabase
    .from("fleet_service_requests")
    .insert({
      shop_id: pretrip.shop_id,
      vehicle_id: pretrip.vehicle_id,
      source_pretrip_id: pretrip.id,
      title: effectiveTitle,
      summary: autoSummary,
      severity: effectiveSeverity,
      status: "open",
      created_by_profile_id: profile.id,
    })
    .select("id, status")
    .single();

  if (srError || !sr) {
    console.error("Fleet SR insert error:", srError);
    return NextResponse.json(
      { error: "Failed to create service request." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      id: sr.id,
      status: sr.status,
    },
    { status: 201 },
  );
}