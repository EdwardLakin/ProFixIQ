import { NextResponse } from "next/server";
import { assertGuidedStepKey, guardedJsonError, parseGuidedStatusPayload, requireGuidedOwnerAdminAccess, updateGuidedStepStatus } from "@/features/onboarding-v2/guided/server";

type Context = { params: Promise<{ sessionId: string; stepKey: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireGuidedOwnerAdminAccess();
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const { sessionId, stepKey: rawStepKey } = await context.params;
  const stepKey = assertGuidedStepKey(rawStepKey);
  if (!stepKey) return NextResponse.json({ error: "Unknown guided onboarding step" }, { status: 400 });

  const parsed = parseGuidedStatusPayload(await request.json().catch(() => ({})));
  if (!parsed) return NextResponse.json({ error: "Invalid guided onboarding status payload" }, { status: 400 });

  try {
    const payload = await updateGuidedStepStatus({
      supabase: access.supabase,
      shopId,
      sessionId,
      stepKey,
      status: parsed.status,
      summary: parsed.summary,
      error: parsed.error,
    });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return guardedJsonError(error);
  }
}
