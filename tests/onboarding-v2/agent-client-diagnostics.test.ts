import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";

const originalEnv = process.env;

describe("onboarding agent diagnostics", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ONBOARDING_AGENT_ENABLED: "true",
      ONBOARDING_AGENT_BASE_URL: "https://agent.example.com",
      ONBOARDING_AGENT_INTERNAL_SECRET: "super-secret-value",
      NODE_ENV: "test",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("logs safe diagnostics for invalid signature failures without leaking secret/body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"message":"Invalid signature"}', { status: 400, headers: { "content-type": "application/json" } }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await proxyOnboardingAgent({
      method: "POST",
      path: "/onboarding/sessions",
      shopId: "shop_12345678",
      body: '{"private":"abc123secret"}',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.envSecretName).toBe("INTERNAL_HMAC_SECRET");
    expect(payload.secretLength).toBe("super-secret-value".length);
    expect(payload.rawBodyLength).toBe('{"private":"abc123secret"}'.length);
    expect(payload.shopIdMasked).toBe("shop...5678");
    expect(payload.signatureMasked).toMatch(/^[a-f0-9]{6}\.\.\.[a-f0-9]{6}$/);
    expect(JSON.stringify(payload)).not.toContain("super-secret-value");
    expect(JSON.stringify(payload)).not.toContain('{"private":"abc123secret"}');
  });

  it("does not log diagnostics for non-signature 400 responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"message":"Bad request"}', { status: 400 }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await proxyOnboardingAgent({ method: "POST", path: "/onboarding/sessions", shopId: "shop_1234", body: "{}" });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
