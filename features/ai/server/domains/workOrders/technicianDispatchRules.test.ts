import { describe, expect, it } from "vitest";
import type { WorkOrderTechnicianDispatchEvidence } from "./types";
import { buildTechnicianDispatchRecommendations, evaluateWorkOrderTechnicianDispatchRisk } from "./technicianDispatchRules";

function baseEvidence(overrides: Partial<WorkOrderTechnicianDispatchEvidence> = {}): WorkOrderTechnicianDispatchEvidence {
  return {
    workOrderId: "wo-1",
    shopId: "shop-1",
    generatedAt: "2026-04-24T00:00:00.000Z",
    lineCount: 3,
    actionableLineCount: 2,
    unassignedActionableLineCount: 0,
    assignedTechnicianIds: ["tech-1"],
    activeTechnicianIds: ["tech-1"],
    activeLaborSegmentCount: 1,
    staleActiveLaborCount: 0,
    highPriorityLineCount: 0,
    urgentPriorityLineCount: 0,
    blockedLineCount: 0,
    waitingLineCount: 0,
    scheduleDataAvailable: true,
    timeOffDataAvailable: true,
    certificationDataAvailable: true,
    laborHistoryAvailable: true,
    technicianLoadAvailable: true,
    unavailableAssignedTechCount: 0,
    overloadedTechCount: 0,
    certRelevantLineCount: 0,
    assignedWithoutActiveCertCount: 0,
    missingData: [],
    sourceRefs: [{ table: "work_order_lines", id: "wo-1" }],
    confidence: 0.9,
    ...overrides,
  };
}

describe("technicianDispatchRules", () => {
  it("creates advisory risk for unassigned actionable lines", () => {
    const risks = evaluateWorkOrderTechnicianDispatchRisk(baseEvidence({ unassignedActionableLineCount: 1 }));
    expect(risks.some((risk) => risk.risk_code === "unassigned_actionable_lines")).toBe(true);
    expect(risks.every((risk) => risk.advisory_only)).toBe(true);
  });

  it("raises severity when urgent/high-priority unassigned lines exist", () => {
    const risks = evaluateWorkOrderTechnicianDispatchRisk(
      baseEvidence({ unassignedActionableLineCount: 1, urgentPriorityLineCount: 1 }),
    );
    const risk = risks.find((item) => item.risk_code === "high_priority_unassigned");
    expect(risk?.severity).toBe("high");
  });

  it("only triggers stale active labor when stale timestamps are present", () => {
    const clean = evaluateWorkOrderTechnicianDispatchRisk(baseEvidence({ staleActiveLaborCount: 0 }));
    const stale = evaluateWorkOrderTechnicianDispatchRisk(baseEvidence({ staleActiveLaborCount: 1 }));
    expect(clean.some((risk) => risk.risk_code === "active_labor_stale")).toBe(false);
    expect(stale.some((risk) => risk.risk_code === "active_labor_stale")).toBe(true);
  });

  it("only triggers unavailable assignee risk when schedule/time-off support exists", () => {
    const unsupported = evaluateWorkOrderTechnicianDispatchRisk(
      baseEvidence({ scheduleDataAvailable: false, timeOffDataAvailable: false, unavailableAssignedTechCount: 2 }),
    );
    const supported = evaluateWorkOrderTechnicianDispatchRisk(
      baseEvidence({ scheduleDataAvailable: true, unavailableAssignedTechCount: 1 }),
    );

    expect(unsupported.some((risk) => risk.risk_code === "assigned_tech_unavailable")).toBe(false);
    expect(supported.some((risk) => risk.risk_code === "assigned_tech_unavailable")).toBe(true);
  });

  it("uses missing_data when certification signals are unavailable", () => {
    const risks = evaluateWorkOrderTechnicianDispatchRisk(
      baseEvidence({
        certificationDataAvailable: false,
        certRelevantLineCount: 2,
        assignedWithoutActiveCertCount: 2,
        missingData: ["missing_certification_data"],
      }),
    );

    expect(risks.some((risk) => risk.risk_code === "certification_review_needed")).toBe(false);

    const recs = buildTechnicianDispatchRecommendations({
      evidence: baseEvidence({
        unassignedActionableLineCount: 1,
        missingData: ["missing_certification_data"],
      }),
      evidenceSnapshotId: "evidence-1",
    });
    expect(recs[0]?.missing_data).toContain("missing_certification_data");
  });

  it("returns no risk when actionable lines are assigned and dispatch state is clean", () => {
    const risks = evaluateWorkOrderTechnicianDispatchRisk(baseEvidence());
    expect(risks).toHaveLength(0);
  });

  it("builds advisory-only recommendations with no auto-assignment action and bounded confidence", () => {
    const recs = buildTechnicianDispatchRecommendations({
      evidence: baseEvidence({
        confidence: 1.8,
        unassignedActionableLineCount: 2,
      }),
      evidenceSnapshotId: "evidence-1",
    });

    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((rec) => rec.metadata?.advisory_only === true)).toBe(true);
    expect(recs.every((rec) => rec.recommended_action.action_type === "review_technician_dispatch")).toBe(true);
    expect(recs.every((rec) => rec.confidence >= 0 && rec.confidence <= 1)).toBe(true);
  });
});
