// /features/integrations/shopBoost/runIntakeHandler.ts
import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { runShopBoostImport, type ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";
import { buildOptimizationOpportunities } from "@/features/optimization/server/buildOptimizationOpportunities";
import {
  selectTopOnboardingOptimizationActions,
  type OnboardingOptimizationAction,
} from "@/features/optimization/server/selectOnboardingRecommendedActions";
import {
  SHOP_BOOST_UPLOAD_DATASETS,
  SHOP_BOOST_UPLOAD_DATASET_KEYS,
  type ShopBoostUploadDatasetKey,
} from "@/features/integrations/shopBoost/uploadDatasets";

import { updateIntakeProgress } from "@/features/integrations/shopBoost/status";
import { ensureRun, seedRunJobs } from "@/features/integrations/shopBoost/orchestrator";

type DB = Database;

const BUCKET = "shop-imports";

export type ShopBoostRunResp =
  | {
      ok: true;
      queued?: boolean;
      shopId: string;
      intakeId: string;
      snapshot?: unknown | null;
      importSummary: ShopBoostImportSummary;
      shopBuildSummary: {
        menuItemsCreated: number;
        inspectionTemplatesCreated: number;
        linkedMenuToInspection: number;
        menuSuggestions: number;
        inspectionSuggestions: number;
      };
      onboardingOptimization: {
        summary: {
          totalOpportunities: number;
          criticalCount: number;
          highCount: number;
          potentialMonthlyValue: number;
          dataFreshness: "fresh" | "stale";
          lastAnalyzedAt: string;
        } | null;
        nextActions: OnboardingOptimizationAction[];
      };
    }
  | { ok: false; error: string };

type RunMode = {
  allowHistoryAndStaff: boolean;
  runImport: boolean;
  deferProcessing?: boolean;
  // If true, allow JSON body to provide file paths (must be shop-scoped).
  allowProvidedPaths: boolean;
};

type UploadManifestEntry = {
  dataset: ShopBoostUploadDatasetKey;
  path: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  target: string;
  importMode: "direct" | "staging";
};

function safeFileName(name: string): string {
  const base = (name || "upload.csv").trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length ? cleaned : "upload.csv";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Avoid `instanceof File` (can be unreliable across runtimes/bundlers).
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

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ✅ SECURITY:
 * Accept both:
 * - canonical: shops/<shopId>/...
 * - legacy: <shopId>/...
 */
function isShopScopedPath(shopId: string, path: string | null): boolean {
  if (!path) return true;
  return path.startsWith(`shops/${shopId}/`) || path.startsWith(`${shopId}/`);
}

/**
 * ✅ Normalize legacy paths into canonical paths for storage + reruns.
 * If "<shopId>/..." convert to "shops/<shopId>/..."
 */
function normalizeShopPath(shopId: string, path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith(`${shopId}/`)) return `shops/${path}`;
  return path;
}

export async function runShopBoostIntake(
  req: NextRequest,
  mode: RunMode,
): Promise<ShopBoostRunResp> {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();

  if (authErr || !user?.id) {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: prof, error: profErr } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (profErr) return { ok: false, error: profErr.message };
  if (!prof?.shop_id) return { ok: false, error: "No shop linked to your profile." };

  const shopId = prof.shop_id;
  const supabaseAdmin = createAdminSupabase();

  const contentType = req.headers.get("content-type") ?? "";

  let questionnaire: unknown = {};

  const filesByDataset: Partial<Record<ShopBoostUploadDatasetKey, File>> = {};

  let providedIntakeId: string | null = null;

  const providedPaths: Partial<Record<ShopBoostUploadDatasetKey, string>> = {};

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return {
        ok: false,
        error: "Invalid request. Please submit as multipart/form-data.",
      };
    }

    questionnaire = parseQuestionnaire(formData.get("questionnaire"));

    for (const key of SHOP_BOOST_UPLOAD_DATASET_KEYS) {
      if (!mode.allowHistoryAndStaff && (key === "history" || key === "staff")) continue;
      const file = asFile(formData.get(`${key}File`));
      if (file) filesByDataset[key] = file;
    }

    const rawIntake = formData.get("intakeId");
    providedIntakeId = typeof rawIntake === "string" ? rawIntake : null;
  } else {
    const body = (await req.json().catch(() => null)) as unknown;
    if (isRecord(body)) {
      if ("questionnaire" in body) questionnaire = body["questionnaire"];
      if ("intakeId" in body) providedIntakeId = asString(body["intakeId"]);

      if (mode.allowProvidedPaths) {
        if ("uploadPaths" in body && isRecord(body["uploadPaths"])) {
          for (const key of SHOP_BOOST_UPLOAD_DATASET_KEYS) {
            if (!mode.allowHistoryAndStaff && (key === "history" || key === "staff")) continue;
            const maybePath = asString(body["uploadPaths"][key]);
            if (maybePath) providedPaths[key] = maybePath;
          }
        } else {
          const legacy: Partial<Record<ShopBoostUploadDatasetKey, string | null>> = {
            customers: asString(body["customersPath"]),
            vehicles: asString(body["vehiclesPath"]),
            parts: asString(body["partsPath"]),
            history: mode.allowHistoryAndStaff ? asString(body["historyPath"]) : null,
            staff: mode.allowHistoryAndStaff ? asString(body["staffPath"]) : null,
          };
          for (const [key, value] of Object.entries(legacy) as Array<[ShopBoostUploadDatasetKey, string | null]>) {
            if (value) providedPaths[key] = value;
          }
        }
      }
    }
  }

  if (providedIntakeId && !UUID_RE.test(providedIntakeId)) {
    return { ok: false, error: "Invalid intakeId format (must be UUID)." };
  }

  const intakeId =
    providedIntakeId && UUID_RE.test(providedIntakeId) ? providedIntakeId : randomUUID();

  const uploadIfPresent = async (
    kind: ShopBoostUploadDatasetKey,
    file: File | undefined,
  ): Promise<string | null> => {
    if (!file) return null;

    const safeName = safeFileName(file.name || `${kind}.csv`);
    // ✅ canonical bucket path
    const path = `shops/${shopId}/${intakeId}/${kind}-${safeName}`;

    const { error: uploadErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "text/csv",
    });

    if (uploadErr) throw new Error(`Failed to upload ${kind}: ${uploadErr.message}`);
    return path;
  };

  const uploadedPathEntries = await Promise.all(
    SHOP_BOOST_UPLOAD_DATASET_KEYS.map(async (key) => [key, await uploadIfPresent(key, filesByDataset[key])] as const),
  );
  const uploadedPaths = Object.fromEntries(uploadedPathEntries) as Partial<
    Record<ShopBoostUploadDatasetKey, string | null>
  >;
  const noUploads = Object.values(filesByDataset).length === 0;
  const jsonProvidedAny = Object.values(providedPaths).some(Boolean);

  // ✅ fallback to latest intake paths when re-running with no uploads and no provided paths
  let fallbackPaths: Partial<Record<ShopBoostUploadDatasetKey, string | null>> = {};

  if (noUploads && !jsonProvidedAny) {
    const { data: latestIntake } = await supabaseAdmin
      .from("shop_boost_intakes")
      .select("customers_file_path, vehicles_file_path, parts_file_path, history_file_path, staff_file_path, intake_basics")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        customers_file_path: string | null;
        vehicles_file_path: string | null;
        parts_file_path: string | null;
        history_file_path: string | null;
        staff_file_path: string | null;
        intake_basics: unknown;
      }>();

    const intakeBasics = isRecord(latestIntake?.intake_basics) ? latestIntake.intake_basics : {};
    const existingManifest = isRecord(intakeBasics.uploadManifest)
      ? (intakeBasics.uploadManifest as Record<string, unknown>)
      : {};
    fallbackPaths = {
      customers: latestIntake?.customers_file_path ?? null,
      vehicles: latestIntake?.vehicles_file_path ?? null,
      parts: latestIntake?.parts_file_path ?? null,
      history: latestIntake?.history_file_path ?? null,
      staff: latestIntake?.staff_file_path ?? null,
    };
    for (const key of SHOP_BOOST_UPLOAD_DATASET_KEYS) {
      const manifestEntry = existingManifest[key];
      const fromManifest = isRecord(manifestEntry) ? asString(manifestEntry.path) : null;
      if (fromManifest) fallbackPaths[key] = fromManifest;
    }
  }

  const finalPaths = Object.fromEntries(
    SHOP_BOOST_UPLOAD_DATASET_KEYS.map((key) => [
      key,
      uploadedPaths[key] ?? providedPaths[key] ?? fallbackPaths[key] ?? null,
    ]),
  ) as Record<ShopBoostUploadDatasetKey, string | null>;

  // ✅ normalize legacy paths to canonical before enforcing + inserting
  const normalizedPaths = Object.fromEntries(
    Object.entries(finalPaths).map(([key, path]) => [key, normalizeShopPath(shopId, path)]),
  ) as Record<ShopBoostUploadDatasetKey, string | null>;

  // ✅ enforce shop-scoped paths for any provided/fallback content
  if (
    Object.values(normalizedPaths).some((path) => !isShopScopedPath(shopId, path))
  ) {
    return { ok: false, error: "Invalid file path (must start with shops/<shopId>/)." };
  }

  if (!Object.values(normalizedPaths).some(Boolean)) {
    return {
      ok: false,
      error: "No uploads found and no previous intake files exist yet. Upload at least one CSV first.",
    };
  }

  const uploadManifest = SHOP_BOOST_UPLOAD_DATASETS.reduce((acc, dataset) => {
    const key = dataset.key;
    const path = normalizedPaths[key];
    if (!path) return acc;
    const sourceFile = filesByDataset[key];
    acc[key] = {
      dataset: key,
      path,
      fileName: sourceFile?.name ?? null,
      contentType: sourceFile?.type ?? null,
      sizeBytes: sourceFile?.size ?? null,
      target: dataset.target,
      importMode: dataset.importMode,
    } satisfies UploadManifestEntry;
    return acc;
  }, {} as Record<ShopBoostUploadDatasetKey, UploadManifestEntry>);

  const intakeInsert: DB["public"]["Tables"]["shop_boost_intakes"]["Insert"] = {
    id: intakeId,
    shop_id: shopId,
    questionnaire:
      questionnaire as DB["public"]["Tables"]["shop_boost_intakes"]["Insert"]["questionnaire"],
    customers_file_path: normalizedPaths.customers,
    vehicles_file_path: normalizedPaths.vehicles,
    parts_file_path: normalizedPaths.parts,
    history_file_path: mode.allowHistoryAndStaff ? normalizedPaths.history : null,
    staff_file_path: mode.allowHistoryAndStaff ? normalizedPaths.staff : null,
    intake_basics: {
      uploadManifest,
    } as DB["public"]["Tables"]["shop_boost_intakes"]["Insert"]["intake_basics"],
    status: "pending",
  };

  const { error: intakeErr } = await supabaseAdmin.from("shop_boost_intakes").insert(intakeInsert);

  if (intakeErr) {
    return { ok: false, error: `Failed to create intake: ${intakeErr.message}` };
  }

  await updateIntakeProgress({
    intakeId,
    status: "queued",
    currentStep: "upload_received",
    progressPercent: 5,
    patch: { startedAt: new Date().toISOString(), lastError: null },
  });

  try {
    const run = await ensureRun({
      shopId,
      intakeId,
      triggerSource: "api",
      createdBy: user.id,
    });

    if (run?.id) {
      await seedRunJobs({
        runId: run.id,
        shopId,
        intakeId,
      });

      const { data: row } = await supabaseAdmin
        .from("shop_boost_intakes")
        .select("intake_basics")
        .eq("id", intakeId)
        .maybeSingle<{ intake_basics: unknown }>();

      const existingBasics = isRecord(row?.intake_basics) ? row.intake_basics : {};
      await supabaseAdmin
        .from("shop_boost_intakes")
        .update({
          intake_basics: ({
            ...existingBasics,
            orchestrator: {
              run_id: run.id,
              state: run.state,
              activation_status: run.activation_status,
              activation_blockers: run.activation_blockers ?? [],
            },
          } as unknown) as DB["public"]["Tables"]["shop_boost_intakes"]["Update"]["intake_basics"],
        })
        .eq("id", intakeId);
    }
  } catch (error) {
    console.error("[shop-boost/orchestrator] ensure+seed on intake run failed", {
      shopId,
      intakeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (mode.deferProcessing) {
    return {
      ok: true,
      queued: true,
      shopId,
      intakeId,
      snapshot: null,
      importSummary: {
        customersImported: 0,
        vehiclesImported: 0,
        workOrdersImported: 0,
        workOrderLinesImported: 0,
        invoicesImported: 0,
        partsImported: 0,
        linkageSummary: {
          linked: { vehiclesCustomerId: 0, workOrdersCustomerId: 0, workOrdersVehicleId: 0, invoicesCustomerId: 0 },
          unresolved: { vehiclesCustomerId: 0, workOrdersCustomerId: 0, workOrdersVehicleId: 0, invoicesCustomerId: 0 },
        },
        shopBuildSummary: {
          menuItemsCreated: 0,
          inspectionTemplatesCreated: 0,
          linkedMenuToInspection: 0,
          menuSuggestions: 0,
          inspectionSuggestions: 0,
        },
        canonicalMaterialization: {
          expected: { customers: 0, vehicles: 0, workOrders: 0, invoices: 0, staff: 0 },
          actual: { customers: 0, vehicles: 0, workOrders: 0, invoices: 0, staffSuggestions: 0, staffCandidates: 0 },
          gaps: { missingVehicles: false, missingWorkOrders: false, missingInvoices: false, missingStaff: false },
          status: "ok",
        },
        rowResults: {
          totalRows: 0,
          processedRows: 0,
          successCount: 0,
          reviewCount: 0,
          failedCount: 0,
          byDomain: {},
        },
        completionState: "COMPLETED_CLEAN",
      },
      shopBuildSummary: {
        menuItemsCreated: 0,
        inspectionTemplatesCreated: 0,
        linkedMenuToInspection: 0,
        menuSuggestions: 0,
        inspectionSuggestions: 0,
      },
      onboardingOptimization: { summary: null, nextActions: [] },
    };
  }

  const snapshot = await buildShopBoostProfile({ shopId, intakeId });
  if (!snapshot) return { ok: false, error: "AI analysis failed. Try different exports." };

  let importSummary: ShopBoostImportSummary = {
    customersImported: 0,
    vehiclesImported: 0,
    workOrdersImported: 0,
    workOrderLinesImported: 0,
    invoicesImported: 0,
    partsImported: 0,
    linkageSummary: {
      linked: {
        vehiclesCustomerId: 0,
        workOrdersCustomerId: 0,
        workOrdersVehicleId: 0,
        invoicesCustomerId: 0,
      },
      unresolved: {
        vehiclesCustomerId: 0,
        workOrdersCustomerId: 0,
        workOrdersVehicleId: 0,
        invoicesCustomerId: 0,
      },
    },
    shopBuildSummary: {
      menuItemsCreated: 0,
      inspectionTemplatesCreated: 0,
      linkedMenuToInspection: 0,
      menuSuggestions: 0,
      inspectionSuggestions: 0,
    },
    canonicalMaterialization: {
      expected: { customers: 0, vehicles: 0, workOrders: 0, invoices: 0, staff: 0 },
      actual: { customers: 0, vehicles: 0, workOrders: 0, invoices: 0, staffSuggestions: 0, staffCandidates: 0 },
      gaps: { missingVehicles: false, missingWorkOrders: false, missingInvoices: false, missingStaff: false },
      status: "ok",
    },
    rowResults: {
      totalRows: 0,
      processedRows: 0,
      successCount: 0,
      reviewCount: 0,
      failedCount: 0,
      byDomain: {},
    },
    completionState: "COMPLETED_CLEAN",
  };

  if (mode.runImport) {
    // 🔒 do NOT allow staff auth creation from intake runs
    importSummary = await runShopBoostImport({
      shopId,
      intakeId,
      options: { createStaffUsers: false },
    });
  }

  let onboardingOptimization: {
    summary: {
      totalOpportunities: number;
      criticalCount: number;
      highCount: number;
      potentialMonthlyValue: number;
      dataFreshness: "fresh" | "stale";
      lastAnalyzedAt: string;
    } | null;
    nextActions: OnboardingOptimizationAction[];
  } = {
    summary: null,
    nextActions: [],
  };

  try {
    const optimizationOutput = await buildOptimizationOpportunities({
      supabase: supabaseAdmin,
      shopId,
      limit: 10,
      lookbackDays: 365,
    });

    onboardingOptimization = {
      summary: optimizationOutput.summary,
      nextActions: selectTopOnboardingOptimizationActions(optimizationOutput, 5),
    };
  } catch (error) {
    console.warn("[shop-boost/intake] optimization handoff skipped", error);
  }

  return {
    ok: true,
    shopId,
    intakeId,
    snapshot,
    importSummary,
    shopBuildSummary: importSummary.shopBuildSummary,
    onboardingOptimization,
  };
}
