import { NextResponse } from "next/server";
import { analyzeOnboardingSession } from "@/features/onboarding-agent/server/analyzeOnboardingSession";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function POST(_: Request, { params }: { params: { sessionId: string } }) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  try {
    const summary = await analyzeOnboardingSession({ supabase: access.supabase, shopId: access.profile.shop_id as string, sessionId: params.sessionId });
    return NextResponse.json({ ok: true, summary, liveRecordsCreated: 0 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Analysis failed" }, { status: 500 });
  }
}
