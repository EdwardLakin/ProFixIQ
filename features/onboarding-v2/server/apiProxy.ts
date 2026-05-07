import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

function sanitizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item));
  if (typeof value === "object") {
    const cleaned: JsonObject = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "raw_data") continue;
      cleaned[key] = sanitizeJson(nested);
    }
    return cleaned;
  }
  return String(value);
}

export async function withOnboardingAccess() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access;
  if (!access.profile.shop_id) {
    return { ok: false as const, response: NextResponse.json({ error: "Missing shop context" }, { status: 403 }) };
  }
  return access;
}

export async function proxyJson(params: { method: "GET" | "POST"; path: string; shopId: string; body?: unknown; query?: URLSearchParams }) {
  const query = new URLSearchParams(params.query);
  if (!query.get("shopId")) query.set("shopId", params.shopId);

  const response = await proxyOnboardingAgent({
    method: params.method,
    path: params.path,
    shopId: params.shopId,
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
    query,
  });

  const payloadRaw = (await response.json().catch(() => ({ ok: false, failureKind: "invalid_agent_response", message: "Invalid onboarding agent response." }))) as unknown;
  const payload = sanitizeJson(payloadRaw);
  return NextResponse.json(payload, { status: response.status });
}
