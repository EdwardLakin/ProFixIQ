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

export const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

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
    lifecycles: REQUIRED_LIFECYCLES.map((id) => ({
      id,
      candidateSha,
      status: "untested",
    })),
    products: REQUIRED_PRODUCTS.map((id) => ({
      id,
      candidateSha,
      status: "untested",
    })),
    refreshRuns: [],
    roles: REQUIRED_ROLES.map((id) => ({
      id,
      candidateSha,
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
      candidateSha,
      uiPassed: false,
      serverPassed: false,
      noPartialDataPassed: false,
    })),
    viewports: REQUIRED_VIEWPORTS.map((id) => ({
      id,
      candidateSha,
      status: "untested",
      noHorizontalOverflow: false,
    })),
    offline: {
      candidateSha,
      status: "untested",
      reconnectPassed: false,
      noStaleProtectedDataPassed: false,
    },
    search: {
      candidateSha,
      status: "untested",
      caseCoveragePassed: false,
      productsCoveragePassed: false,
    },
    performance: {
      candidateSha,
      status: "untested",
      feedbackWithin100MsPassed: false,
      routeBudgetPassed: false,
      noStaleMutableDataPassed: false,
    },
    accessibility: {
      candidateSha,
      status: "untested",
      keyboardPassed: false,
      touchTargetsPassed: false,
      dialogsPassed: false,
    },
    payment: {
      candidateSha,
      status: "untested",
      sandboxOnly: true,
      noRealChargePassed: false,
    },
    diagnostics: {
      candidateSha,
      networkObserved: false,
      consoleErrors: [],
      unexplainedFailedRequests: [],
    },
    cleanup: { candidateSha, scopeConfirmed: false, records: [] },
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

