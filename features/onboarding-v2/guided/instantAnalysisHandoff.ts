import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";
import type { ShopBoostUploadDatasetKey } from "@/features/integrations/shopBoost/uploadDatasets";
import { GUIDED_ONBOARDING_STEPS } from "@/features/onboarding-v2/guided/steps";
import type { GuidedOnboardingStepKey } from "@/features/onboarding-v2/guided/types";

const DATASET_TO_GUIDED_STEP: Partial<Record<ShopBoostUploadDatasetKey, GuidedOnboardingStepKey>> = {
  customers: "customers",
  vehicles: "vehicles",
  history: "vehicle_history",
  invoices: "invoices",
  parts: "parts",
};

type DomainResult = {
  success: number;
  review: number;
  failed: number;
};

function emptyDomainResult(): DomainResult {
  return { success: 0, review: 0, failed: 0 };
}

function domainResult(
  summary: ShopBoostImportSummary | undefined,
  dataset: ShopBoostUploadDatasetKey,
): DomainResult {
  if (!summary) return emptyDomainResult();

  const candidates =
    dataset === "history"
      ? ["history", "work_order", "work_orders"]
      : dataset === "invoices"
        ? ["invoices", "invoice"]
        : dataset === "customers"
          ? ["customers", "customer"]
          : dataset === "vehicles"
            ? ["vehicles", "vehicle"]
            : dataset === "parts"
              ? ["parts", "part"]
              : [dataset];

  for (const key of candidates) {
    const result = summary.rowResults.byDomain[key];
    if (result) return result;
  }

  return emptyDomainResult();
}

function importedCount(
  summary: ShopBoostImportSummary | undefined,
  dataset: ShopBoostUploadDatasetKey,
): number {
  if (!summary) return 0;
  if (dataset === "customers") return summary.customersImported;
  if (dataset === "vehicles") return summary.vehiclesImported;
  if (dataset === "history") return summary.workOrdersImported;
  if (dataset === "invoices") return summary.invoicesImported;
  if (dataset === "parts") return summary.partsImported;
  return 0;
}

export async function mapInstantAnalysisToGuidedOnboarding(args: {
  shopId: string;
  userId: string;
  demoId: string;
  intakeId: string;
  uploadedDatasets: ShopBoostUploadDatasetKey[];
  importSummary?: ShopBoostImportSummary;
}): Promise<{ sessionId: string; redirectTo: string }> {
  const admin = createAdminSupabase();
  const now = new Date().toISOString();

  const { data: existingSession, error: existingSessionError } = await admin
    .from("guided_onboarding_sessions")
    .select("id")
    .eq("shop_id", args.shopId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingSessionError) throw new Error(existingSessionError.message);

  let sessionId = existingSession?.id ?? null;

  if (!sessionId) {
    const { data: createdSession, error: createSessionError } = await admin
      .from("guided_onboarding_sessions")
      .insert({
        shop_id: args.shopId,
        created_by: args.userId,
        status: "active",
        existing_system: "instant_shop_analysis",
        current_step_key: GUIDED_ONBOARDING_STEPS[0]?.key ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (createSessionError || !createdSession?.id) {
      throw new Error(createSessionError?.message ?? "Failed to create guided onboarding session.");
    }
    sessionId = createdSession.id;
  }

  const { data: existingSteps, error: existingStepsError } = await admin
    .from("guided_onboarding_steps")
    .select("step_key")
    .eq("shop_id", args.shopId)
    .eq("session_id", sessionId);

  if (existingStepsError) throw new Error(existingStepsError.message);

  const existingStepKeys = new Set((existingSteps ?? []).map((step) => step.step_key));
  const missingSteps = GUIDED_ONBOARDING_STEPS.filter((step) => !existingStepKeys.has(step.key));

  if (missingSteps.length > 0) {
    const { error: seedError } = await admin.from("guided_onboarding_steps").insert(
      missingSteps.map((step) => ({
        session_id: sessionId,
        shop_id: args.shopId,
        step_key: step.key,
        destination_path: step.destinationPath,
        title: step.title,
        question: step.question,
        description: step.shortDescription,
        highlight_key: step.highlightQuery?.highlight ?? step.key,
        status: "not_started",
        answer: {},
      })),
    );
    if (seedError) throw new Error(seedError.message);
  }

  const mappedDatasets = args.uploadedDatasets.flatMap((dataset) => {
    const stepKey = DATASET_TO_GUIDED_STEP[dataset];
    return stepKey ? [{ dataset, stepKey }] : [];
  });

  for (const { dataset, stepKey } of mappedDatasets) {
    const result = domainResult(args.importSummary, dataset);
    const { error: updateStepError } = await admin
      .from("guided_onboarding_steps")
      .update({
        status: "completed",
        answer: {
          source: "instant_shop_analysis",
          demoId: args.demoId,
          intakeId: args.intakeId,
          dataset,
          importedCount: importedCount(args.importSummary, dataset),
          successCount: result.success,
          reviewCount: result.review,
          failedCount: result.failed,
          reviewPhasePending: result.review > 0 || result.failed > 0,
        },
        started_at: now,
        completed_at: now,
        skipped_at: null,
        updated_at: now,
      })
      .eq("shop_id", args.shopId)
      .eq("session_id", sessionId)
      .eq("step_key", stepKey);

    if (updateStepError) throw new Error(updateStepError.message);
  }

  const { data: finalSteps, error: finalStepsError } = await admin
    .from("guided_onboarding_steps")
    .select("step_key,status")
    .eq("shop_id", args.shopId)
    .eq("session_id", sessionId);

  if (finalStepsError) throw new Error(finalStepsError.message);

  const statusByStep = new Map((finalSteps ?? []).map((step) => [step.step_key, step.status]));
  const nextStep =
    GUIDED_ONBOARDING_STEPS.find((step) => {
      const status = statusByStep.get(step.key);
      return status !== "completed" && status !== "skipped";
    })?.key ?? null;

  const { error: updateSessionError } = await admin
    .from("guided_onboarding_sessions")
    .update({
      existing_system: "instant_shop_analysis",
      current_step_key: nextStep,
      status: nextStep ? "active" : "completed",
      completed_at: nextStep ? null : now,
      updated_at: now,
    })
    .eq("id", sessionId)
    .eq("shop_id", args.shopId);

  if (updateSessionError) throw new Error(updateSessionError.message);

  const { error: eventError } = await admin.from("guided_onboarding_events").insert({
    session_id: sessionId,
    shop_id: args.shopId,
    step_key: nextStep,
    event_type: "instant_analysis_mapped",
    payload: {
      demoId: args.demoId,
      intakeId: args.intakeId,
      uploadedDatasets: mappedDatasets.map((item) => item.dataset),
      completionState: args.importSummary?.completionState ?? "unknown",
      reviewPhasePending:
        (args.importSummary?.rowResults.reviewCount ?? 0) > 0 ||
        (args.importSummary?.rowResults.failedCount ?? 0) > 0,
    },
    created_by: args.userId,
  });

  if (eventError) throw new Error(eventError.message);

  return {
    sessionId,
    redirectTo: `/dashboard/onboarding-v2/${sessionId}`,
  };
}
