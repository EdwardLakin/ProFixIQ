import { NextResponse } from "next/server";
import { Buffer } from "buffer";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const BUCKET = "shop-imports"; // make sure this bucket exists in Supabase

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const shopId = formData.get("shopId");
    const questionnaireRaw = formData.get("questionnaire");
    const customersFile = formData.get("customersFile") as File | null;
    const vehiclesFile = formData.get("vehiclesFile") as File | null;
    const partsFile = formData.get("partsFile") as File | null;

    if (!shopId || typeof shopId !== "string") {
      return NextResponse.json(
        { error: "Missing shopId in request." },
        { status: 400 },
      );
    }

    if (!questionnaireRaw) {
      return NextResponse.json(
        { error: "Missing questionnaire data." },
        { status: 400 },
      );
    }

    const questionnaire = JSON.parse(String(questionnaireRaw));

    const supabase = createAdminSupabase();

    const uploadCsv = async (file: File | null, kind: string) => {
      if (!file) return null;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const ext = ".csv";
      const key = `${shopId}/${kind}/${Date.now()}-${file.name || `upload${ext}`}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(key, buffer, {
          contentType: file.type || "text/csv",
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error", kind, uploadError);
        throw uploadError;
      }

      return key;
    };

    const [customersPath, vehiclesPath, partsPath] = await Promise.all([
      uploadCsv(customersFile, "customers"),
      uploadCsv(vehiclesFile, "vehicles"),
      uploadCsv(partsFile, "parts"),
    ]);

    const { error: insertError } = await supabase
      .from("shop_boost_intakes")
      .insert({
        shop_id: shopId,
        questionnaire,
        customers_file_path: customersPath,
        vehicles_file_path: vehiclesPath,
        parts_file_path: partsPath,
        status: "pending",
      });

    if (insertError) {
      console.error(insertError);
      return NextResponse.json(
        { error: "Failed to create Shop Boost intake." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Shop Boost error", err);
    return NextResponse.json(
      { error: "Failed to start Shop Boost onboarding." },
      { status: 500 },
    );
  }
}