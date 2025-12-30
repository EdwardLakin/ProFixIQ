// app/api/fleet/pretrip/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ChecklistStatus = "ok" | "defect" | "na";

type ChecklistPayload = Record<
  string,
  ChecklistStatus
>;

type PretripPayload = {
  unitId: string; // vehicle_id in DB
  driverName?: string;
  date: string; // yyyy-mm-dd
  odometer?: number | null;
  checklist: ChecklistPayload;
  notes?: string | null;
  hasDefects?: boolean;
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    unitId,
    driverName,
    date,
    odometer,
    checklist,
    notes,
    hasDefects,
  } = (await req.json()) as PretripPayload;

  if (!unitId || !date) {
    return NextResponse.json(
      { error: "unitId and date are required." },
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    console.error("Profile/shop lookup failed:", profileError);
    return NextResponse.json(
      { error: "Unable to resolve shop for user." },
      { status: 400 },
    );
  }

  const effectiveDriverName =
    driverName && driverName.trim().length > 0
      ? driverName.trim()
      : profile.full_name || "Unknown driver";

  const { data, error } = await supabase
    .from("fleet_pretrip_reports")
    .insert({
      shop_id: profile.shop_id,
      vehicle_id: unitId,
      driver_profile_id: profile.id,
      driver_name: effectiveDriverName,
      inspection_date: date,
      odometer_km: odometer ?? null,
      checklist,
      notes: notes ?? null,
      has_defects: !!hasDefects,
      source: "mobile_pretrip",
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("Pretrip insert error:", error);
    return NextResponse.json(
      { error: "Failed to create pre-trip record." },
      { status: 500 },
    );
  }

  // 🔧 FUTURE: if has_defects, create service requests / dispatch tasks here.

  return NextResponse.json(
    {
      id: data.id,
      createdAt: data.created_at,
    },
    { status: 201 },
  );
}