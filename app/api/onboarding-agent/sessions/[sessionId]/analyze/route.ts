import { NextResponse } from "next/server";
import { analyzeOnboardingSession } from "@/features/onboarding-agent/server/analyzeOnboardingSession";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
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
    await assertOnboardingSessionOwnership({ supabase: admin, shopId, sessionId });

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
      warning: result.warning ?? null,
      liveRecordsCreated: 0,
      planSummary: result.planSummary,
      sessionSummary: result.sessionSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
