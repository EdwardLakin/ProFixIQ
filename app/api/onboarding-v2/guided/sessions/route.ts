import { NextResponse } from "next/server";
import { z } from "zod";

import { isGuidedOnboardingStepKey, createGuidedOnboardingSession, listGuidedOnboardingSessions } from "@/features/onboarding-v2/server/guidedSessions";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const CreateGuidedSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  existingSystem: z.string().trim().min(1).max(80).nullable().optional(),
  currentStepKey: z.string().optional(),
});

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  try {
    const sessions = await listGuidedOnboardingSessions(access.supabase, shopId);
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load guided onboarding sessions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const parsed = CreateGuidedSessionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid guided onboarding session request" }, { status: 400 });

  const currentStepKey = isGuidedOnboardingStepKey(parsed.data.currentStepKey) ? parsed.data.currentStepKey : null;

  try {
    const session = await createGuidedOnboardingSession(access.supabase, {
      shopId,
      userId: access.profile.id,
      title: parsed.data.title,
      existingSystem: parsed.data.existingSystem ?? null,
      currentStepKey,
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create guided onboarding session" }, { status: 500 });
  }
}
