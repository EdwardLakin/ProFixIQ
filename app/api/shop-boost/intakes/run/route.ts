// app/api/shop-boost/intakes/run/route.ts

import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

type DB = Database;
type ShopBoostIntakeInsert =
  DB["public"]["Tables"]["shop_boost_intakes"]["Insert"];

type RunIntakeBody = {
  intakeId: string;
  shopId: string;
  questionnaire: unknown; // keep flexible, but NOT any
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

  const supabase = createAdminSupabase();

  // 1) Create the intake row (service_role via createAdminSupabase)
  const intakePayload: ShopBoostIntakeInsert = {
    id: intakeId,
    shop_id: shopId,
    questionnaire: questionnaire as unknown as DB["public"]["Tables"]["shop_boost_intakes"]["Insert"]["questionnaire"],
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