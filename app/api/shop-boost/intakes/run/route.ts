// app/api/shop-boost/intakes/run/route.ts

import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

type DB = Database;

type ShopBoostIntakeInsert =
  DB["public"]["Tables"]["shop_boost_intakes"]["Insert"];

type ShopBoostQuestionnaire =
  DB["public"]["Tables"]["shop_boost_intakes"]["Row"]["questionnaire"];

type RunIntakeBody = {
  intakeId: string;
  shopId: string;
  questionnaire: ShopBoostQuestionnaire;
  customersPath: string | null;
  vehiclesPath: string | null;
  partsPath: string | null;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as RunIntakeBody | null;

  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const {
    intakeId,
    shopId,
    questionnaire,
    customersPath,
    vehiclesPath,
    partsPath,
  } = body;

  if (!shopId || !intakeId) {
    return NextResponse.json(
      { ok: false, error: "shopId and intakeId are required" },
      { status: 400 },
    );
  }

  if (!questionnaire) {
    return NextResponse.json(
      { ok: false, error: "questionnaire is required" },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabase();

  // 0) Enforce one free run per shop
  const { count, error: countErr } = await supabase
    .from("shop_boost_intakes")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);

  if (!countErr && (count ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "You’ve already used your free AI Shop Boost for this shop. Sign up for a plan to refresh it anytime.",
      },
      { status: 403 },
    );
  }

  // 1) Create the intake row (service_role via createAdminSupabase)
  const intakePayload: ShopBoostIntakeInsert = {
    id: intakeId,
    shop_id: shopId,
    questionnaire,
    customers_file_path: customersPath,
    vehicles_file_path: vehiclesPath,
    parts_file_path: partsPath,
    status: "pending",
  };

  const { error: insertErr } = await supabase
    .from("shop_boost_intakes")
    .insert(intakePayload);

  if (insertErr) {
    console.error("Failed to insert shop_boost_intakes", insertErr);
    return NextResponse.json(
      { ok: false, error: "Failed to create intake" },
      { status: 500 },
    );
  }

  // 2) Run the AI pipeline immediately for the WOW moment
  const snapshot = await buildShopBoostProfile({
    shopId,
    intakeId,
  });

  // buildShopBoostProfile:
  //  - reads the intake row + CSVs
  //  - writes shop_ai_profiles.summary
  //  - logs ai_training_events + ai_training_data
  //  - updates intake status

  if (!snapshot) {
    return NextResponse.json(
      {
        ok: false,
        snapshot: null,
        error: "Failed to build Shop Health Snapshot",
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