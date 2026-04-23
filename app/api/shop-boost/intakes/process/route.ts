import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { updateIntakeProgress } from "@/features/integrations/shopBoost/status";
import {
  ensureRun,
  seedRunJobs,
  summarizeRunJobs,
  summarizeRunJobsDetailed,
} from "@/features/integrations/shopBoost/orchestrator";
import { triggerShopBoostWorker } from "@/features/integrations/shopBoost/orchestrator/triggerWorker";

type DB = Database;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(req: NextRequest) {
  // Public control-plane route: enqueue/trigger only.
  // Execution happens in /api/internal/shop-boost/run.
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

  try {
    const run = await ensureRun({
      shopId,
      intakeId: intake.id,
      triggerSource: "api",
      createdBy: user.id,
    });
    if (!run?.id) {
      throw new Error("Failed to initialize orchestrator run.");
    }

    const runId = run.id;

    await seedRunJobs({ runId, shopId, intakeId: intake.id });

    const intakeRow = await admin
      .from("shop_boost_intakes")
      .select("intake_basics")
      .eq("id", intake.id)
      .maybeSingle<{ intake_basics: unknown }>();

    const intakeBasics = asRecord(intakeRow.data?.intake_basics);
    const jobSummary = await summarizeRunJobs(runId);
    const jobSummaryDetailed = await summarizeRunJobsDetailed(runId);
    const orchestratorPatch = {
      run_id: runId,
      state: "queued",
      activation_status: run.activation_status,
      activation_blockers: run.activation_blockers ?? [],
      activation_snapshot: run.activation_snapshot ?? {},
      job_summary: jobSummary,
      job_summary_detailed: jobSummaryDetailed,
      runState: "queued",
      activationStatus: run.activation_status,
      blockers: run.activation_blockers ?? [],
      jobSummary,
      jobSummaryDetailed,
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
        } as unknown as DB["public"]["Tables"]["shop_boost_intakes"]["Update"]["intake_basics"],
      })
      .eq("id", intake.id);

    await updateIntakeProgress({
      intakeId: intake.id,
      status: "processing",
      currentStep: "queued_for_worker",
      progressPercent: 12,
      patch: {
        startedAt: new Date().toISOString(),
        completedAt: null,
        failedAt: null,
        lastError: null,
        orchestrator: orchestratorPatch,
      },
    });

    const workerKickoff = await triggerShopBoostWorker({
      shopId,
      intakeId: intake.id,
      runId,
      runImport: true,
      maxRuns: 1,
      maxPasses: 8,
      triggerSource: "api-process-route",
    });

    return NextResponse.json({
      ok: true,
      intakeId: intake.id,
      queued: true,
      triggered: workerKickoff.ok,
      triggerStatus: workerKickoff.ok ? "accepted" : "best_effort_failed",
      status: "processing",
      orchestrator: {
        runId,
        activationStatus: run.activation_status,
        activationBlockers: run.activation_blockers ?? [],
        jobSummary,
        jobSummaryDetailed,
      },
      workerKickoff: workerKickoff.ok
        ? {
            statusCode: workerKickoff.statusCode,
            runsTouched: workerKickoff.response?.runsTouched ?? 0,
            jobsClaimed: workerKickoff.response?.jobsClaimed ?? 0,
          }
        : {
            statusCode: workerKickoff.statusCode ?? null,
            error: workerKickoff.error ?? "worker trigger failed",
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

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
