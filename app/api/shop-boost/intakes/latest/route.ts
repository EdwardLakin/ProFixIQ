import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { toIntakeProgress } from "@/features/integrations/shopBoost/status";
import {
  getLatestRunAttemptSummary,
  getRunByShopIntake,
  summarizeRunJobs,
} from "@/features/integrations/shopBoost/orchestrator";

type DB = Database;
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function GET() {
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

  if (!profile?.shop_id) {
    return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: intake, error } = await admin
    .from("shop_boost_intakes")
    .select("id,shop_id,status,processed_at,created_at,intake_basics")
    .eq("shop_id", profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[shop-boost][intakes/latest] failed to load latest intake", {
      shopId: profile.shop_id,
      error: error.message,
    });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!intake) return NextResponse.json({ ok: true, intake: null });

  const basics = asRecord(intake.intake_basics);
  const basicsOrchestrator = asRecord(basics.orchestrator);

  let orchestrator: Record<string, unknown> | null = null;

  try {
    const run = await getRunByShopIntake({
      shopId: profile.shop_id,
      intakeId: intake.id,
    });

    if (run?.id) {
      const jobSummary = await summarizeRunJobs(run.id);
      const lastAttempt = await getLatestRunAttemptSummary(run.id);
      orchestrator = {
        runId: run.id,
        runState: run.state,
        activationStatus: run.activation_status,
        blockers: run.activation_blockers ?? [],
        jobSummary,
        lastAttempt,
        state: run.state,
        activationBlockers: run.activation_blockers ?? [],
        jobs: jobSummary,
        lastError:
          lastAttempt?.status === "failed" || lastAttempt?.errorMessage
            ? {
                code: lastAttempt?.errorCode ?? null,
                message: lastAttempt?.errorMessage ?? null,
              }
            : null,
      };
    }
  } catch (orchestratorErr) {
    console.error("[shop-boost/orchestrator] latest status enrichment failed", {
      shopId: profile.shop_id,
      intakeId: intake.id,
      error: orchestratorErr instanceof Error ? orchestratorErr.message : String(orchestratorErr),
    });
  }

  if (!orchestrator && Object.keys(basicsOrchestrator).length > 0) {
    orchestrator = {
      runId: basicsOrchestrator.run_id ?? null,
      runState: basicsOrchestrator.state ?? null,
      activationStatus: basicsOrchestrator.activation_status ?? null,
      blockers: basicsOrchestrator.activation_blockers ?? [],
      jobSummary: basicsOrchestrator.job_summary ?? null,
      lastAttempt: basicsOrchestrator.last_attempt ?? null,
      state: basicsOrchestrator.state ?? null,
      activationBlockers: basicsOrchestrator.activation_blockers ?? [],
      jobs: basicsOrchestrator.job_summary ?? null,
      lastError: basicsOrchestrator.last_error ?? null,
    };
  }

  return NextResponse.json({
    ok: true,
    intake: {
      id: intake.id,
      status: intake.status,
      createdAt: intake.created_at,
      processedAt: intake.processed_at,
      progress: toIntakeProgress(intake as never),
      orchestrator,
    },
  });
}
