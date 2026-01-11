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
  const base = (name || "upload.csv").trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length ? cleaned : "upload.csv";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function isShopScopedPath(shopId: string, path: string | null): boolean {
  if (!path) return true;
  return path.startsWith(`${shopId}/`);
}

export async function POST(req: NextRequest): Promise<NextResponse<Resp>> {
  try {
    const supabaseUser = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

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
    const supabaseAdmin = createAdminSupabase();

    const contentType = req.headers.get("content-type") ?? "";

    let questionnaire: unknown = {};

    let customersFile: File | null = null;
    let vehiclesFile: File | null = null;
    let partsFile: File | null = null;
    let staffFile: File | null = null;

    let providedIntakeId: string | null = null;
    let providedCustomersPath: string | null = null;
    let providedVehiclesPath: string | null = null;
    let providedPartsPath: string | null = null;
    let providedStaffPath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return NextResponse.json(
          { ok: false, error: "Invalid request. Please submit as multipart/form-data." },
          { status: 400 },
        );
      }

      questionnaire = parseQuestionnaire(formData.get("questionnaire"));
      customersFile = asFile(formData.get("customersFile"));
      vehiclesFile = asFile(formData.get("vehiclesFile"));
      partsFile = asFile(formData.get("partsFile"));
      staffFile = asFile(formData.get("staffFile"));

      const rawIntake = formData.get("intakeId");
      providedIntakeId = typeof rawIntake === "string" ? rawIntake : null;
    } else {
      const body = (await req.json().catch(() => null)) as unknown;
      if (isRecord(body)) {
        if ("questionnaire" in body) questionnaire = body["questionnaire"];
        if ("intakeId" in body) providedIntakeId = asString(body["intakeId"]);
        if ("customersPath" in body) providedCustomersPath = asString(body["customersPath"]);
        if ("vehiclesPath" in body) providedVehiclesPath = asString(body["vehiclesPath"]);
        if ("partsPath" in body) providedPartsPath = asString(body["partsPath"]);
        if ("staffPath" in body) providedStaffPath = asString(body["staffPath"]);
      }
    }

    const intakeId =
      providedIntakeId && UUID_RE.test(providedIntakeId) ? providedIntakeId : randomUUID();

    if (providedIntakeId && !UUID_RE.test(providedIntakeId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid intakeId format (must be UUID)." },
        { status: 400 },
      );
    }

    const uploadIfPresent = async (
      file: File | null,
      kind: "customers" | "vehicles" | "parts" | "staff",
    ): Promise<string | null> => {
      if (!file) return null;

      const safeName = safeFileName(file.name || `${kind}.csv`);
      const path = `${shopId}/${intakeId}/${kind}-${safeName}`;

      const { error: uploadErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "text/csv",
      });

      if (uploadErr) {
        throw new Error(`Failed to upload ${kind}: ${uploadErr.message}`);
      }

      return path;
    };

    const [customersPathUploaded, vehiclesPathUploaded, partsPathUploaded, staffPathUploaded] =
      await Promise.all([
        uploadIfPresent(customersFile, "customers"),
        uploadIfPresent(vehiclesFile, "vehicles"),
        uploadIfPresent(partsFile, "parts"),
        uploadIfPresent(staffFile, "staff"),
      ]);

    const noUploads = !customersFile && !vehiclesFile && !partsFile && !staffFile;

    let fallbackPaths: {
      customersPath: string | null;
      vehiclesPath: string | null;
      partsPath: string | null;
      staffPath: string | null;
    } = { customersPath: null, vehiclesPath: null, partsPath: null, staffPath: null };

    const jsonProvidedAny =
      !!providedCustomersPath ||
      !!providedVehiclesPath ||
      !!providedPartsPath ||
      !!providedStaffPath;

    if (noUploads && !jsonProvidedAny) {
      const { data: latestIntake } = await supabaseAdmin
        .from("shop_boost_intakes")
        .select("customers_file_path, vehicles_file_path, parts_file_path, staff_file_path")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          customers_file_path: string | null;
          vehicles_file_path: string | null;
          parts_file_path: string | null;
          staff_file_path: string | null;
        }>();

      fallbackPaths = {
        customersPath: latestIntake?.customers_file_path ?? null,
        vehiclesPath: latestIntake?.vehicles_file_path ?? null,
        partsPath: latestIntake?.parts_file_path ?? null,
        staffPath: latestIntake?.staff_file_path ?? null,
      };
    }

    const customersFinal =
      customersPathUploaded ?? providedCustomersPath ?? fallbackPaths.customersPath;
    const vehiclesFinal =
      vehiclesPathUploaded ?? providedVehiclesPath ?? fallbackPaths.vehiclesPath;
    const partsFinal =
      partsPathUploaded ?? providedPartsPath ?? fallbackPaths.partsPath;
    const staffFinal =
      staffPathUploaded ?? providedStaffPath ?? fallbackPaths.staffPath;

    if (
      !isShopScopedPath(shopId, customersFinal) ||
      !isShopScopedPath(shopId, vehiclesFinal) ||
      !isShopScopedPath(shopId, partsFinal) ||
      !isShopScopedPath(shopId, staffFinal)
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid file path (must start with your shopId/)." },
        { status: 400 },
      );
    }

    if (!customersFinal && !vehiclesFinal && !partsFinal && !staffFinal) {
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
      // ✅ requires column in table + types
      staff_file_path: staffFinal,
      status: "pending",
    };

    const { error: intakeErr } = await supabaseAdmin.from("shop_boost_intakes").insert(intakeInsert);

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

    return NextResponse.json({ ok: true, shopId, intakeId, snapshot }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[shop-boost/intakes/run]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}