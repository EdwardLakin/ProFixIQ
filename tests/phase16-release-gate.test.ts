import { describe, expect, it } from "vitest";

import {
  CATEGORY_WEIGHTS,
  REQUIRED_LIFECYCLES,
  REQUIRED_PHASES,
  REQUIRED_PRODUCTS,
  REQUIRED_ROLES,
  REQUIRED_VIEWPORTS,
  createEvidenceTemplate,
  evaluateReleaseEvidence,
  renderReleaseReport,
} from "../scripts/release-validation/phase16-gate.mjs";

function passingEvidence() {
  const sha = "a".repeat(40);
  return {
    schemaVersion: 1,
    runId: "QA-20260823-P16",
    candidate: {
      sha,
      environment: "production-candidate",
      deployed: true,
      rollback: {
        previousStableSha: "b".repeat(40),
        owner: "release-lead",
        runbook: "docs/ops/release-rollback.md",
        applicationRollbackVerified: true,
        databaseStrategy: "forward-only",
        postRollbackSmokePassed: true,
      },
    },
    execution: {
      candidateSha: sha,
      startedAt: "2026-08-23T09:00:00.000Z",
      completedAt: "2026-08-23T10:00:00.000Z",
      operator: "release-lead",
    },
    prerequisites: REQUIRED_PHASES.map((phase) => ({
      phase,
      pr: 1500 + phase,
      status: "merged",
      deployed: true,
      headSha: String(phase).repeat(40).slice(0, 40),
    })),
    defects: [
      {
        id: "PFX-TEST",
        severity: "Sev-2",
        status: "closed",
        automatedRegressionPassed: true,
        liveRegressionPassed: true,
      },
    ],
    scores: Object.fromEntries(
      Object.entries(CATEGORY_WEIGHTS).map(([category, maximum]) => [category, maximum]),
    ),
    lifecycles: REQUIRED_LIFECYCLES.map((id) => ({ id, status: "pass" })),
    products: REQUIRED_PRODUCTS.map((id) => ({ id, status: "pass" })),
    refreshRuns: Array.from({ length: 10 }, (_, index) => ({
      sequence: index + 1,
      candidateSha: sha,
      status: "pass",
      refreshPassed: true,
      coldNavigationPassed: true,
      backForwardPassed: true,
      consoleErrors: [] as string[],
      unexplainedFailedRequests: [] as string[],
    })),
    roles: REQUIRED_ROLES.map((id) => ({
      id,
      plans: ["Pro", "Starter"],
      navigationPassed: true,
      allowedActionsPassed: true,
      prohibitedUiPassed: true,
      prohibitedDirectRoutesPassed: true,
      serverDenialsPassed: true,
      crossTenantReplayPassed: true,
      sessionRevocationPassed: true,
    })),
    planGates: ["Pro", "Starter"].map((plan) => ({
      plan,
      uiPassed: true,
      serverPassed: true,
      noPartialDataPassed: true,
    })),
    viewports: REQUIRED_VIEWPORTS.map((id) => ({
      id,
      status: "pass",
      noHorizontalOverflow: true,
    })),
    offline: {
      status: "pass",
      reconnectPassed: true,
      noStaleProtectedDataPassed: true,
    },
    search: {
      status: "pass",
      caseCoveragePassed: true,
      productsCoveragePassed: true,
    },
    performance: {
      status: "pass",
      feedbackWithin100MsPassed: true,
      routeBudgetPassed: true,
      noStaleMutableDataPassed: true,
    },
    accessibility: {
      status: "pass",
      keyboardPassed: true,
      touchTargetsPassed: true,
      dialogsPassed: true,
    },
    payment: {
      status: "pass",
      sandboxOnly: true,
      noRealChargePassed: true,
    },
    diagnostics: {
      networkObserved: true,
      consoleErrors: [] as string[],
      unexplainedFailedRequests: [] as string[],
    },
    cleanup: {
      scopeConfirmed: true,
      records: [
        { id: "QA-20260823-P16-WO", state: "archived" },
        { id: "QA-20260823-P16-request", state: "deleted", deletionConfirmed: true },
      ],
    },
    topRisks: [{ id: "RISK-1", summary: "Observed and mitigated", releaseBlocking: false }],
    prioritizedFixes: [] as Array<{ priority: string; summary: string }>,
    coverageGaps: [] as Array<{ summary: string }>,
  };
}

