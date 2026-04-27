import { NextResponse } from "next/server";
import { buildOnboardingActivationPlan } from "@/features/onboarding-agent/server/buildOnboardingActivationPlan";
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
  void actorId;
  const admin = createAdminSupabase();

  const { sessionId } = await context.params;

  try {
    const plan = await buildOnboardingActivationPlan({
      supabase: admin,
      shopId,
      sessionId,
    });

    return NextResponse.json({ ok: true, mode: "dry_run", ...plan });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to build activation plan" },
      { status: 500 },
    );
  }
}
