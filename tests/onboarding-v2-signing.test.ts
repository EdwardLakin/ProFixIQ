import { describe, expect, it } from "vitest";
import { signOnboardingAgentPayload } from "@/features/onboarding-v2/server/signing";

describe("onboarding-v2 signing", () => {
  it("creates deterministic HMAC signature", () => {
    const signature = signOnboardingAgentPayload({
      secret: "top-secret",
      shopId: "shop_123",
      timestampMs: 1710000000000,
      rawBody: '{"shopId":"shop_123"}',
    });

    expect(signature).toBe("866f85f23f656b88c4dc95c0b53a2cedbdf7b8fb98c06236231e4c48e321161b");
  });
});
