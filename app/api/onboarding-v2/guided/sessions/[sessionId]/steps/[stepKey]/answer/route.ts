import { NextResponse } from "next/server";
import { buildGuidedOnboardingDestinationUrl } from "@/features/onboarding-v2/guided/query";
import { assertGuidedStepKey, answerGuidedStepYes, guardedJsonError, requireGuidedOwnerAdminAccess, updateGuidedStepStatus } from "@/features/onboarding-v2/guided/server";

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
  const answer = body.answer === "no" ? "no" : body.answer === "yes" ? "yes" : null;
  if (!answer) return NextResponse.json({ error: "answer must be yes or no" }, { status: 400 });

  try {
    const payload = answer === "yes"
      ? await answerGuidedStepYes({ supabase: access.supabase, shopId, sessionId, stepKey })
      : await updateGuidedStepStatus({
          supabase: access.supabase,
          shopId,
          sessionId,
          stepKey,
          status: "skipped",
          skippedReason: typeof body.skippedReason === "string" ? body.skippedReason : "User answered no",
        });

    const destinationUrl = answer === "yes"
      ? buildGuidedOnboardingDestinationUrl({ sessionId, stepKey })
      : null;

    return NextResponse.json({ ok: true, answer, destinationUrl, ...payload });
  } catch (error) {
    return guardedJsonError(error);
  }
}
