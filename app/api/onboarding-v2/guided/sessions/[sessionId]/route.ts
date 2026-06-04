import { NextResponse } from "next/server";
import { fetchGuidedSession, guardedJsonError, requireGuidedOwnerAdminAccess } from "@/features/onboarding-v2/guided/server";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(_: Request, context: Context) {
  const access = await requireGuidedOwnerAdminAccess();
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const { sessionId } = await context.params;
  try {
    const payload = await fetchGuidedSession({ supabase: access.supabase, shopId, sessionId });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return guardedJsonError(error);
  }
}
