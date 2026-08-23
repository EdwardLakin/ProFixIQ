import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CATEGORY_WEIGHTS = Object.freeze({
  coreWorkflows: 30,
  authorizationSecurity: 25,
  crossAppDataIntegrity: 20,
  reliabilityDiagnostics: 10,
  responsiveOfflineAccessibility: 10,
  aiCopilot: 5,
});

export const REQUIRED_PHASES = Object.freeze(
  Array.from({ length: 10 }, (_, index) => index + 6),
);

export const REQUIRED_ROLES = Object.freeze([
  "owner",
  "admin",
  "manager",
  "service-advisor",
  "technician",
  "lead-tech",
  "parts",
  "fleet-manager",
  "dispatcher",
  "driver",
  "customer",
  "field-operator",
]);

export const REQUIRED_PRODUCTS = Object.freeze([
  "shop-desktop-pwa",
  "shop-mobile",
  "customer-portal",
  "fleet",
  "field-service",
  "ai-copilot",
]);

export const REQUIRED_LIFECYCLES = Object.freeze([
  "connected-repair",
  "field-service-variation",
  "offline-reconnect-variation",
]);

export const REQUIRED_VIEWPORTS = Object.freeze([
  "1440x900",
  "1024x768",
  "768x1024",
  "430x932",
  "390x844",
  "360x800",
]);

export function createEvidenceTemplate(runId, candidateSha) {
  return {
    schemaVersion: 1,
    runId,
    candidate: {
      sha: candidateSha,
      environment: "",
      deployed: false,
      rollback: {
        previousStableSha: "",
        owner: "",
        runbook: "docs/ops/phase16-release-rollback-validation.md",
        applicationRollbackVerified: false,
        databaseStrategy: "forward-only",
        postRollbackSmokePassed: false,
      },
    },
    execution: {
      candidateSha,
      startedAt: "",
      completedAt: "",
      operator: "",
    },
    prerequisites: REQUIRED_PHASES.map((phase) => ({
      phase,
      pr: null,
      status: "pending",
      deployed: false,
      headSha: "",
    })),
    defects: [],
    scores: Object.fromEntries(Object.keys(CATEGORY_WEIGHTS).map((category) => [category, 0])),
    lifecycles: REQUIRED_LIFECYCLES.map((id) => ({ id, status: "untested" })),
    products: REQUIRED_PRODUCTS.map((id) => ({ id, status: "untested" })),
    refreshRuns: [],
    roles: REQUIRED_ROLES.map((id) => ({
      id,
      plans: [],
      navigationPassed: false,
      allowedActionsPassed: false,
      prohibitedUiPassed: false,
      prohibitedDirectRoutesPassed: false,
      serverDenialsPassed: false,
      crossTenantReplayPassed: false,
      sessionRevocationPassed: false,
    })),
    planGates: ["Pro", "Starter"].map((plan) => ({
      plan,
      uiPassed: false,
      serverPassed: false,
      noPartialDataPassed: false,
    })),
    viewports: REQUIRED_VIEWPORTS.map((id) => ({
      id,
      status: "untested",
      noHorizontalOverflow: false,
    })),
    offline: {
      status: "untested",
      reconnectPassed: false,
      noStaleProtectedDataPassed: false,
    },
    search: {
      status: "untested",
      caseCoveragePassed: false,
      productsCoveragePassed: false,
    },
    performance: {
      status: "untested",
      feedbackWithin100MsPassed: false,
      routeBudgetPassed: false,
      noStaleMutableDataPassed: false,
    },
    accessibility: {
      status: "untested",
      keyboardPassed: false,
      touchTargetsPassed: false,
      dialogsPassed: false,
    },
    payment: {
      status: "untested",
      sandboxOnly: true,
      noRealChargePassed: false,
    },
    diagnostics: {
      networkObserved: false,
      consoleErrors: [],
      unexplainedFailedRequests: [],
    },
    cleanup: { scopeConfirmed: false, records: [] },
    topRisks: [],
    prioritizedFixes: [],
    coverageGaps: [
      { id: "LIVE-VALIDATION-PENDING", summary: "Deployed Phase 16 validation has not run." },
    ],
  };
}

const ROLE_CHECKS = Object.freeze([
  "navigationPassed",
  "allowedActionsPassed",
  "prohibitedUiPassed",
  "prohibitedDirectRoutesPassed",
  "serverDenialsPassed",
  "crossTenantReplayPassed",
  "sessionRevocationPassed",
]);

