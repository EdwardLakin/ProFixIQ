import { describe, expect, it } from "vitest";
import { signOnboardingAgentPayload } from "@/features/onboarding-v2/server/signing";
import { isAllowedUploadType, MAX_BYTES, parseApproxBase64Bytes } from "@/features/onboarding-v2/server/fileUpload";

describe("onboarding v2 signing", () => {
  it("signs timestamp.shopId.rawBody format", () => {
    const signature = signOnboardingAgentPayload({ secret: "abc123", timestampMs: 1700000000000, shopId: "shop_1", rawBody: '{"a":1}' });
    expect(signature).toBe("6f6255f4f77c713131697f277134af3947e59f51d651ef0dfa0cdc466bd406d0");
  });
});

describe("upload guardrails", () => {
  it("rejects xlsx as unsupported", () => {
    expect(isAllowedUploadType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sample.xlsx").ok).toBe(false);
  });

  it("rejects oversized base64 payload", () => {
    const bytes = parseApproxBase64Bytes("A".repeat(MAX_BYTES * 2));
    expect(bytes).toBeGreaterThan(MAX_BYTES);
  });
});
