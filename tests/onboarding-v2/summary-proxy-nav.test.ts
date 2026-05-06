import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isOnboardingV2NavEnabled } from "@/features/onboarding-v2/lib/flags";

describe("summary proxy and nav guardrails", () => {
  it("summary/recommendations proxies strip raw_data", () => {
    const summaryRoute = fs.readFileSync(path.join(process.cwd(), "app/api/onboarding-v2/sessions/[sessionId]/summary/route.ts"), "utf8");
    const recommendationsRoute = fs.readFileSync(path.join(process.cwd(), "app/api/onboarding-v2/sessions/[sessionId]/recommendations/route.ts"), "utf8");
    expect(summaryRoute.includes("raw_data")).toBe(true);
    expect(summaryRoute.includes("delete json.raw_data")).toBe(true);
    expect(recommendationsRoute.includes("delete json.raw_data")).toBe(true);
  });

  it("onboarding v2 nav is feature-flag gated", () => {
    const existing = process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED;
    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = "false";
    expect(isOnboardingV2NavEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = "true";
    expect(isOnboardingV2NavEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED = existing;
  });
});
