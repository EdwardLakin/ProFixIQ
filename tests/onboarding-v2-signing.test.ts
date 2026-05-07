import crypto from "node:crypto";
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

  it("signs payload in timestamp.shopId.rawBody order and rawBody impacts signature", () => {
    const secret = "abc123";
    const timestampMs = 1700000000000;
    const shopId = "shop_1";
    const rawBody = '{"a":1}';

    const withBody = signOnboardingAgentPayload({ secret, timestampMs, shopId, rawBody });
    const emptyBody = signOnboardingAgentPayload({ secret, timestampMs, shopId, rawBody: "" });

    const expectedWithBody = crypto.createHmac("sha256", secret).update(`${timestampMs}.${shopId}.${rawBody}`).digest("hex");
    const wrongOrder = crypto.createHmac("sha256", secret).update(`${shopId}.${timestampMs}.${rawBody}`).digest("hex");

    expect(withBody).toBe(expectedWithBody);
    expect(withBody).not.toBe(wrongOrder);
    expect(withBody).not.toBe(emptyBody);
  });
});
