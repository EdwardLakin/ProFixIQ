import { NextResponse } from "next/server";
import { z } from "zod";

import { isGuidedOnboardingStepKey, loadGuidedOnboardingSession, updateGuidedOnboardingSession } from "@/features/onboarding-v2/server/guidedSessions";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const UpdateGuidedSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  notes: z.string().max(2000).nullable().optional(),
  existingSystem: z.string().trim().min(1).max(80).nullable().optional(),
  currentStepKey: z.string().optional(),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const { sessionId } = await context.params;
  try {
    const session = await loadGuidedOnboardingSession(access.supabase, { shopId, sessionId });
    if (!session) return NextResponse.json({ error: "Guided onboarding session not found" }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load guided onboarding session" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const { sessionId } = await context.params;
  const parsed = UpdateGuidedSessionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid guided onboarding session update" }, { status: 400 });

  const currentStepKey = isGuidedOnboardingStepKey(parsed.data.currentStepKey) ? parsed.data.currentStepKey : null;

  try {
    const session = await updateGuidedOnboardingSession(access.supabase, {
      shopId,
      sessionId,
      title: parsed.data.title,
      notes: parsed.data.notes,
      existingSystem: parsed.data.existingSystem,
      currentStepKey,
    });
    if (!session) return NextResponse.json({ error: "Guided onboarding session not found" }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update guided onboarding session" }, { status: 500 });
  }
}
