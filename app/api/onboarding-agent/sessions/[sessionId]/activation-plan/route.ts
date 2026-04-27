import { NextResponse } from "next/server";
import { buildOnboardingActivationPlan } from "@/features/onboarding-agent/server/buildOnboardingActivationPlan";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function POST(_: Request, { params }: { params: { sessionId: string } }) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  try {
    const plan = await buildOnboardingActivationPlan({ supabase: access.supabase, shopId: access.profile.shop_id as string, sessionId: params.sessionId });
    return NextResponse.json({ ok: true, mode: "dry_run", ...plan });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to build activation plan" }, { status: 500 });
  }
}
