// app/api/demo/shop-boost/claim/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

type ClaimBody = {
  demoId?: string;
  intakeId?: string;
  email?: string;
};

type ClaimSuccessResponse = {
  ok: true;
  analysis: unknown;
};

type ClaimErrorResponse = {
  ok: false;
  error: string;
};

type ClaimResponse = ClaimSuccessResponse | ClaimErrorResponse;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<ClaimResponse>> {
  try {
    const body = (await req.json().catch(() => null)) as ClaimBody | null;

    const demoId = body?.demoId?.trim();
    const intakeId = body?.intakeId?.trim() ?? null;
    const emailRaw = body?.email?.trim();

    if (!demoId || !emailRaw) {
      return NextResponse.json(
        { ok: false, error: "demoId and email are required." },
        { status: 400 },
      );
    }

    const emailNormalized = emailRaw.toLowerCase();
    const supabase = createAdminSupabase();

    const { data: existingLead, error: existingErr } = await supabase
      .from("demo_shop_boost_leads")
      .select("id")
      .eq("email", emailNormalized)
      .eq("lead_kind", "activation_claim")
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

    const { data: demoRow, error: demoErr } = await supabase
      .from("demo_shop_boosts")
      .select("id, snapshot")
      .eq("id", demoId)
      .maybeSingle();

    if (demoErr || !demoRow || !demoRow.snapshot) {
      console.error("[demo/shop-boost/claim] Demo not found or missing snapshot", demoErr);
      return NextResponse.json(
        { ok: false, error: "We couldn't find that demo analysis. Please run it again." },
        { status: 404 },
      );
    }

    const rawPayload = asRecord(demoRow.snapshot);
    if (intakeId) {
      const snapshotIntakeId = typeof rawPayload.intakeId === "string" ? rawPayload.intakeId : null;
      if (!snapshotIntakeId || snapshotIntakeId !== intakeId) {
        return NextResponse.json(
          { ok: false, error: "This preview link does not match the analysis intake." },
          { status: 403 },
        );
      }
    }

    const summary =
      typeof rawPayload.preflightSummary === "string"
        ? rawPayload.preflightSummary
        : "Shop Boost preview unlocked";

    const { error: leadErr } = await supabase
      .from("demo_shop_boost_leads")
      .insert({
        demo_id: demoId,
        email: emailNormalized,
        summary,
        lead_kind: "activation_claim",
      } as DB["public"]["Tables"]["demo_shop_boost_leads"]["Insert"] & { lead_kind: "activation_claim" });

    if (leadErr) {
      console.error("[demo/shop-boost/claim] Failed to insert demo lead", leadErr);
      return NextResponse.json(
        { ok: false, error: "We couldn't save your email. Please try again." },
        { status: 500 },
      );
    }

    const { error: updateErr } = await supabase
      .from("demo_shop_boosts")
      .update({ has_unlocked: true })
      .eq("id", demoId);

    if (updateErr) {
      console.error("[demo/shop-boost/claim] Failed to mark demo as unlocked", updateErr);
    }

    return NextResponse.json(
      { ok: true, analysis: demoRow.snapshot },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error while claiming demo.";
    console.error("[demo/shop-boost/claim] Demo claim error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
