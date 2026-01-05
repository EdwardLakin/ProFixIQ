// app/api/demo/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

type DB = Database;

const SHOP_IMPORT_BUCKET = "shop-imports";
const DEMO_OWNER_ID = process.env.DEMO_OWNER_ID ?? "";

type DemoRunSuccessResponse = {
  ok: true;
  demoId: string;
  snapshot: unknown; // ShopHealthSnapshot, but keep as unknown at API layer
};

type DemoRunErrorResponse = {
  ok: false;
  error: string;
};

type DemoRunResponse = DemoRunSuccessResponse | DemoRunErrorResponse;

export async function POST(
  req: NextRequest,
): Promise<NextResponse<DemoRunResponse>> {
  try {
    const formData = await req.formData();

    const rawShopName = formData.get("shopName");
    const rawCountry = formData.get("country");
    const rawQuestionnaire = formData.get("questionnaire");

    const shopName =
      typeof rawShopName === "string" && rawShopName.trim().length > 0
        ? rawShopName.trim()
        : null;

    if (!shopName) {
      return NextResponse.json(
        { ok: false, error: "Shop name is required." },
        { status: 400 },
      );
    }

    const countryValue =
      typeof rawCountry === "string" && (rawCountry === "US" || rawCountry === "CA")
        ? rawCountry
        : "US";

    let questionnaire: unknown = {};
    if (typeof rawQuestionnaire === "string" && rawQuestionnaire.trim().length > 0) {
      try {
        questionnaire = JSON.parse(rawQuestionnaire);
      } catch {
        questionnaire = {};
      }
    }

    const customersFile =
      formData.get("customersFile") instanceof File
        ? (formData.get("customersFile") as File)
        : null;

    const vehiclesFile =
      formData.get("vehiclesFile") instanceof File
        ? (formData.get("vehiclesFile") as File)
        : null;

    const partsFile =
      formData.get("partsFile") instanceof File
        ? (formData.get("partsFile") as File)
        : null;

    if (!customersFile && !vehiclesFile && !partsFile) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please upload at least one CSV so we have some history to analyze.",
        },
        { status: 400 },
      );
    }

    if (!DEMO_OWNER_ID) {
      console.error("[demo/shop-boost/run] DEMO_OWNER_ID is not set");
      return NextResponse.json(
        { ok: false, error: "Demo is not configured yet. Please try again later." },
        { status: 500 },
      );
    }

    const supabase = createAdminSupabase();

    // Generate intake id BEFORE shop insert so we can guarantee unique shop.name
    const intakeId = randomUUID();

    // 1) Create a demo shop row
    // NOTE: shops.plan has a CHECK constraint (free/diy/pro/pro_plus), and owner_id is NOT NULL.
    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .insert({
        owner_id: DEMO_OWNER_ID,
        business_name: shopName,
        // shops.name has UNIQUE constraint
        name: `${shopName} (Demo ${intakeId.slice(0, 6)})`,
        country: countryValue,
        plan: "free",
        // keep shops_active_user_count_le_max_users happy
        max_users: 1,
        active_user_count: 0,
      } as DB["public"]["Tables"]["shops"]["Insert"])
      .select("id")
      .single();

    if (shopErr || !shopRow?.id) {
      console.error("[demo/shop-boost/run] Failed to create demo shop", shopErr);
      return NextResponse.json(
        { ok: false, error: "We couldn't create a demo shop record. Please try again." },
        { status: 500 },
      );
    }

    const shopId = shopRow.id as string;

    // Helper to upload files to the demo folder
    const uploadIfPresent = async (
      file: File | null,
      kind: "customers" | "vehicles" | "parts",
    ): Promise<string | null> => {
      if (!file) return null;

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `demo/${shopId}/${intakeId}/${kind}-${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from(SHOP_IMPORT_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Failed to upload ${kind} file: ${uploadErr.message}`);
      }

      return path;
    };

    // 2) Upload any CSVs they provided
    const [customersPath, vehiclesPath, partsPath] = await Promise.all([
      uploadIfPresent(customersFile, "customers"),
      uploadIfPresent(vehiclesFile, "vehicles"),
      uploadIfPresent(partsFile, "parts"),
    ]);

    // 3) Create the intake row
    const intakePayload: DB["public"]["Tables"]["shop_boost_intakes"]["Insert"] = {
      id: intakeId,
      shop_id: shopId,
      questionnaire:
        questionnaire as DB["public"]["Tables"]["shop_boost_intakes"]["Insert"]["questionnaire"],
      customers_file_path: customersPath,
      vehicles_file_path: vehiclesPath,
      parts_file_path: partsPath,
      status: "pending",
    };

    const { error: intakeErr } = await supabase
      .from("shop_boost_intakes")
      .insert(intakePayload);

    if (intakeErr) {
      console.error("[demo/shop-boost/run] Failed to insert shop_boost_intakes", intakeErr);
      return NextResponse.json(
        { ok: false, error: "We couldn't start the analysis. Please try again." },
        { status: 500 },
      );
    }

    // 4) Run the AI pipeline for this demo intake
    const snapshot = await buildShopBoostProfile({ shopId, intakeId });

    if (!snapshot) {
      return NextResponse.json(
        {
          ok: false,
          error: "The AI analysis failed. Please try again with a different export.",
        },
        { status: 500 },
      );
    }

    // 5) Store the snapshot in demo_shop_boosts for later unlock + CRM usage
    const { data: demoRow, error: demoErr } = await supabase
      .from("demo_shop_boosts")
      .insert({
        shop_id: shopId,
        intake_id: intakeId,
        shop_name: shopName,
        country: countryValue,
        snapshot,
      } as DB["public"]["Tables"]["demo_shop_boosts"]["Insert"])
      .select("id")
      .single();

    if (demoErr || !demoRow?.id) {
      console.error("[demo/shop-boost/run] Failed to insert demo_shop_boosts", demoErr);
      return NextResponse.json(
        { ok: false, error: "We ran the analysis, but could not save the demo result." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        demoId: demoRow.id as string,
        snapshot,
      },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error while running demo analysis.";
    console.error("[demo/shop-boost/run] Demo run error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}