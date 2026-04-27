import { NextResponse } from "next/server";
import { getOnboardingSession } from "@/features/onboarding-agent/server/getOnboardingSession";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET(_: Request, { params }: { params: { sessionId: string } }) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  try {
    const payload = await getOnboardingSession({ supabase: access.supabase, shopId: access.profile.shop_id as string, sessionId: params.sessionId });
    if (!payload.session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to load session" }, { status: 500 });
  }
}
