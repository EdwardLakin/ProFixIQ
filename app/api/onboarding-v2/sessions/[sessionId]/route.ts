import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const { sessionId } = await context.params;
  // Railway onboarding-agent contract: GET /onboarding/sessions/:sessionId with shopId included server-side.
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const query = new URLSearchParams({ shopId });
  const response = await proxyOnboardingAgent({ method: "GET", path: `/onboarding/sessions/${encodeURIComponent(sessionId)}`, shopId, query });
  const payload = (await response.json().catch(() => ({ ok: false, message: "Invalid agent response" }))) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
}
