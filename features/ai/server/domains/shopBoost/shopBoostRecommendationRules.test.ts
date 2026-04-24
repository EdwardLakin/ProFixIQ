import { describe, expect, it } from "vitest";
import { buildShopBoostPostActivationRecommendations } from "./shopBoostRecommendationRules";
import type { ShopBoostAiEvidence } from "./types";

function baseEvidence(overrides: Partial<ShopBoostAiEvidence> = {}): ShopBoostAiEvidence {
  return {
    shopId: "shop-1",
    intakeId: "intake-1",
    sourceRunId: "run-1",
    activationStatus: "activated",
    readinessStatus: "READY",
    generatedAt: "2026-04-24T00:00:00.000Z",
    confidence: 0.82,
    confidenceSummary: { trustScore: 0.82, trustMessage: "ok", confidenceScore: 0.82 },
    linkageSummary: {
      customersLinked: 10,
      vehiclesLinked: 10,
      workOrdersLinked: 8,
      invoicesLinked: 6,
      unresolvedCustomers: 0,
      unresolvedVehicles: 0,
      unresolvedWorkOrders: 0,
      unresolvedInvoices: 0,
    },
    suggestionsSummary: {
      inspectionTemplateSuggestions: 2,
      inspectionTemplateHighConfidenceCount: 1,
      menuItemSuggestions: 2,
      menuItemHighConfidenceCount: 1,
      staffSuggestions: 1,
      customerSuggestions: null,
      historySuggestions: null,
      highConfidenceCount: 2,
      reviewNeededCount: 0,
    },
    roiImpactSummary: {
      estimatedMonthlyImpact: 1200,
      approvalSpeedGain: 10,
      laborRecoveryHours: 4,
      partsLeakageReduction: 5,
      confidence: 0.75,
    },
    unresolvedDataCategories: [],
    staleOrUnscopedSuggestionWarnings: [],
    sourceRefs: [{ table: "shop_boost_intakes", id: "intake-1" }],
    missingData: [],
    ...overrides,
  };
}

describe("buildShopBoostPostActivationRecommendations", () => {
  it("creates high-confidence review recommendations only (no materialization action)", () => {
    const recs = buildShopBoostPostActivationRecommendations({
      evidence: baseEvidence(),
      evidenceSnapshotId: "evidence-1",
    });

    expect(recs.some((r) => r.recommendation_type === "shop_boost_review_high_confidence_inspection_templates")).toBe(true);
    expect(recs.some((r) => r.recommendation_type === "shop_boost_review_high_confidence_menu_items")).toBe(true);
    expect(recs.every((r) => !String(r.summary).toLowerCase().includes("auto-create"))).toBe(true);
    expect(recs.every((r) => !String(r.summary).toLowerCase().includes("materialize now"))).toBe(true);
    expect(recs.every((r) => r.metadata.advisory_only)).toBe(true);
    expect(recs.every((r) => r.confidence >= 0 && r.confidence <= 1)).toBe(true);
  });

  it("creates unresolved linkage recommendation when unresolved linkage exists", () => {
    const recs = buildShopBoostPostActivationRecommendations({
      evidence: baseEvidence({
        linkageSummary: {
          ...baseEvidence().linkageSummary,
          unresolvedWorkOrders: 3,
        },
      }),
      evidenceSnapshotId: "evidence-1",
    });

    expect(recs.some((r) => r.recommendation_type === "shop_boost_review_unresolved_import_links")).toBe(true);
  });
});
