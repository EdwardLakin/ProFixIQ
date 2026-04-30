import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

function legacyActivationResponse(sessionId: string) {
  return NextResponse.json({
    ok: false,
    error: {
      code: "legacy_activation_route_disabled",
      message: "This activation route has been disabled. Use the canonical onboarding activation endpoint.",
      canonicalRoute: `/api/onboarding-agent/sessions/${sessionId}/activate`,
    },
  }, { status: 410 });
}

export async function POST(_: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const { sessionId } = await context.params;
  return legacyActivationResponse(sessionId);
}
