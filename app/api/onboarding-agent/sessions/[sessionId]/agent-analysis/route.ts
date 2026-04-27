import { NextResponse } from "next/server";
import { runOnboardingAgentAnalysis } from "@/features/onboarding-agent/server/runOnboardingAgentAnalysis";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const { sessionId } = await context.params;

  try {
    const report = await runOnboardingAgentAnalysis({
      supabase: access.supabase,
      shopId: access.profile.shop_id as string,
      sessionId,
    });

    return NextResponse.json({ ok: true, report, liveRecordsCreated: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent analysis failed";
    if (message === "Session not found") {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