describe("Phase 16 release and rollback gate", () => {
  it("creates a complete fail-closed evidence template", () => {
    const template = createEvidenceTemplate("QA-20260823-P16", "c".repeat(40));
    const result = evaluateReleaseEvidence(template);

    expect(template.roles).toHaveLength(REQUIRED_ROLES.length);
    expect(template.viewports).toHaveLength(REQUIRED_VIEWPORTS.length);
    expect(result.ready).toBe(false);
    expect(result.failures.map((failure) => failure.id)).toEqual(
      expect.arrayContaining([
        "candidate-deployment",
        "execution-identity",
        "phase-6",
        "lifecycle-connected-repair",
        "role-owner",
        "coverage-gaps",
      ]),
    );
  });

  it("passes only a complete 100-point evidence set", () => {
    const result = evaluateReleaseEvidence(passingEvidence());

    expect(result).toMatchObject({
      ready: true,
      recommendation: "READY",
      rawScore: 100,
      scoreCap: 100,
      score: 100,
      failures: [],
    });
  });

  it("caps an open Sev-1 at 30 and an open Sev-2 at 65", () => {
    const sev1 = passingEvidence();
    sev1.defects[0].severity = "Sev-1";
    sev1.defects[0].status = "open";
    expect(evaluateReleaseEvidence(sev1)).toMatchObject({
      ready: false,
      scoreCap: 30,
      score: 30,
    });

    const sev2 = passingEvidence();
    sev2.defects[0].status = "open";
    expect(evaluateReleaseEvidence(sev2)).toMatchObject({
      ready: false,
      scoreCap: 65,
      score: 65,
    });
  });

  it("caps a failed core lifecycle at 70", () => {
    const evidence = passingEvidence();
    evidence.lifecycles[0].status = "fail";
    const result = evaluateReleaseEvidence(evidence);

    expect(result).toMatchObject({ ready: false, scoreCap: 70, score: 70 });
    expect(result.failures.map((failure) => failure.id)).toContain(
      "lifecycle-connected-repair",
    );
  });

  it("fails closed on missing role, navigation, diagnostics, plan, cleanup, and coverage evidence", () => {
    const evidence = passingEvidence();
    evidence.roles = evidence.roles.filter((role) => role.id !== "driver");
    evidence.refreshRuns[9].candidateSha = "stale";
    evidence.diagnostics.consoleErrors.push("Uncaught Error");
    evidence.planGates[1].noPartialDataPassed = false;
    evidence.cleanup.records[1].deletionConfirmed = false;
    evidence.search.status = "fail";
    evidence.performance.routeBudgetPassed = false;
    evidence.accessibility.keyboardPassed = false;
    evidence.payment.noRealChargePassed = false;
    evidence.coverageGaps.push({ summary: "iOS PWA not run" });

    const ids = evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "role-driver",
        "ten-navigation-runs",
        "diagnostics",
        "plan-starter",
        "cleanup",
        "search",
        "performance",
        "accessibility",
        "payment-safety",
        "coverage-gaps",
      ]),
    );
  });

  it("requires every Sev-2 to pass automated and live regression", () => {
    const evidence = passingEvidence();
    evidence.defects[0].liveRegressionPassed = false;

    expect(evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id)).toContain(
      "sev-2-regression-PFX-TEST",
    );
  });

  it("rejects placeholder SHAs and malformed defect evidence", () => {
    const evidence = passingEvidence();
    evidence.candidate.sha = "not-an-exact-sha";
    evidence.prerequisites[0].headSha = "short";
    evidence.defects[0].severity = "P2";

    expect(evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id)).toEqual(
      expect.arrayContaining([
        "candidate-deployment",
        "phase-6",
        "defect-PFX-TEST",
      ]),
    );
  });

  it("renders the complete executive handoff contract", () => {
    const report = renderReleaseReport(passingEvidence());

    expect(report).toContain("Recommendation: **READY**");
    expect(report).toContain("Release readiness score: **100/100**");
    expect(report).toContain("## Severity-ranked defects");
    expect(report).toContain("## Top risks");
    expect(report).toContain("## Prioritized fixes");
    expect(report).toContain("## Regression results");
    expect(report).toContain("## Diagnostics summary");
    expect(report).toContain("## Cleanup status");
    expect(report).toContain("## Coverage gaps");
    expect(report).toContain("## Rollback readiness");
  });
});
