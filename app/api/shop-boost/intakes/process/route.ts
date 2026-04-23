import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { runShopBoostImport, type ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";
import { updateIntakeProgress } from "@/features/integrations/shopBoost/status";
import {
  claimNextRunnableJob,
  completeAttempt,
  computeRetryAfter,
  createAttempt,
  ensureRun,
  evaluateActivationRules,
  getJobAttemptCount,
  getLatestRunAttemptSummary,
  getRunJobs,
  markClaimedJobResult,
  markRunRetryable,
  markRunRunning,
  markRunSucceeded,
  seedRunJobs,
  summarizeRunJobs,
  type ActivationEvaluationResult,
} from "@/features/integrations/shopBoost/orchestrator";

type DB = Database;

const MAX_EXECUTOR_PASSES = 12;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asBoolArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
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

    for (let pass = 0; pass < MAX_EXECUTOR_PASSES; pass += 1) {
      const workerId = `api-shop-boost-process:${runId}:pass-${pass + 1}`;
      const claimed = await claimNextRunnableJob({ runId, workerId });
      if (!claimed) break;

      const attemptId = await createAttempt({
        jobId: claimed.id,
        runId,
        workerId,
      });

      try {
        if (claimed.jobType === "profile") {
          await markRunRunning(runId, "profiling");
          await updateIntakeProgress({ intakeId: intake.id, currentStep: "generating_suggestions", progressPercent: 35 });
          const snapshot = await buildShopBoostProfile({ shopId, intakeId: intake.id });
          if (!snapshot) {
            errors.push("AI snapshot generation failed; import continued.");
          }
          await markClaimedJobResult({
            jobId: claimed.id,
            status: "succeeded",
            result: { has_snapshot: Boolean(snapshot) },
          });
        }

        if (claimed.jobType === "materialize") {
          await markRunRunning(runId, "materialize");
          await updateIntakeProgress({ intakeId: intake.id, currentStep: "materializing_operating_layer", progressPercent: 60 });
          latestImportSummary = await runShopBoostImport({ shopId, intakeId: intake.id, options: { createStaffUsers: false } });
          await markClaimedJobResult({
            jobId: claimed.id,
            status: "succeeded",
            result: {
              completionState: latestImportSummary.completionState,
              rowResults: latestImportSummary.rowResults,
              canonicalMaterialization: latestImportSummary.canonicalMaterialization,
              customersImported: latestImportSummary.customersImported,
              vehiclesImported: latestImportSummary.vehiclesImported,
            },
          });
        }

        if (claimed.jobType === "verify") {
          await markRunRunning(runId, "verify");

          if (!latestImportSummary) {
            const jobs = await getRunJobs(runId);
            const materialize = jobs.find((job) => job.job_type === "materialize" && String(job.domain ?? "global") === "global");
            latestImportSummary = asImportSummary(asRecord(materialize?.result));
          }

          if (!latestImportSummary) {
            await markClaimedJobResult({
              jobId: claimed.id,
              status: "blocked_manual",
              errorCode: "VERIFY_INPUT_MISSING",
              errorMessage: "Materialize result is missing for verify job.",
            });
          } else {
            const integrityErrors = asBoolArray(latestImportSummary.rowResults.integrityErrors);
            const totalRows = Number(latestImportSummary.rowResults.totalRows ?? 0);
            const pendingReviewCount = Number(latestImportSummary.rowResults.reviewCount ?? 0);
            const failedCount = Number(latestImportSummary.rowResults.failedCount ?? 0);

            latestActivationEval = await evaluateActivationRules(shopId, {
              completionState: latestImportSummary.completionState,
              integrityErrorCount: integrityErrors.length,
              pendingReviewCount,
              failedCount,
              totalRows,
              canonicalStatus: latestImportSummary.canonicalMaterialization.status,
              canonicalGaps: latestImportSummary.canonicalMaterialization.gaps,
              customersImported: latestImportSummary.customersImported,
              vehiclesImported: latestImportSummary.vehiclesImported,
            });

            await markClaimedJobResult({
              jobId: claimed.id,
              status: "succeeded",
              result: {
                blockers: latestActivationEval.blockers,
                activationStatus: latestActivationEval.activationStatus,
                snapshot: latestActivationEval.snapshot,
              },
            });
          }
        }

        if (claimed.jobType === "activate") {
          await markRunRunning(runId, "activate");

          if (!latestActivationEval) {
            const jobs = await getRunJobs(runId);
            const verify = jobs.find((job) => job.job_type === "verify" && String(job.domain ?? "global") === "global");
            const verifyResult = asRecord(verify?.result);
            const verifyStatus = String(verifyResult.activationStatus ?? verifyResult.activation_status ?? "blocked");
            latestActivationEval = {
              activationStatus: (verifyStatus as ActivationEvaluationResult["activationStatus"]) ?? "blocked",
              blockers: Array.isArray(verifyResult.blockers) ? verifyResult.blockers.map((v) => String(v)) : [],
              snapshot: asRecord(verifyResult.snapshot),
            };
          }

          await markClaimedJobResult({
            jobId: claimed.id,
            status:
              latestActivationEval.activationStatus === "blocked" || latestActivationEval.activationStatus === "not_eligible"
                ? "blocked_manual"
                : "succeeded",
            result: {
              activationStatus: latestActivationEval.activationStatus,
              blockers: latestActivationEval.blockers,
              snapshot: latestActivationEval.snapshot,
            },
          });
        }

        if (attemptId) {
          await completeAttempt({
            attemptId,
            status: "succeeded",
            metrics: { completed_at: new Date().toISOString(), jobType: claimed.jobType },
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const attempts = await getJobAttemptCount(claimed.id);
        const retryAfter = computeRetryAfter(attempts);

        await markClaimedJobResult({
          jobId: claimed.id,
          status: "retryable_failed",
          errorCode: "PROCESS_STEP_FAILED",
          errorMessage: msg,
          retryAfter,
        });

        if (attemptId) {
          await completeAttempt({
            attemptId,
            status: "failed",
            errorCode: "PROCESS_STEP_FAILED",
            errorMessage: msg,
            logs: [{ at: new Date().toISOString(), step: claimed.jobType, message: msg }],
          });
        }

        throw error;
      }
    }

    const jobs = await getRunJobs(runId);
    const materializeJob = jobs.find((job) => job.job_type === "materialize" && String(job.domain ?? "global") === "global");
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
      last_attempt: lastAttempt,
      last_error: lastError,
      runState: completedStatus,
      activationStatus: latestActivationEval.activationStatus,
      blockers: latestActivationEval.blockers,
      jobSummary,
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
