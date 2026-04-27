import { NextResponse } from "next/server";
import { analyzeOnboardingSession } from "@/features/onboarding-agent/server/analyzeOnboardingSession";
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
    if (!session) return NextResponse.json({ ok: false, error: "Session not found for this shop" }, { status: 404 });

    const { count, error: countError } = await (admin as any)
      .from("onboarding_files")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("session_id", sessionId);

    if (countError) throw new Error(countError.message);
    if (!count || count < 1) return NextResponse.json({ ok: false, error: "Upload at least one file before analysis." }, { status: 400 });

    const result = await analyzeOnboardingSession({ supabase: admin, shopId, sessionId });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      liveRecordsCreated: 0,
      planSummary: result.planSummary,
      sessionSummary: result.sessionSummary,
      warnings: result.warning ? [result.warning] : [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Analysis failed" }, { status: 500 });
  }
}
