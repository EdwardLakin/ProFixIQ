// app/api/internal/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { runShopBoostImport, type ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";
import {
  claimNextRunnableJob,
  completeAttempt,
  computeRetryAfter,
  createAttempt,
  ensureRun,
  evaluateActivationRules,
  getJobAttemptCount,
  getRunJobs,
  markClaimedJobResult,
  markRunRunning,
  seedRunJobs,
  type ActivationEvaluationResult,
} from "@/features/integrations/shopBoost/orchestrator";

const SHOP_BOOST_SECRET = process.env.SHOP_BOOST_SECRET ?? "";

type RunBody = {
  shopId?: string;
  intakeId?: string;
  runImport?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asImportSummary(value: unknown): ShopBoostImportSummary | null {
  const rec = asRecord(value);
  return Object.keys(rec).length ? (rec as unknown as ShopBoostImportSummary) : null;
}

export async function POST(req: NextRequest) {
  if (!SHOP_BOOST_SECRET) {
    return NextResponse.json({ ok: false, error: "SHOP_BOOST_SECRET not configured" }, { status: 500 });
  }

  const headerSecret = req.headers.get("x-shop-boost-secret") ?? req.headers.get("X-Shop-Boost-Secret");

  if (!headerSecret || headerSecret !== SHOP_BOOST_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RunBody | null;

  if (!body?.shopId) {
    return NextResponse.json({ ok: false, error: "shopId is required" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const intakeRes = body.intakeId
    ? await admin.from("shop_boost_intakes").select("id").eq("shop_id", body.shopId).eq("id", body.intakeId).maybeSingle<{ id: string }>()
    : await admin
        .from("shop_boost_intakes")
        .select("id")
        .eq("shop_id", body.shopId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

  if (intakeRes.error) return NextResponse.json({ ok: false, error: intakeRes.error.message }, { status: 500 });
  if (!intakeRes.data?.id) return NextResponse.json({ ok: false, error: "No intake found" }, { status: 404 });

  const intakeId = intakeRes.data.id;
  const run = await ensureRun({ shopId: body.shopId, intakeId, triggerSource: "cron" });
  if (!run?.id) return NextResponse.json({ ok: false, error: "Failed to initialize run" }, { status: 500 });

  await seedRunJobs({ runId: run.id, shopId: body.shopId, intakeId });
  await markRunRunning(run.id, "profiling");

  let importSummary: ShopBoostImportSummary | null = null;
  let activationEval: ActivationEvaluationResult | null = null;
  const allowImport = body.runImport === true;

  for (let pass = 0; pass < 8; pass += 1) {
    const claimed = await claimNextRunnableJob({ runId: run.id, workerId: `internal-shop-boost:${run.id}:pass-${pass + 1}` });
    if (!claimed) break;
    if (!allowImport && claimed.jobType !== "profile") break;

    const attemptId = await createAttempt({
      jobId: claimed.id,
      runId: run.id,
      workerId: `internal-shop-boost:${claimed.jobType}`,
    });

    try {
      if (claimed.jobType === "profile") {
        const snapshot = await buildShopBoostProfile({ shopId: body.shopId, intakeId });
        await markClaimedJobResult({
          jobId: claimed.id,
          status: "succeeded",
          result: { has_snapshot: Boolean(snapshot) },
        });
      }

      if (claimed.jobType === "materialize") {
        importSummary = await runShopBoostImport({ shopId: body.shopId, intakeId, options: { createStaffUsers: false } });
        await markClaimedJobResult({
          jobId: claimed.id,
          status: "succeeded",
          result: {
            completionState: importSummary.completionState,
            rowResults: importSummary.rowResults,
            canonicalMaterialization: importSummary.canonicalMaterialization,
            customersImported: importSummary.customersImported,
            vehiclesImported: importSummary.vehiclesImported,
          },
        });
      }

      if (claimed.jobType === "verify") {
        if (!importSummary) {
          const jobs = await getRunJobs(run.id);
          const materialize = jobs.find((job) => job.job_type === "materialize" && String(job.domain ?? "global") === "global");
          importSummary = asImportSummary(materialize?.result);
        }

        if (!importSummary) {
          await markClaimedJobResult({
            jobId: claimed.id,
            status: "blocked_manual",
            errorCode: "VERIFY_INPUT_MISSING",
            errorMessage: "Materialize result is missing for verify job.",
          });
        } else {
          const integrityErrors = Array.isArray(importSummary.rowResults.integrityErrors)
            ? importSummary.rowResults.integrityErrors.map((row) => String(row))
            : [];

          activationEval = await evaluateActivationRules(body.shopId, {
            completionState: importSummary.completionState,
            integrityErrorCount: integrityErrors.length,
            pendingReviewCount: Number(importSummary.rowResults.reviewCount ?? 0),
            failedCount: Number(importSummary.rowResults.failedCount ?? 0),
            totalRows: Number(importSummary.rowResults.totalRows ?? 0),
            canonicalStatus: importSummary.canonicalMaterialization.status,
            canonicalGaps: importSummary.canonicalMaterialization.gaps,
            customersImported: importSummary.customersImported,
            vehiclesImported: importSummary.vehiclesImported,
          });

          await markClaimedJobResult({
            jobId: claimed.id,
            status: "succeeded",
            result: {
              blockers: activationEval.blockers,
              activationStatus: activationEval.activationStatus,
              snapshot: activationEval.snapshot,
            },
          });
        }
      }

      if (claimed.jobType === "activate") {
        if (!activationEval) {
          const jobs = await getRunJobs(run.id);
          const verify = jobs.find((job) => job.job_type === "verify" && String(job.domain ?? "global") === "global");
          const verifyResult = asRecord(verify?.result);
          activationEval = {
            activationStatus: String(verifyResult.activationStatus ?? "blocked") as ActivationEvaluationResult["activationStatus"],
            blockers: Array.isArray(verifyResult.blockers) ? verifyResult.blockers.map((v) => String(v)) : [],
            snapshot: asRecord(verifyResult.snapshot),
          };
        }

        await markClaimedJobResult({
          jobId: claimed.id,
          status:
            activationEval.activationStatus === "blocked" || activationEval.activationStatus === "not_eligible"
              ? "blocked_manual"
              : "succeeded",
          result: {
            activationStatus: activationEval.activationStatus,
            blockers: activationEval.blockers,
            snapshot: activationEval.snapshot,
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
      await markClaimedJobResult({
        jobId: claimed.id,
        status: "retryable_failed",
        errorCode: "PROCESS_STEP_FAILED",
        errorMessage: msg,
        retryAfter: computeRetryAfter(attempts),
      });
      if (attemptId) {
        await completeAttempt({
          attemptId,
          status: "failed",
          errorCode: "PROCESS_STEP_FAILED",
          errorMessage: msg,
        });
      }
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, intakeId, runId: run.id }, { status: 200 });
}
