import { describe, expect, it } from "vitest";
import { buildShopBoostAiEvidence } from "./buildShopBoostEvidenceSnapshot";

describe("buildShopBoostAiEvidence", () => {
  it("handles missing linkage fields safely and reports missingData", () => {
    const evidence = buildShopBoostAiEvidence({
      shopId: "shop-1",
      intake: {
        id: "intake-1",
        shop_id: "shop-1",
        status: "completed",
        created_at: "2026-04-24T00:00:00.000Z",
        processed_at: null,
        intake_basics: {},
      },
      suggestionCounts: { menuCount: 0, inspectionCount: 0, staffCount: 0, menuHigh: 0, inspectionHigh: 0 },
    });

    expect(evidence.linkageSummary.unresolvedVehicles).toBeNull();
    expect(evidence.missingData).toContain("linkage_unresolved_counts_missing");
    expect(evidence.confidence).toBeGreaterThanOrEqual(0);
    expect(evidence.confidence).toBeLessThanOrEqual(1);
  });
});
