import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";
import { defaultAgentReadiness, normalizeAgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";

function pickReadiness(productionRaw: unknown, connectorRaw: unknown) {
  const production = (typeof productionRaw === "object" && productionRaw !== null ? productionRaw : {}) as Record<string, unknown>;
  const connector = (typeof connectorRaw === "object" && connectorRaw !== null ? connectorRaw : {}) as Record<string, unknown>;

  return normalizeAgentReadiness({
    ok: production.ok === true,
    rolloutStage: production.rolloutStage,
    connector: {
      mode: connector.mode,
      configured: connector.configured,
      liveMaterializationEnabled: connector.liveMaterializationEnabled,
      canValidateShop: connector.canValidateShop,
      canWriteLive: connector.canWriteLive,
    },
    warnings: production.warnings,
    requiredEnv: production.requiredEnv,
  });
}

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const production = await proxyOnboardingAgent({ method: "GET", path: "/onboarding/production-readiness", shopId });
  if (!production.ok) {
    return NextResponse.json(defaultAgentReadiness(), { status: production.status });
  }

  const connector = await proxyOnboardingAgent({ method: "GET", path: "/onboarding/connector/readiness", shopId });
  const productionJson = (await production.json().catch(() => ({}))) as unknown;
  const connectorJson = connector.ok ? ((await connector.json().catch(() => ({}))) as unknown) : {};

  return NextResponse.json(pickReadiness(productionJson, connectorJson));
}
