import { getOnboardingAgentConfig } from "@/features/onboarding-v2/server/config";
import { signOnboardingAgentPayload } from "@/features/onboarding-v2/server/signing";

export async function proxyOnboardingAgent(input: { method: "GET" | "POST"; path: string; shopId: string; body?: string; query?: URLSearchParams }): Promise<Response> {
  const config = getOnboardingAgentConfig();

  if (!config.enabled) {
    return Response.json({ ok: false, status: "disabled", message: "Onboarding agent is disabled." }, { status: 503 });
  }

  if (!config.baseUrl || !config.internalSecret) {
    return Response.json({ ok: false, status: "not_configured", message: "Onboarding agent is not configured." }, { status: 503 });
  }

  const rawBody = input.body ?? "";
  const timestampMs = Date.now();
  const signature = signOnboardingAgentPayload({ secret: config.internalSecret, shopId: input.shopId, timestampMs, rawBody });
  const url = new URL(input.path, config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`);
  if (input.query) {
    input.query.forEach((value, key) => url.searchParams.set(key, value));
  }

  try {
    return await fetch(url, {
      method: input.method,
      headers: {
        "content-type": "application/json",
        "x-shop-id": input.shopId,
        "x-onboarding-agent-timestamp": String(timestampMs),
        "x-onboarding-agent-signature": signature,
      },
      body: input.method === "POST" ? rawBody : undefined,
      cache: "no-store",
    });
  } catch {
    return Response.json({ ok: false, status: "unreachable", message: "Onboarding agent is unreachable." }, { status: 502 });
  }
}
