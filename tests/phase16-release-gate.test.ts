import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  initializeEvidenceTemplate,
  renderReleaseReport,
} from "../scripts/release-validation/phase16-gate.mjs";

function passingEvidence() {
  const sha = "a".repeat(40);
  const completedAt = new Date(Date.now() - 60_000);
  const startedAt = new Date(completedAt.getTime() - 60 * 60 * 1000);
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
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
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
        candidateSha: sha,
        severity: "Sev-2",
        status: "closed",
        automatedRegressionPassed: true,
        liveRegressionPassed: true,
      },
    ],
    scores: Object.fromEntries(
      Object.entries(CATEGORY_WEIGHTS).map(([category, maximum]) => [category, maximum]),
    ),
    lifecycles: REQUIRED_LIFECYCLES.map((id) => ({
      id,
      candidateSha: sha,
      status: "pass",
    })),
    products: REQUIRED_PRODUCTS.map((id) => ({
      id,
      candidateSha: sha,
      status: "pass",
    })),
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
      candidateSha: sha,
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
      candidateSha: sha,
      uiPassed: true,
      serverPassed: true,
      noPartialDataPassed: true,
    })),
    viewports: REQUIRED_VIEWPORTS.map((id) => ({
      id,
      candidateSha: sha,
      status: "pass",
      noHorizontalOverflow: true,
    })),
    offline: {
      candidateSha: sha,
      status: "pass",
      reconnectPassed: true,
      noStaleProtectedDataPassed: true,
    },
    search: {
      candidateSha: sha,
      status: "pass",
      caseCoveragePassed: true,
      productsCoveragePassed: true,
    },
    performance: {
      candidateSha: sha,
      status: "pass",
      feedbackWithin100MsPassed: true,
      routeBudgetPassed: true,
      noStaleMutableDataPassed: true,
    },
    accessibility: {
      candidateSha: sha,
      status: "pass",
      keyboardPassed: true,
      touchTargetsPassed: true,
      dialogsPassed: true,
    },
    payment: {
      candidateSha: sha,
      status: "pass",
      sandboxOnly: true,
      noRealChargePassed: true,
    },
    diagnostics: {
      candidateSha: sha,
      networkObserved: true,
      consoleErrors: [] as string[],
      unexplainedFailedRequests: [] as string[],
    },
    cleanup: {
      candidateSha: sha,
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

  it("never marks incomplete scoring ready", () => {
    const evidence = passingEvidence();
    (evidence as unknown as { scores: Record<string, number> }).scores = Object.fromEntries(
      Object.keys(CATEGORY_WEIGHTS).map((category) => [category, 0]),
    );

    const result = evaluateReleaseEvidence(evidence);
    expect(result).toMatchObject({ ready: false, score: 0 });
    expect(result.failures.map((failure) => failure.id)).toContain(
      "score-completeness",
    );
  });

  it("binds every observed pass to the exact candidate", () => {
    const evidence = passingEvidence();
    const staleSha = "c".repeat(40);
    evidence.lifecycles[0].candidateSha = staleSha;
    evidence.products[0].candidateSha = staleSha;
    evidence.roles[0].candidateSha = staleSha;
    evidence.planGates[0].candidateSha = staleSha;
    evidence.viewports[0].candidateSha = staleSha;
    evidence.offline.candidateSha = staleSha;
    evidence.diagnostics.candidateSha = staleSha;

    expect(evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id)).toEqual(
      expect.arrayContaining([
        `lifecycle-${REQUIRED_LIFECYCLES[0]}`,
        `product-${REQUIRED_PRODUCTS[0]}`,
        `role-${REQUIRED_ROLES[0]}`,
        "plan-pro",
        `viewport-${REQUIRED_VIEWPORTS[0]}`,
        "offline",
        "diagnostics",
      ]),
    );
  });

  it("requires a distinct rollback target", () => {
    const evidence = passingEvidence();
    evidence.candidate.rollback.previousStableSha = evidence.candidate.sha;

    expect(evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id)).toContain(
      "rollback-readiness",
    );
  });

  it("requires a usable unique PR for every prerequisite phase", () => {
    const evidence = passingEvidence();
    (evidence.prerequisites[0] as { pr: number | null }).pr = null;
    evidence.prerequisites[1].pr = evidence.prerequisites[2].pr;

    const ids = evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id);
    expect(ids).toEqual(expect.arrayContaining(["phase-6", "phase-8"]));
  });

  it("fails closed when evidence collections have the wrong JSON shape", () => {
    const evidence = passingEvidence();
    (evidence as unknown as { defects: unknown }).defects = {
      id: "PFX-HIDDEN-SEV1",
      severity: "Sev-1",
      status: "open",
    };
    (
      evidence.diagnostics as unknown as { consoleErrors: unknown }
    ).consoleErrors = "Uncaught Error";
    (evidence as unknown as { coverageGaps: unknown }).coverageGaps = {
      summary: "Untested product",
    };

    expect(evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id)).toEqual(
      expect.arrayContaining([
        "collection-defects",
        "collection-diagnostics-console-errors",
        "collection-coverage-gaps",
      ]),
    );
  });

  it("rejects duplicate or contradictory observed results", () => {
    const evidence = passingEvidence();
    evidence.lifecycles.push({
      ...evidence.lifecycles[0],
      status: "fail",
    });
    evidence.roles.push({
      ...evidence.roles[0],
      navigationPassed: false,
    });

    expect(evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id)).toEqual(
      expect.arrayContaining(["duplicate-lifecycles", "duplicate-roles"]),
    );
  });

  it("requires an explicit boolean disposition for every risk", () => {
    const evidence = passingEvidence();
    delete (
      evidence.topRisks[0] as { releaseBlocking?: boolean }
    ).releaseBlocking;

    expect(evaluateReleaseEvidence(evidence).failures.map((failure) => failure.id)).toContain(
      "risk-RISK-1",
    );
  });

  it("rejects zero-duration, future, and stale execution windows", () => {
    const zeroDuration = passingEvidence();
    zeroDuration.execution.completedAt = zeroDuration.execution.startedAt;
    expect(
      evaluateReleaseEvidence(zeroDuration).failures.map((failure) => failure.id),
    ).toContain("execution-identity");

    const future = passingEvidence();
    future.execution.startedAt = new Date(Date.now() + 60_000).toISOString();
    future.execution.completedAt = new Date(Date.now() + 120_000).toISOString();
    expect(evaluateReleaseEvidence(future).failures.map((failure) => failure.id)).toContain(
      "execution-identity",
    );

    const stale = passingEvidence();
    stale.execution.startedAt = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    stale.execution.completedAt = new Date(
      Date.now() - 25 * 60 * 60 * 1000,
    ).toISOString();
    expect(evaluateReleaseEvidence(stale).failures.map((failure) => failure.id)).toContain(
      "execution-identity",
    );
  });

  it("does not overwrite existing evidence unless explicitly requested", async () => {
    const directory = await mkdtemp(join(tmpdir(), "profixiq-phase16-"));
    const evidencePath = join(directory, "evidence.json");
    try {
      await initializeEvidenceTemplate(
        evidencePath,
        "QA-20260823-P16",
        "a".repeat(40),
      );
      await expect(
        initializeEvidenceTemplate(
          evidencePath,
          "QA-20260823-P16-RERUN",
          "b".repeat(40),
        ),
      ).rejects.toThrow("Evidence already exists");

      const preserved = JSON.parse(await readFile(evidencePath, "utf8"));
      expect(preserved.runId).toBe("QA-20260823-P16");

      await initializeEvidenceTemplate(
        evidencePath,
        "QA-20260823-P16-RERUN",
        "b".repeat(40),
        { overwrite: true },
      );
      const replaced = JSON.parse(await readFile(evidencePath, "utf8"));
      expect(replaced.runId).toBe("QA-20260823-P16-RERUN");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
