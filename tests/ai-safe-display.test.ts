import { describe, expect, it } from "vitest";
import { isSafeDisplayText, sanitizeDisplayText } from "@/features/ai/server/safeDisplay";

describe("AI safe display text guardrail", () => {
  it("accepts normal display-safe strings", () => {
    expect(isSafeDisplayText("Review technician dispatch queue.")).toBe(true);
    expect(isSafeDisplayText("  Priority follow-up needed  ")).toBe(true);
    expect(isSafeDisplayText("x".repeat(320))).toBe(true);
  });

  it("rejects unsafe or blob-like strings", () => {
    expect(isSafeDisplayText("   ")).toBe(false);
    expect(isSafeDisplayText("{\"token\":\"secret\"}")).toBe(false);
    expect(isSafeDisplayText("[\"preview_payload\"]")).toBe(false);
    expect(isSafeDisplayText("owner_pin_verification_ref=proof")).toBe(false);
    expect(isSafeDisplayText("Bearer token abc123")).toBe(false);
    expect(isSafeDisplayText("x".repeat(321))).toBe(false);
  });

  it("sanitizes values with deterministic fallback", () => {
    expect(sanitizeDisplayText(" Safe title ", "Fallback")).toBe("Safe title");
    expect(sanitizeDisplayText("{\"snapshot\":true}", "Fallback title")).toBe("Fallback title");
    expect(sanitizeDisplayText("token:abc", "fallback_value")).toBe("fallback_value");
    expect(sanitizeDisplayText("token:abc", "  ")).toBe("");
  });
});
