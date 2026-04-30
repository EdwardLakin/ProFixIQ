import { NextResponse } from "next/server";
import { activateOnboardingSession } from "@/features/onboarding-agent/server/activateOnboardingSession";
import { ActivationReviewItemWriteError } from "@/features/onboarding-agent/server/upsertOnboardingReviewItems";
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

  const admin = createAdminSupabase();
  const { sessionId } = await context.params;

  try {
    const result = await activateOnboardingSession({
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
          domain: error.domain,
          issueType: error.issueType,
          severity: error.severity,
          scope: error.scope,
          scopeKey: error.scopeKey,
          reason: "review_item_persist_failed",
          developer: {
            code: error.causeCode,
            message: error.causeMessage,
          },
        },
      }, { status: 500 });
    }

    const message = error instanceof Error ? error.message : "Failed to activate onboarding session";
    if (message.includes("history_activation_failed:")) {
      return NextResponse.json({
        ok: false,
        error: {
          code: "history_activation_failed",
          message: "History activation timed out while processing a large batch. Continue canonical activation to resume.",
          phase: "history",
          operation: "activateOnboardingHistory",
          developer: {
            message,
          },
        },
      }, { status: 500 });
    }
    const status = message.includes("Session not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
