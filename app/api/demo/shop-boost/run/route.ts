// app/api/demo/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

type DB = Database;

const SHOP_IMPORT_BUCKET = "shop-imports";

// Seeded demo owner (profiles.id / auth.users.id)
const DEMO_OWNER_ID = "22fab07e-3b6f-432b-9434-e5476a7ade28";

// shops.plan CHECK allows only: free, diy, pro, pro_plus
const DEMO_SHOP_PLAN: DB["public"]["Tables"]["shops"]["Insert"]["plan"] = "pro";

type DemoRunSuccessResponse = {
  ok: true;
  demoId: string;
  snapshot: unknown;
};

type DemoRunErrorResponse = {
  ok: false;
  error: string;
};

type DemoRunResponse = DemoRunSuccessResponse | DemoRunErrorResponse;

function safeShopName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 80);
}

function makeUniqueName(base: string): string {
  const suffix = randomUUID().slice(0, 8);
  return `${base} (Demo ${suffix})`.slice(0, 80);
}

function safeFileName(name: string): string {
  const base = (name || "upload.csv").trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length ? cleaned : "upload.csv";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Avoid `instanceof File` (unreliable across runtimes/bundlers).
 * Next route handlers provide a file-like object with name/type/arrayBuffer().
 */
function asFile(v: FormDataEntryValue | null): File | null {
  if (!v || typeof v !== "object") return null;

  const rec = v as unknown;
  if (!isRecord(rec)) return null;

  const ab = rec["arrayBuffer"];
  const name = rec["name"];
  const type = rec["type"];

  if (typeof ab !== "function") return null;
  if (typeof name !== "string") return null;
  if (typeof type !== "string") return null;

  return v as File;
}

export async function POST(req: NextRequest): Promise<NextResponse<DemoRunResponse>> {
  try {
    const formData = await req.formData();

    const rawShopName = formData.get("shopName");
    const rawCountry = formData.get("country");
    const rawQuestionnaire = formData.get("questionnaire");

    const shopName =
      typeof rawShopName === "string" && rawShopName.trim().length > 0
        ? safeShopName(rawShopName)
        : null;

    if (!shopName) {
      return NextResponse.json({ ok: false, error: "Shop name is required." }, { status: 400 });
    }

    const countryValue =
      typeof rawCountry === "string" && (rawCountry === "US" || rawCountry === "CA")
        ? rawCountry
        : "US";

    let questionnaire: unknown = {};
    if (typeof rawQuestionnaire === "string" && rawQuestionnaire.trim().length > 0) {
      try {
        questionnaire = JSON.parse(rawQuestionnaire) as unknown;
      } catch {
        questionnaire = {};
      }
    }

    const customersFile = asFile(formData.get("customersFile"));
    const vehiclesFile = asFile(formData.get("vehiclesFile"));
    const partsFile = asFile(formData.get("partsFile"));

    if (!customersFile && !vehiclesFile && !partsFile) {
      return NextResponse.json(
        { ok: false, error: "Please upload at least one CSV so we have some history to analyze." },
        { status: 400 },
      );
    }

    const supabase = createAdminSupabase();

    // 1) Create a demo shop row
    const insertShop = async (nameValue: string) => {
      return supabase
        .from("shops")
        .insert({
          owner_id: DEMO_OWNER_ID,
          business_name: nameValue,
          name: nameValue,
          country: countryValue,
          plan: DEMO_SHOP_PLAN,
        } as DB["public"]["Tables"]["shops"]["Insert"])
        .select("id")
        .single();
    };

    let { data: shopRow, error: shopErr } = await insertShop(shopName);

    if (shopErr) {
      const retryName = makeUniqueName(shopName);
      const retry = await insertShop(retryName);
      shopRow = retry.data ?? null;
      shopErr = retry.error ?? null;
    }

    if (shopErr || !shopRow?.id) {
      // eslint-disable-next-line no-console
      console.error("Failed to create demo shop", shopErr);
      return NextResponse.json(
        { ok: false, error: "We couldn't create a demo shop record. Please try again. (Shop insert failed)" },
        { status: 500 },
      );
    }

    const shopId = shopRow.id as string;
    const intakeId = randomUUID();

    const uploadIfPresent = async (
      file: File | null,
      kind: "customers" | "vehicles" | "parts",
    ): Promise<string | null> => {
      if (!file) return null;

      // ✅ Keep first segment == shopId (matches your Storage RLS convention)
      const safeName = safeFileName(file.name || `${kind}.csv`);
      const path = `${shopId}/demo/${intakeId}/${kind}-${safeName}`;

      const { error: uploadErr } = await supabase.storage.from(SHOP_IMPORT_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "text/csv",
      });

      if (uploadErr) throw new Error(`Failed to upload ${kind} file: ${uploadErr.message}`);

      return path;
    };

    // 2) Upload CSVs
    const [customersPath, vehiclesPath, partsPath] = await Promise.all([
      uploadIfPresent(customersFile, "customers"),
      uploadIfPresent(vehiclesFile, "vehicles"),
      uploadIfPresent(partsFile, "parts"),
    ]);

    // 3) Create intake row
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

    const { error: intakeErr } = await supabase.from("shop_boost_intakes").insert(intakePayload);

    if (intakeErr) {
      // eslint-disable-next-line no-console
      console.error("Failed to insert shop_boost_intakes", intakeErr);
      return NextResponse.json(
        { ok: false, error: "We couldn't start the analysis. Please try again." },
        { status: 500 },
      );
    }

    // 4) Run pipeline
    const snapshot = await buildShopBoostProfile({ shopId, intakeId });

    if (!snapshot) {
      return NextResponse.json(
        { ok: false, error: "The AI analysis failed. Please try again with a different export." },
        { status: 500 },
      );
    }

    // 5) Store snapshot in demo_shop_boosts for later unlock + CRM usage
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
      // eslint-disable-next-line no-console
      console.error("Failed to insert demo_shop_boosts", demoErr);
      return NextResponse.json(
        { ok: false, error: "We ran the analysis, but could not save the demo result." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, demoId: demoRow.id as string, snapshot }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error while running demo analysis.";
    // eslint-disable-next-line no-console
    console.error("Demo run error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}