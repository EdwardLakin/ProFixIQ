import { NextResponse } from "next/server";
import { getOnboardingSession } from "@/features/onboarding-agent/server/getOnboardingSession";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const { sessionId } = await context.params;

  try {
    const payload = await getOnboardingSession({
      supabase: access.supabase,
      shopId: access.profile.shop_id as string,
      sessionId,
    });

    if (!payload.session) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load session" },
      { status: 500 },
    );
  }
}