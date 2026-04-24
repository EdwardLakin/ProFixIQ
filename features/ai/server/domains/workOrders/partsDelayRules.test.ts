import { describe, expect, it } from "vitest";
import type { WorkOrderPartsDelayEvidence } from "./types";
import { buildPartsDelayRecommendations, evaluateWorkOrderPartsDelayRisk } from "./partsDelayRules";

function baseEvidence(overrides: Partial<WorkOrderPartsDelayEvidence> = {}): WorkOrderPartsDelayEvidence {
  return {
    workOrderId: "wo-1",
    shopId: "shop-1",
    generatedAt: "2026-04-24T00:00:00.000Z",
    partsLinked: true,
    requestedPartsCount: 2,
    allocatedPartsCount: 2,
    receivedPartsCount: 2,
    unavailablePartsCount: 0,
    waitingPartsCount: 0,
    backorderedPartsCount: null,
    unknownAvailabilityCount: 0,
    openPurchaseOrderCount: 0,
    overduePurchaseOrderCount: 0,
    etaMissingCount: 0,
    stalePartsRequestCount: 0,
    vendorReliabilityAvailable: false,
    linePartSignalsDetected: false,
    missingData: [],
    sourceRefs: [{ table: "work_orders", id: "wo-1" }],
    confidence: 0.92,
    ...overrides,
  };
}

describe("partsDelayRules", () => {
  it("keeps missing ETA/backorder as missing_data markers instead of faking values", () => {
    const evidence = baseEvidence({
      missingData: ["unsupported_eta_signal", "unsupported_backorder_signal"],
    });

    const risks = evaluateWorkOrderPartsDelayRisk(evidence);
    expect(risks.length).toBe(0);

    const recs = buildPartsDelayRecommendations({
      evidence: baseEvidence({
        unavailablePartsCount: 1,
        missingData: ["unsupported_eta_signal", "unsupported_backorder_signal"],
      }),
      evidenceSnapshotId: "evidence-1",
    });

    expect(recs[0]?.missing_data).toContain("unsupported_eta_signal");
    expect(recs[0]?.missing_data).toContain("unsupported_backorder_signal");
  });

  it("creates advisory risk for unavailable or unknown parts state", () => {
    const risks = evaluateWorkOrderPartsDelayRisk(
      baseEvidence({
        unavailablePartsCount: 1,
        unknownAvailabilityCount: 1,
        allocatedPartsCount: 0,
        waitingPartsCount: 2,
      }),
    );

    expect(risks.some((risk) => risk.risk_code === "parts_waiting_on_unavailable_items")).toBe(true);
    expect(risks.every((risk) => risk.advisory_only)).toBe(true);
  });

  it("returns no risk for complete received allocated state", () => {
    const risks = evaluateWorkOrderPartsDelayRisk(baseEvidence());
    expect(risks).toHaveLength(0);
  });

  it("only triggers stale request rule when stale timestamp evidence is present", () => {
    const noStale = evaluateWorkOrderPartsDelayRisk(baseEvidence({ stalePartsRequestCount: 0 }));
    const stale = evaluateWorkOrderPartsDelayRisk(baseEvidence({ stalePartsRequestCount: 2 }));

    expect(noStale.some((risk) => risk.risk_code === "parts_request_stale")).toBe(false);
    expect(stale.some((risk) => risk.risk_code === "parts_request_stale")).toBe(true);
  });

  it("builds advisory-only recommendations with no ordering actions and bounded confidence", () => {
    const recommendations = buildPartsDelayRecommendations({
      evidence: baseEvidence({
        confidence: 1.5,
        unavailablePartsCount: 1,
        waitingPartsCount: 1,
      }),
      evidenceSnapshotId: "evidence-1",
    });

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every((item) => item.metadata?.advisory_only === true)).toBe(true);
    expect(recommendations.every((item) => item.recommended_action.action_type !== "order_parts")).toBe(true);
    expect(recommendations.every((item) => item.confidence >= 0 && item.confidence <= 1)).toBe(true);
  });
});
