import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

type DB = Database;

type IntakeRunBody = {
  intakeId: string;
  questionnaire: Record<string, unknown>;
  customersPath: string | null;
  vehiclesPath: string | null;
  partsPath: string | null;
};

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<DB>({ cookies: () => cookieStore });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr || !profile?.shop_id) {
    return NextResponse.json(
      { error: "No shop associated with this user" },
      { status: 400 },
    );
  }

  const shopId = profile.shop_id;

  const body = (await req.json().catch(() => null)) as IntakeRunBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { intakeId, questionnaire, customersPath, vehiclesPath, partsPath } =
    body;

  if (!intakeId) {
    return NextResponse.json(
      { error: "intakeId is required" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();

  const { error: insertErr } = await admin.from("shop_boost_intakes").insert({
    id: intakeId,
    shop_id: shopId,
    questionnaire,
    customers_file_path: customersPath,
    vehicles_file_path: vehiclesPath,
    parts_file_path: partsPath,
    status: "pending",
  });

  if (insertErr) {
    console.error("Failed to insert shop_boost_intakes", insertErr);
    return NextResponse.json(
      { error: "Failed to create intake" },
      { status: 500 },
    );
  }

  // Instant WOW: run AI right away
  const snapshot = await buildShopBoostProfile({
    shopId,
    intakeId,
  });

  if (!snapshot) {
    return NextResponse.json(
      { ok: false, snapshot: null },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { ok: true, snapshot },
    { status: 200 },
  );
}