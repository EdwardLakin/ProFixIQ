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
  const safePayload = {
    ok: upstream.ok === true,
    sessionId: typeof upstream.sessionId === "string" ? upstream.sessionId : undefined,
    failureKind: typeof upstream.failureKind === "string" ? upstream.failureKind : undefined,
    message: typeof upstream.message === "string" ? upstream.message : undefined,
    upstreamStatus: response.status,
  };
  return NextResponse.json(safePayload, { status: response.status });
}
