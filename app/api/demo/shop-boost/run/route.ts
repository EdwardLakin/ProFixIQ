// app/api/demo/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  buildShadowShopSnapshot,
  type ShadowShopSnapshot,
} from "@/features/integrations/shopBoost/shadowShop";
import {
  SHOP_BOOST_UPLOAD_DATASET_KEYS,
  type ShopBoostUploadDatasetKey,
} from "@/features/integrations/shopBoost/uploadDatasets";

type DB = Database;

type DemoRunSuccessResponse = {
  ok: true;
  demoId: string;
  intakeId: string;
  analysis: ShadowShopSnapshot;
};

type DemoRunErrorResponse = {
  ok: false;
  error: string;
};

type DemoRunResponse = DemoRunSuccessResponse | DemoRunErrorResponse;

function safeShopName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 80);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asFile(v: FormDataEntryValue | null): File | null {
  if (!v || typeof v !== "object") return null;
  const rec = v as unknown;
  if (!isRecord(rec)) return null;

  const ab = rec.arrayBuffer;
  const name = rec.name;
  if (typeof ab !== "function" || typeof name !== "string") return null;

  return v as File;
}

export async function POST(req: NextRequest): Promise<NextResponse<DemoRunResponse>> {
  try {
    const formData = await req.formData();

    const rawShopName = formData.get("shopName");
    const rawCountry = formData.get("country");

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

    const filesByDataset: Partial<Record<ShopBoostUploadDatasetKey, File>> = {};
    for (const key of SHOP_BOOST_UPLOAD_DATASET_KEYS) {
      const file = asFile(formData.get(`${key}File`));
      if (file) filesByDataset[key] = file;
    }

    if (Object.values(filesByDataset).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Please upload at least one CSV so we have data to analyze." },
        { status: 400 },
      );
    }

    const intakeId = randomUUID();
    const snapshot = await buildShadowShopSnapshot({
      intakeId,
      uploadedFiles: filesByDataset,
    });

    const supabase = createAdminSupabase();
    const { data: demoRow, error: demoErr } = await supabase
      .from("demo_shop_boosts")
      .insert({
        shop_id: null,
        intake_id: null,
        shop_name: shopName,
        country: countryValue,
        snapshot,
      } as DB["public"]["Tables"]["demo_shop_boosts"]["Insert"])
      .select("id")
      .single();

    if (demoErr || !demoRow?.id) {
      console.error("Failed to insert demo_shop_boosts", demoErr);
      return NextResponse.json(
        { ok: false, error: "We ran the analysis, but could not save the demo result." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        demoId: demoRow.id as string,
        intakeId,
        analysis: snapshot,
      },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error while running demo analysis.";
    console.error("Demo run error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
