// TODO Demo Shop Boost claim
// app/api/demo/shop-boost/claim/route.ts

import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

type ClaimBody = {
  demoId?: string;
  email?: string;
};

type ClaimSuccessResponse = {
  ok: true;
  snapshot: unknown; // ShopHealthSnapshot, but API layer stays generic
};

type ClaimErrorResponse = {
  ok: false;
  error: string;
};

type ClaimResponse = ClaimSuccessResponse | ClaimErrorResponse;

export async function POST(req: NextRequest): Promise<NextResponse<ClaimResponse>> {
  try {
    const body = (await req.json().catch(() => null)) as ClaimBody | null;

    const demoId = body?.demoId?.trim();
    const emailRaw = body?.email?.trim();

    if (!demoId || !emailRaw) {
      return NextResponse.json(
        {
          ok: false,
          error: "demoId and email are required.",
        },
        { status: 400 },
      );
    }

    const emailNormalized = emailRaw.toLowerCase();

    const supabase = createAdminSupabase();

    // 1) Enforce one free run per email
    const { data: existingLead, error: existingErr } = await supabase
      .from("demo_shop_boost_leads")
      .select("id")
      .eq("email", emailNormalized)
      .maybeSingle();

    if (!existingErr && existingLead) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "You’ve already used your free Instant Shop Analysis with this email. Create an account to keep using it.",
        },
        { status: 403 },
      );
    }

    // 2) Load demo snapshot
    const { data: demoRow, error: demoErr } = await supabase
      .from("demo_shop_boosts")
      .select("id, snapshot")
      .eq("id", demoId)
      .maybeSingle();

    if (demoErr || !demoRow || !demoRow.snapshot) {
      console.error("Demo not found or missing snapshot", demoErr);
      return NextResponse.json(
        {
          ok: false,
          error: "We couldn't find that demo analysis. Please run it again.",
        },
        { status: 404 },
      );
    }

    const snapshot = demoRow.snapshot as {
      narrativeSummary?: string | null;
    } | null;

    const summary =
      snapshot && typeof snapshot.narrativeSummary === "string"
        ? snapshot.narrativeSummary
        : null;

    // 3) Insert lead row
    const { error: leadErr } = await supabase
      .from("demo_shop_boost_leads")
      .insert({
        demo_id: demoId,
        email: emailNormalized,
        summary,
      } as DB["public"]["Tables"]["demo_shop_boost_leads"]["Insert"]);

    if (leadErr) {
      console.error("Failed to insert demo lead", leadErr);
      return NextResponse.json(
        {
          ok: false,
          error: "We couldn't save your email. Please try again.",
        },
        { status: 500 },
      );
    }

    // 4) Mark demo as unlocked
    const { error: updateErr } = await supabase
      .from("demo_shop_boosts")
      .update({ has_unlocked: true })
      .eq("id", demoId);

    if (updateErr) {
      console.error("Failed to mark demo as unlocked", updateErr);
    }

    return NextResponse.json(
      {
        ok: true,
        snapshot: demoRow.snapshot,
      },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error while claiming demo.";
    console.error("Demo claim error", err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}