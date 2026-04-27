import { NextResponse } from "next/server";
import { analyzeOnboardingSession, OnboardingAnalysisConflictError } from "@/features/onboarding-agent/server/analyzeOnboardingSession";
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
    const message = error instanceof Error ? error.message : "Rerun failed";
    const status = error instanceof OnboardingAnalysisConflictError ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
