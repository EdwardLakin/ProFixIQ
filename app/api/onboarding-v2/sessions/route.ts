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
  const payload = (await response.json().catch(() => ({ ok: false, message: "Invalid agent response" }))) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
}
