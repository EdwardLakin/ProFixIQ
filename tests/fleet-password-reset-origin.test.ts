import { afterEach, describe, expect, it } from "vitest";
import { resolvePasswordResetBaseUrl } from "@/features/auth/api/send-reset/route";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

describe("Fleet password reset origin", () => {
  it("returns Fleet password recovery to the Fleet product host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://profixiq.com";

    expect(
      resolvePasswordResetBaseUrl(
        new Request("https://fleet.profixiq.com/api/auth/send-reset"),
      ),
    ).toBe("https://fleet.profixiq.com");
  });

  it("keeps Shop password recovery on the configured primary origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://profixiq.com/";

    expect(
      resolvePasswordResetBaseUrl(
        new Request("https://deployment-preview.vercel.app/api/auth/send-reset"),
      ),
    ).toBe("https://profixiq.com");
  });
});
