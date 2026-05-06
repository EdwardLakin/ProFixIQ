import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";
import { StartSessionRequestSchema } from "@/features/onboarding-v2/server/schemas";

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const parsed = StartSessionRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const body = JSON.stringify({ shopId, ...parsed.data });
  const response = await proxyOnboardingAgent({ method: "POST", path: "/onboarding/sessions", shopId, body });
  const upstream = (await response.json().catch(() => ({ ok: false, failureKind: "invalid_agent_response", message: "Invalid onboarding agent response." }))) as Record<string, unknown>;
  const sessionId =
    typeof upstream.sessionId === "string"
      ? upstream.sessionId
      : typeof upstream.id === "string"
        ? upstream.id
        : undefined;

  const failureKind =
    typeof upstream.failureKind === "string"
      ? upstream.failureKind
      : typeof upstream.status === "string"
        ? upstream.status
        : typeof upstream.error === "string"
          ? upstream.error
          : undefined;

  const message =
    typeof upstream.message === "string"
      ? upstream.message
      : typeof upstream.error === "string"
        ? upstream.error
        : response.ok
          ? undefined
          : `Onboarding agent session request failed with status ${response.status}.`;

  const safePayload = {
    ok: upstream.ok === true || Boolean(sessionId),
    sessionId,
    failureKind,
    message,
    upstreamStatus: response.status,
  };
  return NextResponse.json(safePayload, { status: response.status });
}
