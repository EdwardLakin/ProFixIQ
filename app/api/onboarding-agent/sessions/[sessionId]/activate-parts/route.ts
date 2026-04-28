import { NextResponse } from "next/server";
import { activateOnboardingParts } from "@/features/onboarding-agent/server/activateOnboardingParts";
import { ActivationReviewItemWriteError } from "@/features/onboarding-agent/server/upsertOnboardingReviewItems";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const { sessionId } = await context.params;

  try {
    const result = await activateOnboardingParts({
      supabase: admin,
      shopId: access.profile.shop_id as string,
      sessionId,
      actorId: access.profile.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ActivationReviewItemWriteError) {
      return NextResponse.json({
        ok: false,
        error: {
          code: "activation_review_item_write_failed",
          message: "Activation review item write failed",
          phase: error.phase,
          issueType: error.issueType,
          scopeKey: error.scopeKey,
          reason: error.causeMessage,
          details: error.message,
        },
      }, { status: 500 });
    }
    const message = error instanceof Error ? error.message : "Failed to activate parts";
    const status = message.includes("Session not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
