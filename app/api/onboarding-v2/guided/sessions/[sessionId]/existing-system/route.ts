import { NextResponse } from "next/server";
import { answerExistingSystemGate, guardedJsonError, requireGuidedOwnerAdminAccess } from "@/features/onboarding-v2/guided/server";

type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireGuidedOwnerAdminAccess();
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const { sessionId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const answer = body.answer === "no" ? "no" : body.answer === "yes" ? "yes" : null;
  if (!answer) return NextResponse.json({ error: "answer must be yes or no" }, { status: 400 });

  try {
    const payload = await answerExistingSystemGate({ supabase: access.supabase, shopId, sessionId, answer });
    return NextResponse.json({ ok: true, answer, redirectTo: answer === "no" ? "/dashboard" : null, ...payload });
  } catch (error) {
    return guardedJsonError(error);
  }
}
