// app/api/onboarding/shop-boost/route.ts

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

type DB = Database;

const BUCKET = "shop-imports";

type Resp =
  | { ok: true; shopId: string; intakeId: string; snapshot: unknown }
  | { ok: false; error: string };

function isFile(v: unknown): v is File {
  return (
    typeof v === "object" &&
    v !== null &&
    "arrayBuffer" in (v as any) &&
    "name" in (v as any)
  );
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: NextRequest): Promise<NextResponse<Resp>> {
  try {
    // ✅ user-scoped supabase (cookies)
    const supabaseUser = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ✅ resolve shop_id from profile (DO NOT trust client shopId)
    const { data: prof, error: profErr } = await supabaseUser
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<{ shop_id: string | null }>();

    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
    }
    if (!prof?.shop_id) {
      return NextResponse.json(
        { ok: false, error: "No shop linked to your profile." },
        { status: 400 },
      );
    }

    const shopId = prof.shop_id;

    // ✅ accept files + questionnaire (optional) via formdata
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request. Please submit as multipart/form-data." },
        { status: 400 },
      );
    }

    const rawQuestionnaire = formData.get("questionnaire");
    let questionnaire: unknown = {};
    if (typeof rawQuestionnaire === "string" && rawQuestionnaire.trim().length > 0) {
      try {
        questionnaire = JSON.parse(rawQuestionnaire);
      } catch {
        questionnaire = {};
      }
    }

    const customersFile = isFile(formData.get("customersFile"))
      ? (formData.get("customersFile") as File)
      : null;

    const vehiclesFile = isFile(formData.get("vehiclesFile"))
      ? (formData.get("vehiclesFile") as File)
      : null;

    const partsFile = isFile(formData.get("partsFile"))
      ? (formData.get("partsFile") as File)
      : null;

    const noUploads = !customersFile && !vehiclesFile && !partsFile;

    const supabaseAdmin = createAdminSupabase();
    const intakeId = randomUUID();

    // ✅ If re-running with no new files, reuse latest intake file paths (best UX)
    let fallbackPaths: {
      customersPath: string | null;
      vehiclesPath: string | null;
      partsPath: string | null;
    } = { customersPath: null, vehiclesPath: null, partsPath: null };

    if (noUploads) {
      const { data: latestIntake } = await supabaseAdmin
        .from("shop_boost_intakes")
        .select("customers_file_path, vehicles_file_path, parts_file_path")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          customers_file_path: string | null;
          vehicles_file_path: string | null;
          parts_file_path: string | null;
        }>();

      fallbackPaths = {
        customersPath: latestIntake?.customers_file_path ?? null,
        vehiclesPath: latestIntake?.vehicles_file_path ?? null,
        partsPath: latestIntake?.parts_file_path ?? null,
      };
    }

    const uploadIfPresent = async (
      file: File | null,
      kind: "customers" | "vehicles" | "parts",
    ): Promise<string | null> => {
      if (!file) return null;

      const safeName = safeFileName(file.name || `${kind}.csv`);
      const path = `shops/${shopId}/${intakeId}/${kind}-${safeName}`;

      const { error: uploadErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "text/csv",
      });

      if (uploadErr) throw new Error(`Failed to upload ${kind}: ${uploadErr.message}`);
      return path;
    };

    const [customersPath, vehiclesPath, partsPath] = await Promise.all([
      uploadIfPresent(customersFile, "customers"),
      uploadIfPresent(vehiclesFile, "vehicles"),
      uploadIfPresent(partsFile, "parts"),
    ]);

    const customersFinal = customersPath ?? fallbackPaths.customersPath;
    const vehiclesFinal = vehiclesPath ?? fallbackPaths.vehiclesPath;
    const partsFinal = partsPath ?? fallbackPaths.partsPath;

    // ✅ create intake row (real shop)
    const intakeInsert: DB["public"]["Tables"]["shop_boost_intakes"]["Insert"] = {
      id: intakeId,
      shop_id: shopId,
      questionnaire:
        questionnaire as DB["public"]["Tables"]["shop_boost_intakes"]["Insert"]["questionnaire"],
      customers_file_path: customersFinal,
      vehicles_file_path: vehiclesFinal,
      parts_file_path: partsFinal,
      status: "pending",
    };

    const { error: intakeErr } = await supabaseAdmin.from("shop_boost_intakes").insert(intakeInsert);

    if (intakeErr) {
      return NextResponse.json(
        { ok: false, error: `Failed to create intake: ${intakeErr.message}` },
        { status: 500 },
      );
    }

    // ✅ run pipeline (should populate snapshots + suggestions tables your views read)
    const snapshot = await buildShopBoostProfile({ shopId, intakeId });

    if (!snapshot) {
      return NextResponse.json(
        { ok: false, error: "AI analysis failed. Try different exports." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, shopId, intakeId, snapshot }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[shop-boost/run-snapshot]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}