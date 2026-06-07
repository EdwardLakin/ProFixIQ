import { NextResponse } from "next/server";
import { z } from "zod";

import { isGuidedOnboardingStepKey, loadGuidedOnboardingSession, updateGuidedOnboardingStep } from "@/features/onboarding-v2/server/guidedSessions";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const StepStatusSchema = z.object({ status: z.enum(["not_started", "in_progress", "complete", "skipped"]) });
type RouteContext = { params: Promise<{ sessionId: string; stepKey: string }> };

export async function GET(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });
  const { sessionId, stepKey } = await context.params;
  if (!isGuidedOnboardingStepKey(stepKey)) return NextResponse.json({ error: "Unknown guided onboarding step" }, { status: 400 });

  try {
    const session = await loadGuidedOnboardingSession(access.supabase, { shopId, sessionId });
    if (!session) return NextResponse.json({ error: "Guided onboarding session not found" }, { status: 404 });
    return NextResponse.json({ stepKey, state: session.guided.steps[stepKey] ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load guided onboarding step status" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });
  const { sessionId, stepKey } = await context.params;
  if (!isGuidedOnboardingStepKey(stepKey)) return NextResponse.json({ error: "Unknown guided onboarding step" }, { status: 400 });
  const parsed = StepStatusSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid guided onboarding step status" }, { status: 400 });

  try {
    const session = await updateGuidedOnboardingStep(access.supabase, { shopId, sessionId, stepKey, action: "status", status: parsed.data.status });
    if (!session) return NextResponse.json({ error: "Guided onboarding session not found" }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update guided onboarding step status" }, { status: 500 });
  }
}
