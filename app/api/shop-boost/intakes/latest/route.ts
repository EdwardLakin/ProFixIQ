import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { toIntakeProgress } from "@/features/integrations/shopBoost/status";
import { getRunByShopIntake, summarizeRunJobs } from "@/features/integrations/shopBoost/orchestrator";

type DB = Database;

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

  let orchestrator: {
    runId: string;
    state: string;
    activationStatus: string;
    activationBlockers: unknown;
    jobs: Record<string, number> | null;
  } | null = null;

  try {
    const run = await getRunByShopIntake({
      shopId: profile.shop_id,
      intakeId: intake.id,
    });

    if (run?.id) {
      orchestrator = {
        runId: run.id,
        state: run.state,
        activationStatus: run.activation_status,
        activationBlockers: run.activation_blockers ?? [],
        jobs: await summarizeRunJobs(run.id),
      };
    }
  } catch (orchestratorErr) {
    console.error("[shop-boost/orchestrator] latest status enrichment failed", {
      shopId: profile.shop_id,
      intakeId: intake.id,
      error: orchestratorErr instanceof Error ? orchestratorErr.message : String(orchestratorErr),
    });
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
