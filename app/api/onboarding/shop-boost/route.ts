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

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Avoid `instanceof File` (can be unreliable across runtimes/bundlers).
 * This checks for the shape Next route handlers provide for uploaded files.
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

function parseQuestionnaire(raw: unknown): unknown {
  if (typeof raw !== "string") return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return {};
  }
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
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // ✅ resolve shop_id from profile (DO NOT trust client shopId)
    const { data: prof, error: profErr } = await supabaseUser
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<{ shop_id: string | null }>();

    if (profErr) {
      return NextResponse.json(
        { ok: false, error: profErr.message },
        { status: 500 },
      );
    }

    if (!prof?.shop_id) {
      return NextResponse.json(
        { ok: false, error: "No shop linked to your profile." },
        { status: 400 },
      );
    }

    const shopId = prof.shop_id;
    const supabaseAdmin = createAdminSupabase();
    const intakeId = randomUUID();

    // We support:
    //  - multipart/form-data (uploads + questionnaire)
    //  - application/json (rerun snapshot from reports; no uploads)
    const contentType = req.headers.get("content-type") ?? "";

    let questionnaire: unknown = {};
    let customersFile: File | null = null;
    let vehiclesFile: File | null = null;
    let partsFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error: "Invalid request. Please submit as multipart/form-data.",
          },
          { status: 400 },
        );
      }

      questionnaire = parseQuestionnaire(formData.get("questionnaire"));

      customersFile = asFile(formData.get("customersFile"));
      vehiclesFile = asFile(formData.get("vehiclesFile"));
      partsFile = asFile(formData.get("partsFile"));
    } else {
      // JSON rerun mode (reports panel)
      const body = (await req.json().catch(() => null)) as unknown;

      if (isRecord(body) && "questionnaire" in body) {
        questionnaire = body["questionnaire"];
      } else {
        questionnaire = {};
      }
    }

    const noUploads = !customersFile && !vehiclesFile && !partsFile;

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

      const { error: uploadErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || "text/csv",
        });

      if (uploadErr) {
        throw new Error(`Failed to upload ${kind}: ${uploadErr.message}`);
      }

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

    // If we have nothing at all to analyze, fail fast
    if (!customersFinal && !vehiclesFinal && !partsFinal) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No uploads found and no previous intake files exist yet. Upload at least one CSV first.",
        },
        { status: 400 },
      );
    }

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

    const { error: intakeErr } = await supabaseAdmin
      .from("shop_boost_intakes")
      .insert(intakeInsert);

    if (intakeErr) {
      return NextResponse.json(
        { ok: false, error: `Failed to create intake: ${intakeErr.message}` },
        { status: 500 },
      );
    }

    const snapshot = await buildShopBoostProfile({ shopId, intakeId });

    if (!snapshot) {
      return NextResponse.json(
        { ok: false, error: "AI analysis failed. Try different exports." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: true, shopId, intakeId, snapshot },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[shop-boost/run-snapshot]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}