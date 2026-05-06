import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const production = await proxyOnboardingAgent({ method: "GET", path: "/onboarding/production-readiness", shopId });
  if (!production.ok) return production;

  const connector = await proxyOnboardingAgent({ method: "GET", path: "/onboarding/connector/readiness", shopId });
  const productionJson = (await production.json()) as Record<string, unknown>;
  const connectorJson = connector.ok ? (await connector.json()) as Record<string, unknown> : { ok: false, message: "Connector readiness unavailable" };

  return NextResponse.json({ ok: true, production: productionJson, connector: connectorJson });
}
