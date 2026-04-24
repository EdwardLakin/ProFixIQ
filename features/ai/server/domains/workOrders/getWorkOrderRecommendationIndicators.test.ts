import { describe, expect, it } from "vitest";
import {
  aggregateWorkOrderRecommendationIndicators,
} from "@/features/ai/server/domains/workOrders/getWorkOrderRecommendationIndicators";

describe("getWorkOrderRecommendationIndicators", () => {
  it("aggregates only open/acknowledged rows and computes priority/risk", () => {
    const result = aggregateWorkOrderRecommendationIndicators({
      recommendations: [
        {
          id: "rec-1",
          subject_id: "wo-1",
          status: "acknowledged",
          priority: "high",
          risk_tier: "medium",
          recommendation_type: "parts_delay_vendor_eta_missing",
          title: "Parts ETA missing",
          created_at: "2026-04-20T00:00:00.000Z",
          missing_data: ["eta"],
        },
        {
          id: "rec-2",
          subject_id: "wo-1",
          status: "open",
          priority: "urgent",
          risk_tier: "high",
          recommendation_type: "closeout_risk_unapproved_labor",
          title: "Closeout review needed",
          created_at: "2026-04-21T00:00:00.000Z",
          missing_data: [],
        },
      ],
      previewRecommendationIds: new Set(["rec-2"]),
    });

    expect(result["wo-1"]).toMatchObject({
      totalActive: 2,
      urgentCount: 1,
      highCount: 1,
      acknowledgedCount: 1,
      missingDataCount: 1,
      highestPriority: "urgent",
      highestRiskTier: "high",
      hasCloseoutRisk: true,
      hasPartsDelay: true,
      hasDispatchReview: false,
      hasPreviewReady: true,
      previewReadyCount: 1,
      topRecommendationType: "closeout_risk_unapproved_labor",
      topRecommendationTitle: "Closeout review needed",
    });
  });

  it("derives dispatch flag and returns empty for empty list", () => {
    const empty = aggregateWorkOrderRecommendationIndicators({
      recommendations: [],
      previewRecommendationIds: new Set(),
    });

    expect(empty).toEqual({});

    const result = aggregateWorkOrderRecommendationIndicators({
      recommendations: [
        {
          id: "rec-3",
          subject_id: "wo-2",
          status: "open",
          priority: "normal",
          risk_tier: "critical",
          recommendation_type: "technician_dispatch_load_imbalance",
          title: "Dispatch review",
          created_at: "2026-04-22T00:00:00.000Z",
          missing_data: [],
        },
      ],
      previewRecommendationIds: new Set(),
    });

    expect(result["wo-2"]?.hasDispatchReview).toBe(true);
    expect(result["wo-2"]?.highestRiskTier).toBe("critical");

    const keys = Object.keys(result["wo-2"] ?? {});
    expect(keys).not.toContain("recommended_action");
    expect(keys).not.toContain("snapshot");
    expect(keys).not.toContain("evidence");
  });
});
