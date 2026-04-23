import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { runShopBoostImport } from "@/features/integrations/imports/runFullImport";
import { updateIntakeProgress } from "@/features/integrations/shopBoost/status";
import {
  completeAttempt,
  createAttempt,
  ensureRun,
  evaluateActivationRules,
  markRunRetryable,
  markRunRunning,
  markRunSucceeded,
  seedRunJobs,
  setJobResult,
  setJobRunning,
} from "@/features/integrations/shopBoost/orchestrator";

type DB = Database;

type JobType = "profile" | "materialize" | "verify" | "activate";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asBoolArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
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
  const jobIdByType: Partial<Record<JobType, string>> = {};

  try {
    const run = await ensureRun({
      shopId,
      intakeId: intake.id,
      triggerSource: "api",
      createdBy: user.id,
    });
    runId = run?.id ?? null;

    if (runId) {
      const jobs = await seedRunJobs({ runId, shopId, intakeId: intake.id });
      for (const job of jobs) {
        const key = job.job_type as JobType;
        if (key === "profile" || key === "materialize" || key === "verify" || key === "activate") {
          jobIdByType[key] = job.id;
        }
      }
      await markRunRunning(runId);
    }
  } catch (error) {
    console.error("[shop-boost/orchestrator] process bootstrap failed", {
      shopId,
      intakeId: intake.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await updateIntakeProgress({
    intakeId: intake.id,
    status: "processing",
    currentStep: "parsing_files",
    progressPercent: 15,
    patch: { startedAt: new Date().toISOString(), lastError: null },
  });

  const errors: string[] = [];

  const withAttempt = async <T,>(jobType: JobType, fn: () => Promise<T>): Promise<T> => {
    if (!runId || !jobIdByType[jobType]) return fn();

    const workerId = `api-shop-boost-process:${jobType}`;
    await setJobRunning({ runId, jobType });
    const attemptId = await createAttempt({
      jobId: jobIdByType[jobType] as string,
      runId,
      workerId,
    });

    try {
      const result = await fn();
      if (attemptId) {
        await completeAttempt({
          attemptId,
          status: "succeeded",
          metrics: { completed_at: new Date().toISOString() },
        });
      }
      return result;
    } catch (error) {
      if (attemptId) {
        await completeAttempt({
          attemptId,
          status: "failed",
          errorCode: "PROCESS_STEP_FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
          logs: [
            {
              at: new Date().toISOString(),
              step: jobType,
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        });
      }
      throw error;
    }
  };

  try {
    await updateIntakeProgress({ intakeId: intake.id, currentStep: "generating_suggestions", progressPercent: 35 });

    const snapshot = await withAttempt("profile", async () => {
      const out = await buildShopBoostProfile({ shopId, intakeId: intake.id });
      if (runId) {
        await setJobResult({
          runId,
          jobType: "profile",
          status: "succeeded",
          result: {
            has_snapshot: Boolean(out),
          },
        });
      }
      return out;
    });

    if (!snapshot) errors.push("AI snapshot generation failed; import continued.");

    await updateIntakeProgress({ intakeId: intake.id, currentStep: "materializing_operating_layer", progressPercent: 60 });

    const importSummary = await withAttempt("materialize", async () => {
      const out = await runShopBoostImport({ shopId, intakeId: intake.id, options: { createStaffUsers: false } });
      if (runId) {
        await setJobResult({
          runId,
          jobType: "materialize",
          status: "succeeded",
          result: {
            completionState: out.completionState,
            rowResults: out.rowResults,
            canonicalMaterialization: out.canonicalMaterialization,
          },
        });
      }
      return out;
    });

    const integrityErrors = asBoolArray(importSummary.rowResults.integrityErrors);
    const totalRows = Number(importSummary.rowResults.totalRows ?? 0);
    const pendingReviewCount = Number(importSummary.rowResults.reviewCount ?? 0);
    const failedCount = Number(importSummary.rowResults.failedCount ?? 0);

    const activationEval = await withAttempt("verify", async () => {
      const out = await evaluateActivationRules(shopId, {
        completionState: importSummary.completionState,
        integrityErrorCount: integrityErrors.length,
        pendingReviewCount,
        failedCount,
        totalRows,
        canonicalStatus: importSummary.canonicalMaterialization.status,
        canonicalGaps: importSummary.canonicalMaterialization.gaps,
        customersImported: importSummary.customersImported,
        vehiclesImported: importSummary.vehiclesImported,
      });

      if (runId) {
        await setJobResult({
          runId,
          jobType: "verify",
          status: "succeeded",
          result: {
            blockers: out.blockers,
            activationStatus: out.activationStatus,
            snapshot: out.snapshot,
          },
        });
      }
      return out;
    });

    await withAttempt("activate", async () => {
      if (runId) {
        await setJobResult({
          runId,
          jobType: "activate",
          status: "succeeded",
          result: {
            activationStatus: activationEval.activationStatus,
            blockers: activationEval.blockers,
          },
        });
      }
    });

    const completedStatus =
      importSummary.completionState === "PARTIAL_FAILURE" ||
      importSummary.completionState === "FAILED" ||
      importSummary.completionState === "NOT_READY" ||
      errors.length > 0
        ? "completed_with_errors"
        : "completed";

    const intakeRow = await admin
      .from("shop_boost_intakes")
      .select("intake_basics")
      .eq("id", intake.id)
      .maybeSingle<{ intake_basics: unknown }>();

    const intakeBasics = asRecord(intakeRow.data?.intake_basics);
    const orchestratorPatch = {
      run_id: runId,
      state: completedStatus,
      activation_status: activationEval.activationStatus,
      activation_blockers: activationEval.blockers,
      activation_snapshot: activationEval.snapshot,
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
        resultSummary: {
          customersImported: importSummary.customersImported,
          vehiclesImported: importSummary.vehiclesImported,
          partsImported: importSummary.partsImported,
          workOrdersImported: importSummary.workOrdersImported,
          invoicesImported: importSummary.invoicesImported,
          canonicalMaterialization: importSummary.canonicalMaterialization,
          linkageSummary: importSummary.linkageSummary,
          shopBuildSummary: importSummary.shopBuildSummary,
          partsPipeline: importSummary.partsPipeline ?? null,
          rowResults: importSummary.rowResults,
          completionState: importSummary.completionState,
          activation: {
            status: activationEval.activationStatus,
            blockers: activationEval.blockers,
            snapshot: activationEval.snapshot,
          },
        },
      },
    });

    if (runId) {
      await markRunSucceeded({
        runId,
        metrics: {
          completionState: importSummary.completionState,
          completedStatus,
          rowResults: importSummary.rowResults,
          canonicalMaterialization: importSummary.canonicalMaterialization,
        },
        activationSnapshot: activationEval.snapshot,
        activationStatus: activationEval.activationStatus,
        blockers: activationEval.blockers,
      });
    }

    return NextResponse.json({
      ok: true,
      intakeId: intake.id,
      status: completedStatus,
      orchestrator: runId
        ? {
            runId,
            activationStatus: activationEval.activationStatus,
            activationBlockers: activationEval.blockers,
          }
        : null,
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
