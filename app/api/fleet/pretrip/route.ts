// app/api/fleet/pretrip/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type FleetPretripRow =
  DB["public"]["Tables"]["fleet_pretrip_reports"]["Row"];

type DefectState = "ok" | "defect" | "na";

type RequestBody = {
  unitId: string;
  driverName: string;
  odometer: string | null;
  location: string | null;
  notes: string | null;
  defects: Record<string, DefectState>;
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
    if (!body || !body.unitId || !body.driverName) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileErr || !profile?.shop_id) {
      console.error("[fleet/pretrip] profile error:", profileErr);
      return NextResponse.json(
        { error: "Must belong to a shop to submit pre-trips." },
        { status: 400 },
      );
    }

    const odometerKm =
      body.odometer && body.odometer.trim().length > 0
        ? Number(body.odometer)
        : null;

    const hasDefects = Object.values(body.defects || {}).some(
      (s) => s === "defect",
    );

    const combinedNotes = [
      body.location ? `Location: ${body.location}` : null,
      body.notes ? `Notes: ${body.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { data, error } = await supabaseAdmin
      .from("fleet_pretrip_reports")
      .insert({
        shop_id: profile.shop_id,
        vehicle_id: body.unitId,
        driver_profile_id: profile.id,
        driver_name: body.driverName,
        inspection_date: new Date().toISOString(),
        odometer_km: odometerKm,
        checklist: body.defects,
        notes: combinedNotes || null,
        has_defects: hasDefects,
        source: "portal_pretrip",
      })
      .select("id, has_defects")
      .maybeSingle<FleetPretripRow>();

    if (error || !data) {
      console.error("[fleet/pretrip] insert error:", error);
      return NextResponse.json(
        { error: "Failed to save pre-trip." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: data.id,
      hasDefects: data.has_defects ?? hasDefects,
    });
  } catch (err) {
    console.error("[fleet/pretrip] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to save pre-trip." },
      { status: 500 },
    );
  }
}