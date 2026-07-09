import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDED_ONBOARDING_STEP_KEYS } from "@/features/onboarding-v2/guided/steps";
import { filterGuidedAnalysisRecommendations } from "@/features/onboarding-v2/analysis/filterGuidedAnalysisRecommendations";
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

  it("keeps recommendation creation out of the server-rendered page", () => {
    const source = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");

    expect(source).not.toContain("createAiRecommendation");
    expect(source).not.toContain("insert(");
    expect(source).not.toContain("runGuidedOnboardingAnalysis(");
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

describe("guided onboarding deterministic analysis phase 2", () => {
  it("adds an explicit run button without running analysis automatically on page load", () => {
    const pageSource = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");
    const buttonSource = read("app/dashboard/onboarding-v2/[sessionId]/summary/RunAnalysisButton.tsx");

    expect(pageSource).toContain("<RunAnalysisButton");
    expect(buttonSource).toContain("Run AI Business Analysis");
    expect(buttonSource).toContain("Re-run analysis");
    expect(buttonSource).toContain("method: \"POST\"");
    expect(pageSource).not.toContain("runGuidedOnboardingAnalysis(");
  });

  it("adds a shop-scoped POST route that verifies session and analysis step access", () => {
    const source = read("app/api/onboarding-v2/guided/sessions/[sessionId]/analysis/route.ts");

    expect(source).toContain("export async function POST");
    expect(source).toContain("requireShopScopedApiAccess({ allowRoles: [\"owner\", \"admin\"] })");
    expect(source).toContain('.from("guided_onboarding_sessions")');
    expect(source).toContain('.eq("shop_id", shopId)');
    expect(source).toContain('.from("guided_onboarding_steps")');
    expect(source).toContain('.eq("step_key", "analysis")');
    expect(source).toContain("analysis_run_completed");
  });

  it("collects bounded deterministic shop evidence and never calls an AI provider", () => {
    const source = read("features/onboarding-v2/analysis/server.ts");

    for (const table of ["customers", "vehicles", "work_order_lines", "invoices", "parts", "inspection_templates", "menu_items", "shop_hours", "shops"]) {
      expect(source).toContain(`\"${table}\"`);
    }
    expect(source).toContain('select("id", { count: "exact", head: true })');
    expect(source).toContain(", 200)");
    expect(source).toContain("deterministic: true");
    expect(source).toContain("noAutoCreate: true");
    expect(source).not.toMatch(/openai|anthropic|chat\.completions|responses\.create|generateText/i);
  });

  it("creates onboarding session recommendations with idempotent duplicate checks", () => {
    const source = read("features/onboarding-v2/analysis/server.ts");

    expect(source).toContain('GUIDED_ANALYSIS_DOMAIN = "onboarding"');
    expect(source).toContain('GUIDED_ANALYSIS_SUBJECT_TYPE = "guided_onboarding_session"');
    expect(source).toContain('GUIDED_ANALYSIS_SOURCE = "guided_onboarding_analysis"');
    expect(source).toContain("createAiRecommendation");
    expect(source).toContain('.eq("recommendation_type", recommendationType)');
    expect(source).toContain('.in("status", DUPLICATE_STATUSES)');
    expect(source).toContain("skippedCount");
    expect(source).toContain("sideEffects: []");
    expect(source).toContain("autoCreate: false");
  });

  it("generates only the seven reviewable category families", () => {
    const source = read("features/onboarding-v2/analysis/server.ts");

    expect(source).toContain("Inspection templates first");
    expect(source).toContain("Menu items and canned services second");
    expect(source).toContain("Inventory improvements");
    expect(source).toContain("Vendor suggestions");
    expect(source).toContain("Customer and fleet segments");
    expect(source).toContain("Maintenance packages");
    expect(source).toContain("Automation rules");
  });
});
