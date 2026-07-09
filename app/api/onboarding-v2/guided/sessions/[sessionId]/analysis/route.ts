import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { runGuidedOnboardingAnalysis } from "@/features/onboarding-v2/analysis/server";

type Props = { params: Promise<{ sessionId: string }> };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(_request: Request, { params }: Props) {
  const { sessionId } = await params;
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return jsonError("Shop not found", 403);

  try {
    await access.supabase.rpc("set_current_shop_id", { p_shop_id: shopId });

    const { data: session, error: sessionError } = await access.supabase
      .from("guided_onboarding_sessions")
      .select("id, shop_id")
      .eq("id", sessionId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (sessionError) return jsonError(sessionError.message, 500);
    if (!session) return jsonError("Guided onboarding session not found", 404);

    const { data: step, error: stepError } = await access.supabase
      .from("guided_onboarding_steps")
      .select("id, step_key")
      .eq("session_id", sessionId)
      .eq("shop_id", shopId)
      .eq("step_key", "analysis")
      .maybeSingle();
    if (stepError) return jsonError(stepError.message, 500);
    if (!step) return jsonError("AI Analysis guided step not found", 404);

    const result = await runGuidedOnboardingAnalysis({
      supabase: access.supabase as never,
      actor: { shopId, actorId: access.profile.id, role: access.profile.role, source: "manual" },
      sessionId,
    });

    const timestamp = new Date().toISOString();
    await access.supabase
      .from("guided_onboarding_steps")
      .update({ status: "completed", completed_at: timestamp, skipped_at: null, updated_at: timestamp })
      .eq("session_id", sessionId)
      .eq("shop_id", shopId)
      .eq("step_key", "analysis");

    await access.supabase.from("guided_onboarding_events").insert({
      session_id: sessionId,
      shop_id: shopId,
      step_key: "analysis",
      event_type: "analysis_run_completed",
      payload: { createdCount: result.createdCount, skippedCount: result.skippedCount, categories: result.categories, deterministic: true, noAutoCreate: true },
      created_by: access.profile.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to run guided onboarding analysis", 500);
  }
}
