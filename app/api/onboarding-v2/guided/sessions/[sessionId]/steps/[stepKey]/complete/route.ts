import { NextResponse } from "next/server";

import { isGuidedOnboardingStepKey, updateGuidedOnboardingStep } from "@/features/onboarding-v2/server/guidedSessions";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = { params: Promise<{ sessionId: string; stepKey: string }> };

export async function POST(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });
  const { sessionId, stepKey } = await context.params;
  if (!isGuidedOnboardingStepKey(stepKey)) return NextResponse.json({ error: "Unknown guided onboarding step" }, { status: 400 });

  try {
    const session = await updateGuidedOnboardingStep(access.supabase, { shopId, sessionId, stepKey, action: "complete" });
    if (!session) return NextResponse.json({ error: "Guided onboarding session not found" }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete guided onboarding step" }, { status: 500 });
  }
}
