// app/api/shop-boost/refresh/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

type RefreshBody = {
  shopId?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as RefreshBody | null;
  const shopId = body?.shopId;

  if (!shopId) {
    return NextResponse.json(
      { ok: false, error: "shopId is required" },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabase();

  // Find the most recent intake for this shop
  const { data: intakeRow, error: intakeErr } = await supabase
    .from("shop_boost_intakes")
    .select("id")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (intakeErr) {
    console.error("Failed to fetch latest intake", intakeErr);
    return NextResponse.json(
      { ok: false, error: "Failed to load latest intake" },
      { status: 500 },
    );
  }

  if (!intakeRow) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No Shop Boost intake found for this shop yet. Run Shop Boost once from onboarding first.",
      },
      { status: 404 },
    );
  }

  const snapshot = await buildShopBoostProfile({
    shopId,
    intakeId: intakeRow.id,
  });

  if (!snapshot) {
    return NextResponse.json(
      {
        ok: false,
        snapshot: null,
        error: "Failed to rebuild Shop Health Snapshot",
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      snapshot,
    },
    { status: 200 },
  );
}