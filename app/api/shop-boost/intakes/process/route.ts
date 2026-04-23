import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { type ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";
import { updateIntakeProgress } from "@/features/integrations/shopBoost/status";
import {
  ensureRun,
  getLatestRunAttemptSummary,
  getRunJobs,
  markRunRetryable,
  markRunRunning,
  markRunSucceeded,
  seedRunJobs,
  summarizeRunJobs,
  summarizeRunJobsDetailed,
  type ActivationEvaluationResult,
} from "@/features/integrations/shopBoost/orchestrator";
import { executeShopBoostRun } from "@/features/integrations/shopBoost/orchestrator/executeRun";

type DB = Database;

const MAX_EXECUTOR_PASSES = 20;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asImportSummary(value: unknown): ShopBoostImportSummary | null {
  const rec = asRecord(value);
  if (!Object.keys(rec).length) return null;
  return rec as unknown as ShopBoostImportSummary;
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

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  const shopId = profile?.shop_id;
  if (!shopId) {
    return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { intakeId?: string };
  const admin = createAdminSupabase();

  const query = admin
    .from("shop_boost_intakes")
    .select("id,status")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(1);

  const intakeRes = body.intakeId
    ? await admin.from("shop_boost_intakes").select("id,status").eq("shop_id", shopId).eq("id", body.intakeId).maybeSingle()
    : await query.maybeSingle();

  if (intakeRes.error) return NextResponse.json({ ok: false, error: intakeRes.error.message }, { status: 500 });
  const intake = intakeRes.data;
  if (!intake?.id) return NextResponse.json({ ok: false, error: "No intake found." }, { status: 404 });

  if (intake.status === "processing") {
    return NextResponse.json({ ok: true, intakeId: intake.id, alreadyRunning: true });
  }

  let runId: string | null = null;
  let latestImportSummary: ShopBoostImportSummary | null = null;
  let latestActivationEval: ActivationEvaluationResult | null = null;
  const errors: string[] = [];

  try {
    const run = await ensureRun({
      shopId,
      intakeId: intake.id,
      triggerSource: "api",
      createdBy: user.id,
    });
    runId = run?.id ?? null;

    if (!runId) {
      throw new Error("Failed to initialize orchestrator run.");
    }

    await seedRunJobs({ runId, shopId, intakeId: intake.id });
    await markRunRunning(runId, "profiling");

    await updateIntakeProgress({
      intakeId: intake.id,
      status: "processing",
      currentStep: "parsing_files",
      progressPercent: 15,
      patch: { startedAt: new Date().toISOString(), lastError: null },
    });

    await updateIntakeProgress({ intakeId: intake.id, currentStep: "generating_suggestions", progressPercent: 35 });
    await updateIntakeProgress({ intakeId: intake.id, currentStep: "materializing_operating_layer", progressPercent: 60 });
    const execution = await executeShopBoostRun({
      runId,
      shopId,
      intakeId: intake.id,
      maxPasses: MAX_EXECUTOR_PASSES,
      workerPrefix: "api-shop-boost-process",
      allowImport: true,
    });
    latestImportSummary = execution.latestImportSummary;
    latestActivationEval = execution.latestActivationEval;
    errors.push(...execution.errors);

    const jobs = await getRunJobs(runId);
    const materializeJob = jobs.find((job) => job.job_type === "materialize" && String(job.domain ?? "global") === "customers");
    const verifyJob = jobs.find((job) => job.job_type === "verify" && String(job.domain ?? "global") === "global");

    if (!latestImportSummary) {
      latestImportSummary = asImportSummary(asRecord(materializeJob?.result));
    }

    if (!latestActivationEval) {
      const verifyResult = asRecord(verifyJob?.result);
      latestActivationEval = {
        activationStatus: String(verifyResult.activationStatus ?? "blocked") as ActivationEvaluationResult["activationStatus"],
        blockers: Array.isArray(verifyResult.blockers) ? verifyResult.blockers.map((v) => String(v)) : [],
        snapshot: asRecord(verifyResult.snapshot),
      };
    }

    const intakeRow = await admin
      .from("shop_boost_intakes")
      .select("intake_basics")
      .eq("id", intake.id)
      .maybeSingle<{ intake_basics: unknown }>();

    const intakeBasics = asRecord(intakeRow.data?.intake_basics);
    const jobSummary = await summarizeRunJobs(runId);
    const jobSummaryDetailed = await summarizeRunJobsDetailed(runId);
    const lastAttempt = await getLatestRunAttemptSummary(runId);
    const lastError =
      lastAttempt?.status === "failed" || lastAttempt?.errorMessage
        ? {
            code: lastAttempt?.errorCode ?? null,
            message: lastAttempt?.errorMessage ?? null,
          }
        : null;

    const completedStatus =
      !latestImportSummary ||
      latestImportSummary.completionState === "PARTIAL_FAILURE" ||
      latestImportSummary.completionState === "FAILED" ||
      latestImportSummary.completionState === "NOT_READY" ||
      errors.length > 0
        ? "completed_with_errors"
        : "completed";

    const orchestratorPatch = {
      run_id: runId,
      state: completedStatus,
      activation_status: latestActivationEval.activationStatus,
      activation_blockers: latestActivationEval.blockers,
      activation_snapshot: latestActivationEval.snapshot,
      job_summary: jobSummary,
      job_summary_detailed: jobSummaryDetailed,
      last_attempt: lastAttempt,
      last_error: lastError,
      runState: completedStatus,
      activationStatus: latestActivationEval.activationStatus,
      blockers: latestActivationEval.blockers,
      jobSummary,
      jobSummaryDetailed,
      lastAttempt,
      lastError,
      updated_at: new Date().toISOString(),
    };

    await admin
      .from("shop_boost_intakes")
      .update({
        intake_basics: {
          ...intakeBasics,
          orchestrator: {
            ...asRecord(intakeBasics.orchestrator),
            ...orchestratorPatch,
          },
        } as DB["public"]["Tables"]["shop_boost_intakes"]["Update"]["intake_basics"],
      })
      .eq("id", intake.id);

    await updateIntakeProgress({
      intakeId: intake.id,
      status: completedStatus,
      currentStep: "completed",
      progressPercent: 100,
      patch: {
        completedAt: new Date().toISOString(),
        failedAt: null,
        lastError: errors.join(" ") || null,
        orchestrator: orchestratorPatch,
        resultSummary: latestImportSummary
          ? {
              customersImported: latestImportSummary.customersImported,
              vehiclesImported: latestImportSummary.vehiclesImported,
              partsImported: latestImportSummary.partsImported,
              workOrdersImported: latestImportSummary.workOrdersImported,
              invoicesImported: latestImportSummary.invoicesImported,
              canonicalMaterialization: latestImportSummary.canonicalMaterialization,
              linkageSummary: latestImportSummary.linkageSummary,
              shopBuildSummary: latestImportSummary.shopBuildSummary,
              partsPipeline: latestImportSummary.partsPipeline ?? null,
              rowResults: latestImportSummary.rowResults,
              completionState: latestImportSummary.completionState,
              activation: {
                status: latestActivationEval.activationStatus,
                blockers: latestActivationEval.blockers,
                snapshot: latestActivationEval.snapshot,
              },
            }
          : null,
      },
    });

    if (latestImportSummary) {
      await markRunSucceeded({
        runId,
        metrics: {
          completionState: latestImportSummary.completionState,
          completedStatus,
          rowResults: latestImportSummary.rowResults,
          canonicalMaterialization: latestImportSummary.canonicalMaterialization,
        },
        activationSnapshot: latestActivationEval.snapshot,
        activationStatus: latestActivationEval.activationStatus,
        blockers: latestActivationEval.blockers,
      });
    }

    return NextResponse.json({
      ok: true,
      intakeId: intake.id,
      status: completedStatus,
      orchestrator: {
        runId,
        activationStatus: latestActivationEval.activationStatus,
        activationBlockers: latestActivationEval.blockers,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to process intake";

    await updateIntakeProgress({
      intakeId: intake.id,
      status: "failed",
      currentStep: "error",
      patch: {
        failedAt: new Date().toISOString(),
        lastError: msg,
      },
    });

    if (runId) {
      const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await markRunRetryable(runId, "PROCESS_FAILED", msg, retryAt);
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
