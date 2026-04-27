import { describe, expect, it } from "vitest";
import {
  assertOnboardingUploadFile,
  buildOnboardingStoragePath,
  sanitizeOnboardingFilename,
} from "@/features/onboarding-agent/server/uploadOnboardingFiles";

describe("onboarding upload helpers", () => {
  it("sanitizes path traversal from filename", () => {
    const sanitized = sanitizeOnboardingFilename("../../etc/passwd.csv");
    expect(sanitized).toBe("passwd.csv");
  });

  it("builds deterministic scoped storage path", () => {
    const path = buildOnboardingStoragePath({
      shopId: "shop-1",
      sessionId: "session-1",
      filename: "customers.csv",
      index: 0,
    });

    expect(path).toContain("onboarding-agent/shop-1/session-1/");
    expect(path.endsWith("customers.csv")).toBe(true);
  });

  it("rejects unsupported files", () => {
    const file = new File(["x"], "customers.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(() => assertOnboardingUploadFile(file)).toThrow("CSV is supported in this phase");
  });
});
