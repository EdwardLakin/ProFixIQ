import { NextResponse } from "next/server";
import { activateOnboardingVendors } from "@/features/onboarding-agent/server/activateOnboardingVendors";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id as string;
  const actorId = access.profile.id;
  const admin = createAdminSupabase();
  const { sessionId } = await context.params;

  try {
    const result = await activateOnboardingVendors({
      supabase: admin,
      shopId,
      sessionId,
      actorId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate vendors";
    const status = message.includes("Session not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
