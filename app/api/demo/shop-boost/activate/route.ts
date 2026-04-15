import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { runShopBoostImport } from "@/features/integrations/imports/runFullImport";
import { updateIntakeProgress } from "@/features/integrations/shopBoost/status";
import {
  SHOP_BOOST_UPLOAD_DATASET_KEYS,
  type ShopBoostUploadDatasetKey,
} from "@/features/integrations/shopBoost/uploadDatasets";

type DB = Database;

type ActivationBody = {
  demoId?: string;
  intakeId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function extractPaths(snapshot: unknown): Partial<Record<ShopBoostUploadDatasetKey, string>> {
  const root = isRecord(snapshot) ? snapshot : {};
  const uploadPaths = isRecord(root.activationUploadPaths) ? root.activationUploadPaths : {};
  const result: Partial<Record<ShopBoostUploadDatasetKey, string>> = {};

  for (const key of SHOP_BOOST_UPLOAD_DATASET_KEYS) {
    const value = uploadPaths[key];
    if (typeof value === "string" && value.length > 0) {
      result[key] = value;
    }
  }

  return result;
}

function pathBasename(path: string): string {
  const chunks = path.split("/").filter(Boolean);
  return chunks[chunks.length - 1] ?? "upload.csv";
}

export async function POST(req: NextRequest) {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();

  if (authErr || !user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ActivationBody;
  const demoId = body.demoId?.trim();
  const intakeId = body.intakeId?.trim();

  if (!isUuid(demoId) || !isUuid(intakeId)) {
    return NextResponse.json({ ok: false, error: "Invalid demo activation identifiers." }, { status: 400 });
  }

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (!profile?.shop_id) {
    return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });
  }

  const shopId = profile.shop_id;
  const admin = createAdminSupabase();

  const { data: demoRow, error: demoErr } = await admin
    .from("demo_shop_boosts")
    .select("id,snapshot")
    .eq("id", demoId)
    .maybeSingle();

  if (demoErr || !demoRow?.snapshot) {
    return NextResponse.json({ ok: false, error: "Preview expired. Please run analysis again." }, { status: 404 });
  }

  const snapshot = isRecord(demoRow.snapshot) ? demoRow.snapshot : null;
  const snapshotIntake = asString(snapshot?.intakeId);
  if (!snapshot || snapshotIntake !== intakeId) {
    return NextResponse.json({ ok: false, error: "Preview/intake mismatch. Please restart preview." }, { status: 409 });
  }

  const sourcePaths = extractPaths(snapshot);
  if (Object.keys(sourcePaths).length === 0) {
    return NextResponse.json({ ok: false, error: "Preview files expired. Please run analysis again." }, { status: 410 });
  }

  const existing = await admin
    .from("shop_boost_intakes")
    .select("id,status")
    .eq("shop_id", shopId)
    .eq("id", intakeId)
    .maybeSingle();

  if (existing.data?.id) {
    return NextResponse.json({ ok: true, intakeId, status: existing.data.status, reused: true });
  }

  const copiedPaths: Partial<Record<ShopBoostUploadDatasetKey, string>> = {};
  for (const [datasetKey, sourcePath] of Object.entries(sourcePaths) as Array<[ShopBoostUploadDatasetKey, string]>) {
    const targetPath = `shops/${shopId}/${intakeId}/${datasetKey}-${pathBasename(sourcePath)}`;
    const { error: copyErr } = await admin.storage.from("shop-imports").copy(sourcePath, targetPath);
    if (copyErr) {
      return NextResponse.json(
        { ok: false, error: `Failed to prepare ${datasetKey} for activation import.` },
        { status: 500 },
      );
    }
    copiedPaths[datasetKey] = targetPath;
  }

  const intakeInsert: DB["public"]["Tables"]["shop_boost_intakes"]["Insert"] = {
    id: intakeId,
    shop_id: shopId,
    questionnaire: {},
    customers_file_path: copiedPaths.customers ?? null,
    vehicles_file_path: copiedPaths.vehicles ?? null,
    parts_file_path: copiedPaths.parts ?? null,
    history_file_path: copiedPaths.history ?? null,
    staff_file_path: copiedPaths.staff ?? null,
    intake_basics: {
      source: "demo_preview_activation",
      demoId,
      activatedByUserId: user.id,
      activatedAt: new Date().toISOString(),
    },
    status: "pending",
  };

  const { error: insertErr } = await admin.from("shop_boost_intakes").insert(intakeInsert);
  if (insertErr) {
    return NextResponse.json({ ok: false, error: `Failed to start intake: ${insertErr.message}` }, { status: 500 });
  }

  await updateIntakeProgress({
    intakeId,
    status: "queued",
    currentStep: "activation_started",
    progressPercent: 8,
    patch: { startedAt: new Date().toISOString(), lastError: null },
  });

  await updateIntakeProgress({
    intakeId,
    status: "processing",
    currentStep: "generating_suggestions",
    progressPercent: 35,
  });
  await buildShopBoostProfile({ shopId, intakeId });

  await updateIntakeProgress({
    intakeId,
    currentStep: "materializing_operating_layer",
    progressPercent: 62,
  });

  const importSummary = await runShopBoostImport({ shopId, intakeId, options: { createStaffUsers: false } });

  const completedStatus =
    importSummary.completionState === "PARTIAL_FAILURE" ||
    importSummary.completionState === "FAILED" ||
    importSummary.completionState === "NOT_READY"
      ? "completed_with_errors"
      : "completed";

  await updateIntakeProgress({
    intakeId,
    status: completedStatus,
    currentStep: "completed",
    progressPercent: 100,
    patch: {
      completedAt: new Date().toISOString(),
      failedAt: null,
      resultSummary: {
        customersImported: importSummary.customersImported,
        vehiclesImported: importSummary.vehiclesImported,
        partsImported: importSummary.partsImported,
        workOrdersImported: importSummary.workOrdersImported,
        invoicesImported: importSummary.invoicesImported,
        completionState: importSummary.completionState,
      },
    },
  });

  return NextResponse.json({ ok: true, intakeId, status: completedStatus });
}