const SCORE_LABELS = Object.freeze({
  coreWorkflows: "Core workflows",
  authorizationSecurity: "Authorization/security",
  crossAppDataIntegrity: "Cross-app data integrity",
  reliabilityDiagnostics: "Reliability/diagnostics",
  responsiveOfflineAccessibility: "Responsive/offline/accessibility",
  aiCopilot: "AI Copilot",
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function addFailure(failures, id, message) {
  if (!failures.some((failure) => failure.id === id)) {
    failures.push({ id, message });
  }
}

function hasPass(entries, id) {
  return list(entries).some((entry) => entry?.id === id && entry?.status === "pass");
}

function scoreEvidence(scores, failures) {
  let rawScore = 0;

  for (const [category, maximum] of Object.entries(CATEGORY_WEIGHTS)) {
    const earned = scores?.[category];
    if (
      typeof earned !== "number" ||
      !Number.isFinite(earned) ||
      earned < 0 ||
      earned > maximum
    ) {
      addFailure(
        failures,
        `score-${category}`,
        `${SCORE_LABELS[category]} must be scored from 0 to ${maximum}.`,
      );
      continue;
    }
    rawScore += earned;
  }

  return rawScore;
}

export function evaluateReleaseEvidence(evidence) {
  const failures = [];

  if (evidence?.schemaVersion !== 1) {
    addFailure(failures, "schema-version", "Evidence schemaVersion must be 1.");
  }
  if (typeof evidence?.runId !== "string" || !/^QA-[A-Za-z0-9-]+$/.test(evidence.runId)) {
    addFailure(failures, "run-id", "Run ID must use the QA-<run-id> convention.");
  }

  const candidate = evidence?.candidate;
  if (!candidate?.sha || !candidate?.environment || candidate?.deployed !== true) {
    addFailure(
      failures,
      "candidate-deployment",
      "The exact candidate SHA must be deployed to a named validation environment.",
    );
  }

  const execution = evidence?.execution;
  const executionStart = Date.parse(execution?.startedAt ?? "");
  const executionEnd = Date.parse(execution?.completedAt ?? "");
  if (
    execution?.candidateSha !== candidate?.sha ||
    !execution?.operator ||
    !Number.isFinite(executionStart) ||
    !Number.isFinite(executionEnd) ||
    executionEnd < executionStart
  ) {
    addFailure(
      failures,
      "execution-identity",
      "The complete evidence run must name its operator, timestamps, and exact deployed candidate SHA.",
    );
  }

  const rollback = candidate?.rollback;
  if (
    !rollback?.previousStableSha ||
    !rollback?.owner ||
    !rollback?.runbook ||
    rollback?.applicationRollbackVerified !== true ||
    rollback?.databaseStrategy !== "forward-only" ||
    rollback?.postRollbackSmokePassed !== true
  ) {
    addFailure(
      failures,
      "rollback-readiness",
      "Rollback requires an owner, previous stable SHA, runbook, verified application rollback, forward-only database strategy, and passing smoke.",
    );
  }

  for (const phase of REQUIRED_PHASES) {
    const prerequisite = list(evidence?.prerequisites).find(
      (entry) => entry?.phase === phase,
    );
    if (
      !prerequisite ||
      prerequisite.status !== "merged" ||
      prerequisite.deployed !== true ||
      !prerequisite.headSha
    ) {
      addFailure(
        failures,
        `phase-${phase}`,
        `Phase ${phase} must be merged, deployed, and tied to an exact head SHA.`,
      );
    }
  }

  const defects = list(evidence?.defects);
  const openSev1 = defects.filter(
    (defect) => defect?.severity === "Sev-1" && defect?.status !== "closed",
  );
  const openSev2 = defects.filter(
    (defect) => defect?.severity === "Sev-2" && defect?.status !== "closed",
  );
  if (openSev1.length > 0) {
    addFailure(failures, "open-sev-1", "No Sev-1 defect may remain open.");
  }
  if (openSev2.length > 0) {
    addFailure(failures, "open-sev-2", "No Sev-2 defect may remain open.");
  }
  for (const defect of defects.filter((entry) => entry?.severity === "Sev-2")) {
    if (defect?.automatedRegressionPassed !== true || defect?.liveRegressionPassed !== true) {
      addFailure(
        failures,
        `sev-2-regression-${defect?.id ?? "unknown"}`,
        `Sev-2 ${defect?.id ?? "unknown"} needs passing automated and live regressions.`,
      );
    }
  }

  for (const lifecycle of REQUIRED_LIFECYCLES) {
    if (!hasPass(evidence?.lifecycles, lifecycle)) {
      addFailure(
        failures,
        `lifecycle-${lifecycle}`,
        `${lifecycle} must pass on the deployed candidate.`,
      );
    }
  }

  for (const product of REQUIRED_PRODUCTS) {
    if (!hasPass(evidence?.products, product)) {
      addFailure(
        failures,
        `product-${product}`,
        `${product} needs passing end-to-end evidence.`,
      );
    }
  }

  const refreshRuns = list(evidence?.refreshRuns);
  const tenConsecutiveRunsPass =
    refreshRuns.length >= 10 &&
    refreshRuns.slice(-10).every(
      (run, index) =>
        run?.sequence === refreshRuns.length - 9 + index &&
        run?.candidateSha === candidate?.sha &&
        run?.status === "pass" &&
        run?.refreshPassed === true &&
        run?.coldNavigationPassed === true &&
        run?.backForwardPassed === true &&
        list(run?.consoleErrors).length === 0 &&
        list(run?.unexplainedFailedRequests).length === 0,
    );
  if (!tenConsecutiveRunsPass) {
    addFailure(
      failures,
      "ten-navigation-runs",
      "The exact candidate needs ten consecutive clean refresh/cold-navigation runs.",
    );
  }

  for (const roleId of REQUIRED_ROLES) {
    const role = list(evidence?.roles).find((entry) => entry?.id === roleId);
    const roleChecksPass =
      role &&
      ROLE_CHECKS.every((check) => role[check] === true) &&
      ["Pro", "Starter"].every((plan) => list(role.plans).includes(plan));
    if (!roleChecksPass) {
      addFailure(
        failures,
        `role-${roleId}`,
        `${roleId} needs allowed, denied, direct-route, server, cross-tenant, revocation, Pro, and Starter evidence.`,
      );
    }
  }

  for (const plan of ["Pro", "Starter"]) {
    const planGate = list(evidence?.planGates).find((entry) => entry?.plan === plan);
    if (
      !planGate ||
      planGate.uiPassed !== true ||
      planGate.serverPassed !== true ||
      planGate.noPartialDataPassed !== true
    ) {
      addFailure(
        failures,
        `plan-${plan.toLowerCase()}`,
        `${plan} feature gates need UI, server-denial, and no-partial-data evidence.`,
      );
    }
  }

  for (const viewportId of REQUIRED_VIEWPORTS) {
    const viewport = list(evidence?.viewports).find((entry) => entry?.id === viewportId);
    if (
      !viewport ||
      viewport.status !== "pass" ||
      viewport.noHorizontalOverflow !== true
    ) {
      addFailure(
        failures,
        `viewport-${viewportId}`,
        `${viewportId} needs a passing responsive run with no horizontal overflow.`,
      );
    }
  }

  if (
    evidence?.offline?.status !== "pass" ||
    evidence?.offline?.reconnectPassed !== true ||
    evidence?.offline?.noStaleProtectedDataPassed !== true
  ) {
    addFailure(
      failures,
      "offline",
      "Offline/reconnect must pass without retaining stale protected data.",
    );
  }

  if (
    evidence?.search?.status !== "pass" ||
    evidence?.search?.caseCoveragePassed !== true ||
    evidence?.search?.productsCoveragePassed !== true
  ) {
    addFailure(
      failures,
      "search",
      "Search must pass the required query cases across every available product surface.",
    );
  }

  if (
    evidence?.performance?.status !== "pass" ||
    evidence?.performance?.feedbackWithin100MsPassed !== true ||
    evidence?.performance?.routeBudgetPassed !== true ||
    evidence?.performance?.noStaleMutableDataPassed !== true
  ) {
    addFailure(
      failures,
      "performance",
      "Navigation must show feedback within 100 ms, meet the route budget, and avoid stale mutable data.",
    );
  }

  if (
    evidence?.accessibility?.status !== "pass" ||
    evidence?.accessibility?.keyboardPassed !== true ||
    evidence?.accessibility?.touchTargetsPassed !== true ||
    evidence?.accessibility?.dialogsPassed !== true
  ) {
    addFailure(
      failures,
      "accessibility",
      "Keyboard, touch-target, and dialog accessibility checks must pass.",
    );
  }

  if (
    evidence?.payment?.status !== "pass" ||
    evidence?.payment?.sandboxOnly !== true ||
    evidence?.payment?.noRealChargePassed !== true
  ) {
    addFailure(
      failures,
      "payment-safety",
      "The lifecycle payment must pass with sandbox methods and no real charge.",
    );
  }

  const diagnostics = evidence?.diagnostics;
  if (
    !diagnostics ||
    list(diagnostics.consoleErrors).length > 0 ||
    list(diagnostics.unexplainedFailedRequests).length > 0 ||
    diagnostics.networkObserved !== true
  ) {
    addFailure(
      failures,
      "diagnostics",
      "Diagnostics must include network observation with zero console errors and zero unexplained failed requests.",
    );
  }

  const cleanup = evidence?.cleanup;
  const cleanupRecords = list(cleanup?.records);
  const cleanupPassed =
    cleanup?.scopeConfirmed === true &&
    cleanupRecords.every(
      (record) =>
        record?.state === "archived" ||
        (record?.state === "deleted" && record?.deletionConfirmed === true),
    );
  if (!cleanupPassed) {
    addFailure(
      failures,
      "cleanup",
      "Every synthetic record must be archived, or hard-deleted with action-time confirmation.",
    );
  }

  if (list(evidence?.topRisks).some((risk) => risk?.releaseBlocking === true)) {
    addFailure(failures, "blocking-risk", "No release-blocking risk may remain unmitigated.");
  }
  if (list(evidence?.coverageGaps).length > 0) {
    addFailure(failures, "coverage-gaps", "All required release coverage gaps must be closed.");
  }

  const rawScore = scoreEvidence(evidence?.scores, failures);
  const failedCoreLifecycle = REQUIRED_LIFECYCLES.some(
    (lifecycle) => !hasPass(evidence?.lifecycles, lifecycle),
  );
  let scoreCap = 100;
  if (openSev1.length > 0) scoreCap = Math.min(scoreCap, 30);
  if (openSev2.length > 0) scoreCap = Math.min(scoreCap, 65);
  if (failedCoreLifecycle) scoreCap = Math.min(scoreCap, 70);
  const score = Math.min(rawScore, scoreCap);
  const ready = failures.length === 0;

  return {
    ready,
    recommendation: ready ? "READY" : "NO-GO",
    rawScore,
    scoreCap,
    score,
    failures,
  };
}

function markdownList(items, emptyText, render) {
  if (items.length === 0) return emptyText;
  return items.map((item) => `- ${render(item)}`).join("\n");
}

export function renderReleaseReport(evidence, result = evaluateReleaseEvidence(evidence)) {
  const defects = [...list(evidence?.defects)].sort((left, right) =>
    String(left?.severity).localeCompare(String(right?.severity)),
  );
  const scores = Object.entries(CATEGORY_WEIGHTS)
    .map(
      ([category, maximum]) =>
        `| ${SCORE_LABELS[category]} | ${evidence?.scores?.[category] ?? "Missing"} | ${maximum} |`,
    )
    .join("\n");

  return `# ProFixIQ Release Validation — ${evidence?.runId ?? "missing-run-id"}

## Executive summary

- Recommendation: **${result.recommendation}**
- Release readiness score: **${result.score}/100** (raw ${result.rawScore}, cap ${result.scoreCap})
- Candidate: \`${evidence?.candidate?.sha ?? "missing"}\` in \`${evidence?.candidate?.environment ?? "missing"}\`
- Blocking gates: ${result.failures.length}

## Release gates

${markdownList(result.failures, "All mandatory release gates passed.", (failure) => `**${failure.id}:** ${failure.message}`)}

## Score

| Category | Earned | Available |
| --- | ---: | ---: |
${scores}

## Severity-ranked defects

${markdownList(defects, "No defects recorded.", (defect) => `**${defect.severity} ${defect.id}:** ${defect.status}${defect.summary ? ` — ${defect.summary}` : ""}`)}

## Top risks

${markdownList(list(evidence?.topRisks), "No residual risks recorded.", (risk) => `**${risk.id}:** ${risk.summary} (${risk.releaseBlocking ? "blocking" : "mitigated/accepted"})`)}

## Prioritized fixes

${markdownList(list(evidence?.prioritizedFixes), "No remaining fixes recorded.", (fix) => `**${fix.priority}:** ${fix.summary}`)}

## Regression results

- Connected lifecycles: ${list(evidence?.lifecycles).filter((entry) => entry?.status === "pass").length}/${REQUIRED_LIFECYCLES.length} required passed
- Product surfaces: ${list(evidence?.products).filter((entry) => entry?.status === "pass").length}/${REQUIRED_PRODUCTS.length} required passed
- Role fixtures: ${list(evidence?.roles).length}/${REQUIRED_ROLES.length} recorded
- Consecutive navigation runs: ${list(evidence?.refreshRuns).filter((entry) => entry?.status === "pass").length}/10 passing runs recorded
- Search matrix: ${evidence?.search?.status ?? "missing"}
- Performance budget: ${evidence?.performance?.status ?? "missing"}
- Accessibility: ${evidence?.accessibility?.status ?? "missing"}
- Sandbox payment: ${evidence?.payment?.status ?? "missing"}

## Diagnostics summary

- Network observation: ${evidence?.diagnostics?.networkObserved === true ? "complete" : "missing"}
- Console errors: ${list(evidence?.diagnostics?.consoleErrors).length}
- Unexplained failed requests: ${list(evidence?.diagnostics?.unexplainedFailedRequests).length}

## Cleanup status

${markdownList(list(evidence?.cleanup?.records), evidence?.cleanup?.scopeConfirmed === true ? "Cleanup scope confirmed; no synthetic records were created." : "Cleanup evidence is missing.", (record) => `\`${record.id}\`: ${record.state}`)}

## Coverage gaps

${markdownList(list(evidence?.coverageGaps), "No required coverage gaps remain.", (gap) => gap.summary ?? String(gap))}

## Rollback readiness

- Previous stable SHA: \`${evidence?.candidate?.rollback?.previousStableSha ?? "missing"}\`
- Owner: ${evidence?.candidate?.rollback?.owner ?? "missing"}
- Runbook: ${evidence?.candidate?.rollback?.runbook ?? "missing"}
- Database strategy: ${evidence?.candidate?.rollback?.databaseStrategy ?? "missing"}
- Application rollback verified: ${evidence?.candidate?.rollback?.applicationRollbackVerified === true ? "yes" : "no"}
- Post-rollback smoke passed: ${evidence?.candidate?.rollback?.postRollbackSmokePassed === true ? "yes" : "no"}

## Evidence identity

- Schema version: ${evidence?.schemaVersion ?? "missing"}
- Evidence candidate SHA: \`${evidence?.execution?.candidateSha ?? "missing"}\`
- Evidence operator: ${evidence?.execution?.operator ?? "missing"}
- Evidence window: ${evidence?.execution?.startedAt ?? "missing"} — ${evidence?.execution?.completedAt ?? "missing"}
- Generated at: ${new Date().toISOString()}
`;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const templatePath = option("--template");
  if (templatePath) {
    const runId = option("--run-id");
    const candidateSha = option("--candidate-sha");
    if (!runId || !candidateSha) {
      throw new Error("Template creation requires --run-id and --candidate-sha.");
    }
    const resolvedTemplatePath = resolve(templatePath);
    await mkdir(dirname(resolvedTemplatePath), { recursive: true });
    await writeFile(
      resolvedTemplatePath,
      `${JSON.stringify(createEvidenceTemplate(runId, candidateSha), null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`Created fail-closed evidence template at ${resolvedTemplatePath}.\n`);
    return;
  }

  const inputPath = option("--input");
  const outputPath = option("--output");
  const reportOnly = process.argv.includes("--report-only");
  if (!inputPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/release-validation/phase16-gate.mjs --input <evidence.json> --output <report.md> [--report-only]",
    );
  }

  const evidence = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const result = evaluateReleaseEvidence(evidence);
  const resolvedOutputPath = resolve(outputPath);
  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, renderReleaseReport(evidence, result), "utf8");
  process.stdout.write(
    `${result.recommendation}: ${result.score}/100; ${result.failures.length} blocking gate(s).\n`,
  );
  if (!result.ready && !reportOnly) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
