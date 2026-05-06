import { getOnboardingAgentConfig } from "@/features/onboarding-v2/server/config";
import { signOnboardingAgentPayload } from "@/features/onboarding-v2/server/signing";

const REQUEST_TIMEOUT_MS = 20_000;

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
  if (input.query) input.query.forEach((value, key) => url.searchParams.set(key, value));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return Response.json({ ok: false, failureKind: "agent_timeout", message: "Onboarding agent timed out." }, { status: 504 });
    }
    return Response.json({ ok: false, failureKind: "agent_unreachable", message: "Onboarding agent is unreachable." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
