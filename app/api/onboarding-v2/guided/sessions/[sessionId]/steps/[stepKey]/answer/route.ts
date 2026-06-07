import { NextResponse } from "next/server";
import { z } from "zod";

import { isGuidedOnboardingStepKey, updateGuidedOnboardingStep } from "@/features/onboarding-v2/server/guidedSessions";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const AnswerSchema = z.object({ answers: z.record(z.string(), z.unknown()).optional() });
type RouteContext = { params: Promise<{ sessionId: string; stepKey: string }> };

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });
  const { sessionId, stepKey } = await context.params;
  if (!isGuidedOnboardingStepKey(stepKey)) return NextResponse.json({ error: "Unknown guided onboarding step" }, { status: 400 });
  const parsed = AnswerSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid guided onboarding step answer" }, { status: 400 });

  try {
    const session = await updateGuidedOnboardingStep(access.supabase, { shopId, sessionId, stepKey, action: "answer", answers: parsed.data.answers });
    if (!session) return NextResponse.json({ error: "Guided onboarding session not found" }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save guided onboarding step answer" }, { status: 500 });
  }
}
