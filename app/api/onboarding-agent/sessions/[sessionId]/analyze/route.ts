import { NextResponse } from "next/server";
import { analyzeOnboardingSession } from "@/features/onboarding-agent/server/analyzeOnboardingSession";
import { getOnboardingAgentEnabled } from "@/features/onboarding-agent/server/model";
import { runOnboardingAgentAnalysis } from "@/features/onboarding-agent/server/runOnboardingAgentAnalysis";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id as string;
  const actorId = access.profile.id;
  void actorId;
  const admin = createAdminSupabase();

  const { sessionId } = await context.params;

  try {
    const { data: session, error: sessionError } = await (admin as any)
      .from("onboarding_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found for this shop" }, { status: 404 });
    }

    const { count, error: countError } = await (admin as any)
      .from("onboarding_files")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("session_id", sessionId);

    if (countError) throw new Error(countError.message);
    if (!count || count < 1) {
      return NextResponse.json(
        { ok: false, error: "Upload at least one file before analysis." },
        { status: 400 },
      );
    }

    const summary = await analyzeOnboardingSession({
      supabase: admin,
      shopId,
      sessionId,
    });

    let agentReport = null;
    let aiUnavailable = false;
    const shouldAutoAnalyze = process.env.ONBOARDING_AGENT_AUTO_ANALYZE === "false"
      ? false
      : getOnboardingAgentEnabled();

    if (shouldAutoAnalyze) {
      try {
        agentReport = await runOnboardingAgentAnalysis({
          supabase: admin,
          shopId,
          sessionId,
        });
      } catch (error) {
        aiUnavailable = true;
        console.warn("[onboarding-agent] auto agent analysis warning", {
          sessionId,
          shopId: access.profile.shop_id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      summary,
      agentReport,
      aiUnavailable,
      liveRecordsCreated: 0,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
