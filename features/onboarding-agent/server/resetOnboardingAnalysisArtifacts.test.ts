import { describe, expect, it } from "vitest";
import { resetOnboardingAnalysisArtifacts } from "@/features/onboarding-agent/server/resetOnboardingAnalysisArtifacts";

describe("resetOnboardingAnalysisArtifacts", () => {
  it("clears staged artifacts in dependency order scoped by shop+session", async () => {
    const calls: string[] = [];

    const sb = {
      from(table: string) {
        return {
          update() { calls.push(`update:${table}`); return this; },
          delete() { calls.push(`delete:${table}`); return this; },
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: { summary: { aiRowsSampled: 50 } }, error: null }); },
          then(resolve: (v: any) => unknown, reject?: (r?: unknown) => unknown) {
            return Promise.resolve({ error: null }).then(resolve, reject);
          },
        };
      },
    };

    await resetOnboardingAnalysisArtifacts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1" });

    expect(calls).toEqual([
      "update:onboarding_sessions",
      "delete:onboarding_entity_links",
      "delete:onboarding_review_items",
      "delete:onboarding_entities",
      "update:onboarding_sessions",
    ]);
  });
});
