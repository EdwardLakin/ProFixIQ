import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";

function getStatus(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "ok" : "failed";
  return "unknown";
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  const [healthResponse, readinessResponse] = await Promise.all([
    proxyOnboardingAgent({ method: "GET", path: "/health", shopId }),
    proxyOnboardingAgent({ method: "GET", path: "/health/ready", shopId }),
  ]);

  const healthJson = toRecord(await healthResponse.json().catch(() => ({})));
  const readinessJson = toRecord(await readinessResponse.json().catch(() => ({})));

  const service = typeof healthJson.service === "string" ? healthJson.service : "";
  const healthStatus = getStatus(healthJson.status ?? healthJson.ok);
  const readinessStatus = getStatus(readinessJson.status ?? readinessJson.ok);

  return NextResponse.json(
    {
      ok:
        healthResponse.ok &&
        readinessResponse.ok &&
        service === "profixiq-onboarding-agent" &&
        healthStatus === "ok" &&
        readinessStatus === "ok",
      service,
      health: healthStatus,
      readiness: readinessStatus,
      diagnostics: {
        version: typeof healthJson.version === "string" ? healthJson.version : undefined,
        uptimeSec: typeof healthJson.uptimeSec === "number" ? healthJson.uptimeSec : undefined,
      },
    },
    { status: healthResponse.ok && readinessResponse.ok ? 200 : 503 },
  );
}
