import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDED_ONBOARDING_STEP_KEYS } from "@/features/onboarding-v2/guided/steps";
import { filterGuidedAnalysisRecommendations } from "@/features/onboarding-v2/analysis/filterGuidedAnalysisRecommendations";
import { buildExecutiveSummary, calculateLaunchReadinessScore, READINESS_SCORE_WEIGHTS } from "@/features/onboarding-v2/analysis/buildExecutiveSummary";
import type { AiRecommendationRecord } from "@/features/ai/server/types";
import type { GuidedOnboardingEvidence } from "@/features/onboarding-v2/analysis/server";

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
  it("renders a polished executive summary instead of the static category database view", () => {
    const source = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");

    expect(source).toContain("AI Executive Summary");
    expect(source).toContain("Business snapshot");
    expect(source).toContain("What ProFixIQ learned");
    expect(source).toContain("Highest-impact opportunities");
    expect(source).toContain("Continue to Shop Activation");
    expect(source).not.toContain("Reviewable AI Business Analysis signals");
  });

  it("renders the empty state when no recommendations exist without showing a fake score", () => {
    const source = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");

    expect(source).toContain("What the analysis will review");
    expect(source).toContain("No launch score, observations, or priorities are shown until recommendations exist");
    expect(source).toContain("No readiness score is shown until analysis has been run");
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

  it("does not render raw recommendation metadata on onboarding and links priorities to the shared review center", () => {
    const source = read("app/dashboard/onboarding-v2/[sessionId]/summary/page.tsx");

    expect(source).toContain("summary.priorities.map");
    expect(source).toContain("Review recommendation");
    expect(source).toContain('href="/dashboard/ai-recommendations"');
    expect(source).not.toContain("recommendation.domain");
    expect(source).not.toContain("recommendation.recommendation_type");
    expect(source).not.toContain("recommendation.subject_type");
    expect(source).not.toContain("recommendation.risk_tier");
    expect(source).not.toContain("recommendation.status");
    expect(source).not.toContain("recommended_action");
    expect(source).not.toContain("guided_onboarding_analysis");
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

    for (const table of ["customers", "vehicles", "history", "invoices", "parts", "stock_moves", "inspection_templates", "menu_items", "shop_hours", "shops"]) {
      expect(source).toContain(`\"${table}\"`);
    }
    expect(source).toContain('select("id", { count: "exact", head: true })');
    expect(source).toContain(", 500,");
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


const baseEvidence: GuidedOnboardingEvidence = {
  customerCount: 42,
  vehicleCount: 57,
  historyCount: 88,
  invoiceCount: 21,
  partsCount: 130,
  lowStockPartsCount: 12,
  zeroStockPartsCount: 4,
  partsMissingVendorCount: 8,
  partsWithVendorCount: 80,
  partsMissingCategoryCount: 9,
  vendorCount: 6,
  yearsOfHistory: 3.5,
  commonServiceCategories: ["Brakes", "Oil service"],
  commonJobs: ["Brake inspection", "Oil change", "Tire rotation"],
  inspectionTemplateCount: 1,
  menuItemCount: 2,
  shopSettings: { laborRateConfigured: true, hoursConfigured: true, shopSuppliesConfigured: true, taxRateConfigured: true, workflowDefaultsConfigured: false },
};

describe("guided onboarding executive summary builder", () => {
  it("uses actual evidence counts in the analyzed snapshot", () => {
    const summary = buildExecutiveSummary(baseEvidence, [recommendation({ id: "r1", priority: "high", metadata: { category: "Inventory improvements" } })]);

    expect(summary.analyzed).toMatchObject({ customers: 42, vehicles: 57, historyRecords: 88, invoices: 21, parts: 130, vendors: 6, yearsOfHistory: 3.5 });
  });

  it("uses the documented deterministic readiness weights and clamps the score to 0-100", () => {
    const score = calculateLaunchReadinessScore(baseEvidence);

    expect(READINESS_SCORE_WEIGHTS.customersImported).toBe(10);
    expect(score).toBe(92);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("shows honest fallback language when categorized service evidence is missing", () => {
    const summary = buildExecutiveSummary({ ...baseEvidence, historyCount: 0, invoiceCount: 0, commonJobs: [], commonServiceCategories: [] }, []);

    expect(summary.observations.some((item) => item.description.includes("There is not yet enough categorized service history"))).toBe(true);
    expect(summary.priorities).toHaveLength(0);
  });

  it("limits ranked priorities to three", () => {
    const summary = buildExecutiveSummary(baseEvidence, [
      recommendation({ id: "r1", priority: "low" }),
      recommendation({ id: "r2", priority: "high" }),
      recommendation({ id: "r3", priority: "normal" }),
      recommendation({ id: "r4", priority: "urgent" }),
    ]);

    expect(summary.priorities).toHaveLength(3);
    expect(summary.priorities.map((item) => item.rank)).toEqual([1, 2, 3]);
  });
});

describe("guided onboarding evidence canonical sources", () => {
  it("uses history as the canonical service-history source instead of active work_order_lines", () => {
    const source = read("features/onboarding-v2/analysis/server.ts");

    expect(source).toContain('countRows(supabase, "history", shopId');
    expect(source).toContain('sampleColumn(supabase, "history", shopId');
    expect(source).not.toContain('countRows(supabase, "work_order_lines"');
    expect(source).not.toContain('sampleColumn(supabase, "work_order_lines"');
  });

  it("counts only historical invoice CSV imports for the onboarding invoice snapshot", () => {
    const source = read("features/onboarding-v2/analysis/server.ts");

    expect(source).toContain('countRows(supabase, "invoices", shopId, (q) => q.contains("metadata", { import_type: "invoice_csv" })');
    expect(source).toContain('"historical invoice_csv count"');
  });

  it("uses canonical parts rows and stock movement totals without counting stock-location joins as parts", () => {
    const source = read("features/onboarding-v2/analysis/server.ts");

    expect(source).toContain('countRows(supabase, "parts", shopId, undefined, "canonical inventory part count")');
    expect(source).toContain('sampleColumn(supabase, "stock_moves", shopId, "part_id,qty_change"');
    expect(source).toContain('stockByPart.set(partId, (stockByPart.get(partId) ?? 0) + Number(move.qty_change ?? 0))');
    expect(source).not.toContain('countRows(supabase, "v_part_stock"');
    expect(source).not.toContain('countRows(supabase, "stock_locations"');
  });

  it("derives vendor coverage from imported part supplier strings before showing zero vendors", () => {
    const source = read("features/onboarding-v2/analysis/server.ts");

    expect(source).toContain('normalizedVendors.size > 0 ? normalizedVendors.size');
    expect(source).toContain('typeof p.supplier === "string"');
    expect(source).not.toContain('q.or("vendor.is.null,vendor.eq.")');
  });

  it("keeps failed optional evidence queries from becoming silent confident zeroes", () => {
    const source = read("features/onboarding-v2/analysis/server.ts");

    expect(source).toContain('EvidenceQueryResult');
    expect(source).toContain('evidenceWarnings');
    expect(source).toContain('warnEvidenceQuery');
    expect(source).toContain('reliable: false');
  });

  it("readiness naturally increases when canonical history and parts are present", () => {
    const suppressed = calculateLaunchReadinessScore({ ...baseEvidence, historyCount: 0, partsCount: 0 });
    const corrected = calculateLaunchReadinessScore({ ...baseEvidence, historyCount: 7343, partsCount: 228 });

    expect(corrected - suppressed).toBe(READINESS_SCORE_WEIGHTS.serviceHistoryPresent + READINESS_SCORE_WEIGHTS.partsPresent);
  });
});
