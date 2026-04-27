import { describe, expect, it } from "vitest";
import type { OnboardingAgentInput, OnboardingAgentReport } from "@/features/onboarding-agent/lib/agentTypes";
import {
  buildDeterministicFallbackReport,
  sanitizeAgentReport,
} from "@/features/onboarding-agent/server/runOnboardingAgentAnalysis";

function makeInput(reviewSeverity: "blocking" | "high" = "blocking"): OnboardingAgentInput {
  return {
    sessionId: "session-1",
    shopId: "shop-1",
    files: [
      {
        id: "file-1",
        filename: "customers.csv",
        declaredDomain: "customers",
        detectedDomain: "customers",
        parseStatus: "parsed",
        headers: ["Customer ID", "Name"],
        rowCount: 12,
        sampleRows: [{ id: "row-1", name: "Jane" }],
      },
    ],
    deterministicDomainDetections: { customers: 1 },
    deterministicStagedEntityCounts: { customer: 10, vehicle: 5 },
    deterministicLinkCounts: { customer_vehicle: 4 },
    deterministicReviewItems: [
      {
        id: "review-1",
        severity: reviewSeverity,
        domain: "vehicles",
        summary: "Missing vehicle linkage",
        issueType: "missing_link",
        entityId: "entity-1",
        details: {},
      },
    ],
    activationPlanSummary: null,
  };
}

describe("onboarding agent ai safeguards", () => {
  it("deterministic fallback produces a non-empty report", () => {
    const report = buildDeterministicFallbackReport(makeInput());
    expect(report.summary.length).toBeGreaterThan(10);
    expect(report.domainSummaries.length).toBeGreaterThan(0);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.liveRecordsCreated).toBe(0);
  });

  it("malformed ai json falls back safely", () => {
    const fallback = buildDeterministicFallbackReport(makeInput());
    const report = sanitizeAgentReport({
      candidate: "not-json",
      fallback,
      validEntityIds: new Set(["entity-1"]),
      validRowIds: new Set(["row-1"]),
    });
    expect(report.mode).toBe("deterministic_fallback");
    expect(report.summary).toBe(fallback.summary);
  });

  it("sanitizer removes invalid ids", () => {
    const fallback = buildDeterministicFallbackReport(makeInput());
    const candidate: Partial<OnboardingAgentReport> = {
      mode: "ai",
      summary: "test",
      domainSummaries: [],
      findings: [],
      recommendations: [
        {
          actionType: "review_exception",
          domain: "customers",
          confidence: 0.9,
          title: "Review",
          explanation: "x",
          affectedEntityIds: ["entity-1", "entity-2"],
          affectedRowIds: ["row-1", "row-2"],
          riskLevel: "low",
        },
      ],
      activationReadiness: {
        status: "review_required",
        blockers: [],
        warnings: [],
        safeToProceed: true,
      },
      model: "gpt-test",
      generatedAt: new Date().toISOString(),
      liveRecordsCreated: 9 as never,
    };

    const report = sanitizeAgentReport({
      candidate,
      fallback,
      validEntityIds: new Set(["entity-1"]),
      validRowIds: new Set(["row-1"]),
    });

    expect(report.recommendations[0].affectedEntityIds).toEqual(["entity-1"]);
    expect(report.recommendations[0].affectedRowIds).toEqual(["row-1"]);
    expect(report.liveRecordsCreated).toBe(0);
  });

  it("activation readiness is not ready with blocking items", () => {
    const report = buildDeterministicFallbackReport(makeInput("blocking"));
    expect(report.activationReadiness.status).toBe("not_ready");
    expect(report.activationReadiness.safeToProceed).toBe(false);
  });

  it("activation readiness is ready_for_dry_run with no blocking items", () => {
    const input = makeInput("high");
    input.deterministicReviewItems = [];
    const report = buildDeterministicFallbackReport(input);
    expect(report.activationReadiness.status).toBe("ready_for_dry_run");
    expect(report.activationReadiness.safeToProceed).toBe(true);
  });

  it("no report can set liveRecordsCreated above zero", () => {
    const fallback = buildDeterministicFallbackReport(makeInput());
    const report = sanitizeAgentReport({
      candidate: {
        ...fallback,
        mode: "ai",
        liveRecordsCreated: 4,
      },
      fallback,
      validEntityIds: new Set(["entity-1"]),
      validRowIds: new Set(["row-1"]),
    });

    expect(report.liveRecordsCreated).toBe(0);
  });
});
