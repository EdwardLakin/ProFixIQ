import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDED_ONBOARDING_STEP_KEYS } from "@/features/onboarding-v2/guided/steps";
import { filterGuidedAnalysisRecommendations } from "../app/dashboard/onboarding-v2/[sessionId]/summary/page";
import type { AiRecommendationRecord } from "@/features/ai/server/types";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function recommendation(overrides: Partial<AiRecommendationRecord>): AiRecommendationRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    shop_id: "shop-1",
    domain: "shop_boost",
    recommendation_type: "launch_improvement",
    subject_type: "shop",
    subject_id: null,
    title: "Improve launch readiness",
    summary: "Review imported data before launch.",
    status: "open",
    priority: "normal",
    confidence: 0.75,
    risk_tier: "low",
    evidence_snapshot_id: null,
    evidence_snapshot_ids: [],
    missing_data: [],
    recommended_action: {},
    side_effects: [],
    requires_approval: false,
    requires_owner_pin: false,
    source: "manual",
    source_run_id: null,
    created_by: "user-1",
    assigned_to: null,
    dismissed_by: null,
    dismissed_at: null,
    resolved_by: null,
    resolved_at: null,
    expires_at: null,
    created_at: "2026-07-09T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("guided onboarding AI Business Analysis page", () => {
  it("renders the static seven guidance categories in order", () => {
    const source = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");

    expect(source).toContain("Inspection templates first");
    expect(source).toContain("Menu items and canned services second");
    expect(source).toContain("Inventory improvements");
    expect(source).toContain("Vendor suggestions");
    expect(source).toContain("Customer and fleet segments");
    expect(source).toContain("Maintenance packages");
    expect(source).toContain("Automation rules");
    expect(source.indexOf("Inspection templates first")).toBeLessThan(source.indexOf("Menu items and canned services second"));
  });

  it("renders the empty state when no recommendations exist", () => {
    const source = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");

    expect(source).toContain("No AI Business Analysis has been generated yet");
    expect(source).toContain("Your imported onboarding data is ready");
  });

  it("filters existing shop-scoped recommendations for onboarding before falling back to shop_boost", () => {
    const matches = filterGuidedAnalysisRecommendations([
      recommendation({ id: "shop-boost", domain: "shop_boost" }),
      recommendation({ id: "onboarding-domain", domain: "onboarding" }),
      recommendation({ id: "session-subject", subject_type: "guided_onboarding_session", subject_id: "session-123" }),
      recommendation({ id: "session-metadata", metadata: { guidedSessionId: "session-123" } }),
      recommendation({ id: "other", domain: "work_orders" }),
    ], "session-123");

    expect(matches.map((item) => item.id)).toEqual(["onboarding-domain", "session-subject", "session-metadata"]);

    const fallback = filterGuidedAnalysisRecommendations([
      recommendation({ id: "shop-boost", domain: "shop_boost" }),
      recommendation({ id: "other", domain: "work_orders" }),
    ], "session-123");

    expect(fallback.map((item) => item.id)).toEqual(["shop-boost"]);
  });

  it("renders existing recommendation fields and links to the shared review center", () => {
    const source = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");

    expect(source).toContain("Current recommendations");
    expect(source).toContain("recommendation.title");
    expect(source).toContain("recommendation.summary");
    expect(source).toContain("recommendation.domain");
    expect(source).toContain("recommendation.recommendation_type");
    expect(source).toContain("recommendation.priority");
    expect(source).toContain("formatConfidence(recommendation.confidence)");
    expect(source).toContain("recommendation.risk_tier");
    expect(source).toContain("recommendation.status");
    expect(source).toContain("jsonHasContent(recommendation.missing_data)");
    expect(source).toContain('href="/dashboard/ai-recommendations"');
  });

  it("does not add generation or POST behavior", () => {
    const source = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");

    expect(source).not.toContain("method: \"POST\"");
    expect(source).not.toContain("method: 'POST'");
    expect(source).not.toContain("Run Analysis");
    expect(source).not.toContain("createAiRecommendation");
    expect(source).not.toContain("insert(");
  });

  it("keeps Staff removed and Shop Settings before AI Analysis", () => {
    expect(GUIDED_ONBOARDING_STEP_KEYS).toEqual([
      "customers",
      "vehicles",
      "vehicle_history",
      "invoices",
      "parts",
      "shop_settings",
      "analysis",
    ]);
    expect(GUIDED_ONBOARDING_STEP_KEYS).not.toContain("staff");
  });
});
