import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";

export async function withOnboardingAccess() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access;
  if (!access.profile.shop_id) {
    return { ok: false as const, response: NextResponse.json({ error: "Missing shop context" }, { status: 403 }) };
  }
  return access;
}

export async function proxyJson(params: { method: "GET" | "POST"; path: string; shopId: string; body?: unknown; query?: URLSearchParams }) {
  const response = await proxyOnboardingAgent({ method: params.method, path: params.path, shopId: params.shopId, body: params.body === undefined ? undefined : JSON.stringify(params.body), query: params.query });
  const payload = (await response.json().catch(() => ({ ok: false, error: "invalid_agent_response" }))) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
}
