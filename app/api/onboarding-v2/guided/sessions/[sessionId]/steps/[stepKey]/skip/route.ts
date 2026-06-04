import { NextResponse } from "next/server";
import { assertGuidedStepKey, guardedJsonError, requireGuidedOwnerAdminAccess, updateGuidedStepStatus } from "@/features/onboarding-v2/guided/server";

type Context = { params: Promise<{ sessionId: string; stepKey: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireGuidedOwnerAdminAccess();
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const { sessionId, stepKey: rawStepKey } = await context.params;
  const stepKey = assertGuidedStepKey(rawStepKey);
  if (!stepKey) return NextResponse.json({ error: "Unknown guided onboarding step" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  try {
    const payload = await updateGuidedStepStatus({
      supabase: access.supabase,
      shopId,
      sessionId,
      stepKey,
      status: "skipped",
      skippedReason: typeof body.skippedReason === "string" ? body.skippedReason : "Skipped by user",
    });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return guardedJsonError(error);
  }
}