function checkedList(value, failures, id, label) {
  if (!Array.isArray(value)) {
    addFailure(failures, `collection-${id}`, `${label} must be a JSON array.`);
    return [];
  }
  return value;
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function addFailure(failures, id, message) {
  if (!failures.some((failure) => failure.id === id)) {
    failures.push({ id, message });
  }
}

function isCandidateBound(entry, candidateSha) {
  return isSha(candidateSha) && entry?.candidateSha === candidateSha;
}

function hasPass(entries, id, candidateSha) {
  return entries.some(
    (entry) =>
      entry?.id === id &&
      entry?.status === "pass" &&
      isCandidateBound(entry, candidateSha),
  );
}

function rejectDuplicateKeys(entries, keyOf, failures, id, label) {
  const seen = new Set();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (key === null || key === undefined || key === "") continue;
    if (seen.has(key)) {
      addFailure(failures, `duplicate-${id}`, `${label} identifiers must be unique.`);
      return;
    }
    seen.add(key);
  }
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
  const prerequisites = checkedList(
    evidence?.prerequisites,
    failures,
    "prerequisites",
    "Prerequisites",
  );
  const defects = checkedList(evidence?.defects, failures, "defects", "Defects");
  const lifecycles = checkedList(
    evidence?.lifecycles,
    failures,
    "lifecycles",
    "Lifecycles",
  );
  const products = checkedList(evidence?.products, failures, "products", "Products");
  const refreshRuns = checkedList(
    evidence?.refreshRuns,
    failures,
    "refresh-runs",
    "Refresh runs",
  );
  const roles = checkedList(evidence?.roles, failures, "roles", "Roles");
  const planGates = checkedList(
    evidence?.planGates,
    failures,
    "plan-gates",
    "Plan gates",
  );
  const viewports = checkedList(evidence?.viewports, failures, "viewports", "Viewports");
  const diagnosticConsoleErrors = checkedList(
    evidence?.diagnostics?.consoleErrors,
    failures,
    "diagnostics-console-errors",
    "Diagnostic console errors",
  );
  const diagnosticFailedRequests = checkedList(
    evidence?.diagnostics?.unexplainedFailedRequests,
    failures,
    "diagnostics-failed-requests",
    "Diagnostic failed requests",
  );
  const cleanupRecords = checkedList(
    evidence?.cleanup?.records,
    failures,
    "cleanup-records",
    "Cleanup records",
  );
  const topRisks = checkedList(
    evidence?.topRisks,
    failures,
    "top-risks",
    "Top risks",
  );
  checkedList(
    evidence?.prioritizedFixes,
    failures,
    "prioritized-fixes",
    "Prioritized fixes",
  );
  const coverageGaps = checkedList(
    evidence?.coverageGaps,
    failures,
    "coverage-gaps",
    "Coverage gaps",
  );

  rejectDuplicateKeys(prerequisites, (entry) => entry?.phase, failures, "phases", "Phase");
  rejectDuplicateKeys(lifecycles, (entry) => entry?.id, failures, "lifecycles", "Lifecycle");
  rejectDuplicateKeys(products, (entry) => entry?.id, failures, "products", "Product");
  rejectDuplicateKeys(refreshRuns, (entry) => entry?.sequence, failures, "refresh-runs", "Refresh run");
  rejectDuplicateKeys(roles, (entry) => entry?.id, failures, "roles", "Role");
  rejectDuplicateKeys(planGates, (entry) => entry?.plan, failures, "plan-gates", "Plan gate");
  rejectDuplicateKeys(viewports, (entry) => entry?.id, failures, "viewports", "Viewport");

  if (evidence?.schemaVersion !== 1) {
    addFailure(failures, "schema-version", "Evidence schemaVersion must be 1.");
  }
  if (typeof evidence?.runId !== "string" || !/^QA-[A-Za-z0-9-]+$/.test(evidence.runId)) {
    addFailure(failures, "run-id", "Run ID must use the QA-<run-id> convention.");
  }

  const candidate = evidence?.candidate;
  if (!isSha(candidate?.sha) || !candidate?.environment || candidate?.deployed !== true) {
    addFailure(
      failures,
      "candidate-deployment",
      "The exact candidate SHA must be deployed to a named validation environment.",
    );
  }

  const execution = evidence?.execution;
  const executionStart = Date.parse(execution?.startedAt ?? "");
  const executionEnd = Date.parse(execution?.completedAt ?? "");
  const evaluatedAt = Date.now();
  if (
    execution?.candidateSha !== candidate?.sha ||
    !execution?.operator ||
    !Number.isFinite(executionStart) ||
    !Number.isFinite(executionEnd) ||
    executionEnd <= executionStart ||
    executionEnd > evaluatedAt ||
    evaluatedAt - executionEnd > MAX_EVIDENCE_AGE_MS
  ) {
    addFailure(
      failures,
      "execution-identity",
      "The complete evidence run must name its operator, timestamps, and exact deployed candidate SHA.",
    );
  }

  const rollback = candidate?.rollback;
  if (
    !isSha(rollback?.previousStableSha) ||
    rollback?.previousStableSha === candidate?.sha ||
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

  const prerequisitePrs = new Set();
  for (const phase of REQUIRED_PHASES) {
    const prerequisite = prerequisites.find(
      (entry) => entry?.phase === phase,
    );
    const validPr =
      Number.isInteger(prerequisite?.pr) &&
      prerequisite.pr > 0 &&
      !prerequisitePrs.has(prerequisite.pr);
    if (
      !prerequisite ||
      !validPr ||
      prerequisite.status !== "merged" ||
      prerequisite.deployed !== true ||
      !isSha(prerequisite.headSha)
    ) {
      addFailure(
        failures,
        `phase-${phase}`,
        `Phase ${phase} must have a unique PR, be merged and deployed, and be tied to an exact head SHA.`,
      );
    }
    if (Number.isInteger(prerequisite?.pr) && prerequisite.pr > 0) {
      prerequisitePrs.add(prerequisite.pr);
    }
  }

  const defectIds = new Set();
  for (const defect of defects) {
    const validDefect =
      typeof defect?.id === "string" &&
      defect.id.length > 0 &&
      !defectIds.has(defect.id) &&
      isCandidateBound(defect, candidate?.sha) &&
      ["Sev-1", "Sev-2", "Sev-3", "Sev-4"].includes(defect?.severity) &&
      ["open", "closed"].includes(defect?.status);
    if (!validDefect) {
      addFailure(
        failures,
        `defect-${defect?.id ?? "unknown"}`,
        "Every defect needs a unique ID, exact candidate SHA, recognized severity, and open or closed status.",
      );
    }
    if (typeof defect?.id === "string") defectIds.add(defect.id);
  }
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
    if (!hasPass(lifecycles, lifecycle, candidate?.sha)) {
      addFailure(
        failures,
        `lifecycle-${lifecycle}`,
        `${lifecycle} must pass on the deployed candidate.`,
      );
    }
  }

  for (const product of REQUIRED_PRODUCTS) {
    if (!hasPass(products, product, candidate?.sha)) {
      addFailure(
        failures,
        `product-${product}`,
        `${product} needs passing end-to-end evidence.`,
      );
    }
  }

  const tenConsecutiveRunsPass =
    refreshRuns.length >= 10 &&
    refreshRuns.slice(-10).every(
      (run, index) => {
        const consoleErrors = checkedList(
          run?.consoleErrors,
          failures,
          `refresh-${run?.sequence ?? "unknown"}-console-errors`,
          "Refresh-run console errors",
        );
        const failedRequests = checkedList(
          run?.unexplainedFailedRequests,
          failures,
          `refresh-${run?.sequence ?? "unknown"}-failed-requests`,
          "Refresh-run failed requests",
        );
        return (
          run?.sequence === refreshRuns.length - 9 + index &&
          isCandidateBound(run, candidate?.sha) &&
          run?.status === "pass" &&
          run?.refreshPassed === true &&
          run?.coldNavigationPassed === true &&
          run?.backForwardPassed === true &&
          consoleErrors.length === 0 &&
          failedRequests.length === 0
        );
      },
    );
  if (!tenConsecutiveRunsPass) {
    addFailure(
      failures,
      "ten-navigation-runs",
      "The exact candidate needs ten consecutive clean refresh/cold-navigation runs.",
    );
  }

  for (const roleId of REQUIRED_ROLES) {
    const role = roles.find((entry) => entry?.id === roleId);
    const rolePlans = role
      ? checkedList(
          role.plans,
          failures,
          `role-${roleId}-plans`,
          `${roleId} plans`,
        )
      : [];
    const roleChecksPass =
      role &&
      isCandidateBound(role, candidate?.sha) &&
      ROLE_CHECKS.every((check) => role[check] === true) &&
      ["Pro", "Starter"].every((plan) => rolePlans.includes(plan));
    if (!roleChecksPass) {
      addFailure(
        failures,
        `role-${roleId}`,
        `${roleId} needs allowed, denied, direct-route, server, cross-tenant, revocation, Pro, and Starter evidence.`,
      );
    }
  }

  for (const plan of ["Pro", "Starter"]) {
    const planGate = planGates.find((entry) => entry?.plan === plan);
    if (
      !planGate ||
      !isCandidateBound(planGate, candidate?.sha) ||
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
    const viewport = viewports.find((entry) => entry?.id === viewportId);
    if (
      !viewport ||
      !isCandidateBound(viewport, candidate?.sha) ||
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
    !isCandidateBound(evidence?.offline, candidate?.sha) ||
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
    !isCandidateBound(evidence?.search, candidate?.sha) ||
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
    !isCandidateBound(evidence?.performance, candidate?.sha) ||
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
    !isCandidateBound(evidence?.accessibility, candidate?.sha) ||
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
    !isCandidateBound(evidence?.payment, candidate?.sha) ||
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
    !isCandidateBound(diagnostics, candidate?.sha) ||
    diagnosticConsoleErrors.length > 0 ||
    diagnosticFailedRequests.length > 0 ||
    diagnostics.networkObserved !== true
  ) {
    addFailure(
      failures,
      "diagnostics",
      "Diagnostics must include network observation with zero console errors and zero unexplained failed requests.",
    );
  }

  const cleanup = evidence?.cleanup;
  const cleanupPassed =
    isCandidateBound(cleanup, candidate?.sha) &&
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

  const riskIds = new Set();
  for (const risk of topRisks) {
    const validRisk =
      typeof risk?.id === "string" &&
      risk.id.length > 0 &&
      !riskIds.has(risk.id) &&
      typeof risk?.summary === "string" &&
      risk.summary.length > 0 &&
      typeof risk?.releaseBlocking === "boolean";
    if (!validRisk) {
      addFailure(
        failures,
        `risk-${risk?.id ?? "unknown"}`,
        "Every risk needs a unique ID, summary, and explicit boolean releaseBlocking disposition.",
      );
    }
    if (typeof risk?.id === "string") riskIds.add(risk.id);
  }
  if (topRisks.some((risk) => risk?.releaseBlocking === true)) {
    addFailure(failures, "blocking-risk", "No release-blocking risk may remain unmitigated.");
  }
  if (coverageGaps.length > 0) {
    addFailure(failures, "coverage-gaps", "All required release coverage gaps must be closed.");
  }

  const rawScore = scoreEvidence(evidence?.scores, failures);
  if (rawScore !== 100) {
    addFailure(
      failures,
      "score-completeness",
      "Release readiness requires the complete 100-point evidence score.",
    );
  }
  const failedCoreLifecycle = REQUIRED_LIFECYCLES.some(
    (lifecycle) => !hasPass(lifecycles, lifecycle, candidate?.sha),
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

${markdownList(list(evidence?.topRisks), "No residual risks recorded.", (risk) => `**${risk.id}:** ${risk.summary} (${risk.releaseBlocking === true ? "blocking" : "mitigated/accepted"})`)}

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

export async function initializeEvidenceTemplate(
  templatePath,
  runId,
  candidateSha,
  { overwrite = false } = {},
) {
  const resolvedTemplatePath = resolve(templatePath);
  await mkdir(dirname(resolvedTemplatePath), { recursive: true });
  try {
    await writeFile(
      resolvedTemplatePath,
      `${JSON.stringify(createEvidenceTemplate(runId, candidateSha), null, 2)}\n`,
      { encoding: "utf8", flag: overwrite ? "w" : "wx" },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Evidence already exists at ${resolvedTemplatePath}; use --overwrite only after preserving the completed audit.`,
      );
    }
    throw error;
  }
  return resolvedTemplatePath;
}

async function main() {
  const templatePath = option("--template");
  if (templatePath) {
    const runId = option("--run-id");
    const candidateSha = option("--candidate-sha");
    if (!runId || !candidateSha) {
      throw new Error("Template creation requires --run-id and --candidate-sha.");
    }
    const resolvedTemplatePath = await initializeEvidenceTemplate(
      templatePath,
      runId,
      candidateSha,
      { overwrite: process.argv.includes("--overwrite") },
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
  const resolvedInputPath = resolve(inputPath);
  const resolvedOutputPath = resolve(outputPath);
  if (resolvedInputPath === resolvedOutputPath) {
    throw new Error("Evidence input and Markdown output must use different paths.");
  }
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
