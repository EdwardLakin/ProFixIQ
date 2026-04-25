"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DomainSummary = {
  status: "success" | "warning" | "failed";
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  note?: string | null;
};

type MigrationStory = {
  total_rows: number;
  materialized_count: number;
  linked_count: number;
  review_resolved_count: number;
  ignored_count: number;
  failed_count: number;
  key_fixes: string[];
  risk_flags: {
    duplicates_detected: boolean;
    missing_identifiers: boolean;
    inconsistent_data_patterns: boolean;
  };
  trust_statement: string;
  trust_status: "READY" | "NEEDS REVIEW" | "PARTIAL" | "BLOCKED";
  blockers: string[];
  confidence_score: number;
};

type IntakeState = {
  id: string;
  status: string;
  createdAt: string;
  processedAt?: string | null;
  progress?: {
    currentStep: string;
    progressPercent: number;
    lastError?: string | null;
    resultSummary?: Record<string, unknown>;
    domainSummaries?: Record<string, DomainSummary>;
    review_count?: number;
    failed_count?: number;
    completionState?: "COMPLETED_CLEAN" | "COMPLETED_WITH_REVIEW" | "COMPLETED_WITH_WARNINGS" | "PARTIAL_FAILURE" | "READY_FOR_GO_LIVE" | "NOT_READY";
    integrity?: Record<string, unknown>;
    migration_story?: MigrationStory;
  } | null;
  readiness?: {
    snapshot_complete?: boolean;
    import_complete?: boolean;
    canonical_ready?: boolean;
    activation_eligible?: boolean;
    activated?: boolean;
    verify_status?: string | null;
    blockers?: unknown[];
    ui_should_route_forward?: boolean;
    canonical_summary?: Record<string, unknown> | null;
  } | null;
};

const ACTIVE_STATUSES = new Set(["queued", "pending", "processing", "running"]);
const ACTIONABLE_STATUSES = new Set(["failed", "blocked", "requires_review", "review_needed", "partial_failure", "not_ready"]);

function fmtStep(step: string | undefined): string {
  if (!step) return "Queued";
  return step.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

const statusTone: Record<MigrationStory["trust_status"], string> = {
  READY: "border-emerald-400/35 bg-emerald-950/30 text-emerald-100",
  "NEEDS REVIEW": "border-amber-400/35 bg-amber-950/20 text-amber-100",
  PARTIAL: "border-orange-400/35 bg-orange-950/20 text-orange-100",
  BLOCKED: "border-rose-400/35 bg-rose-950/25 text-rose-100",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function buildVisibilityModel(intake: IntakeState | null) {
  if (!intake) {
    return {
      shouldShow: false,
      statusTone: "good" as const,
      headline: "Ready",
      explanation: "",
      pendingReviewCount: 0,
      failedCount: 0,
      integrityErrors: [] as string[],
      materialization: { customers: 0, vehicles: 0, workOrders: 0 },
      flags: {
        importPending: false,
        canonicalNotReady: false,
        activationNotReady: false,
        unresolvedReview: false,
        hasIntegrityIssues: false,
        materializationGap: false,
      },
    };
  }

  const canonicalSummary = asRecord(
    intake.readiness?.canonical_summary ??
      intake.progress?.resultSummary?.canonicalSummary ??
      intake.progress?.integrity?.canonicalSummary,
  );
  const expected = asRecord(canonicalSummary.expected);
  const actual = asRecord(canonicalSummary.actual);
  const gaps = asRecord(canonicalSummary.gaps);

  const status = String(intake.status ?? "").toLowerCase();
  const completionState = String(intake.progress?.completionState ?? "").toUpperCase();
  const verifyStatus = String(intake.readiness?.verify_status ?? "").toLowerCase();
  const trustStatus = intake.progress?.migration_story?.trust_status;

  const pendingReviewCount = asNumber(intake.progress?.review_count);
  const failedCount = asNumber(intake.progress?.failed_count);
  const integrityRecord = asRecord(intake.progress?.integrity);
  const integrityErrors = Array.isArray(integrityRecord.integrityErrors)
    ? integrityRecord.integrityErrors.map((item) => String(item))
    : [];

  const vehiclesExpected = asNumber(expected.vehicles);
  const workOrdersExpected = asNumber(expected.workOrders);
  const customersMaterialized = asNumber(actual.customers);
  const vehiclesMaterialized = asNumber(actual.vehicles);
  const workOrdersMaterialized = asNumber(actual.workOrders);

  const importPending =
    ACTIVE_STATUSES.has(status) ||
    verifyStatus === "pending" ||
    verifyStatus === "partial" ||
    completionState === "NOT_READY" ||
    completionState === "PARTIAL_FAILURE";
  const canonicalNotReady = intake.readiness?.canonical_ready === false || String(canonicalSummary.status ?? "").toLowerCase() === "not_ready";
  const activationNotReady = intake.readiness?.activation_eligible === false || intake.readiness?.ui_should_route_forward === false;
  const unresolvedReview = pendingReviewCount > 0 || ACTIONABLE_STATUSES.has(status) || trustStatus === "NEEDS REVIEW" || trustStatus === "BLOCKED";
  const hasIntegrityIssues = integrityErrors.length > 0 || failedCount > 0;
  const materializationGap =
    (vehiclesExpected > 0 && vehiclesMaterialized === 0) ||
    (workOrdersExpected > 0 && workOrdersMaterialized === 0) ||
    gaps.missingVehicles === true ||
    gaps.missingWorkOrders === true;

  const shouldShow =
    importPending ||
    canonicalNotReady ||
    activationNotReady ||
    unresolvedReview ||
    hasIntegrityIssues ||
    materializationGap;

  const statusTone =
    hasIntegrityIssues || trustStatus === "BLOCKED"
      ? "critical"
      : unresolvedReview || canonicalNotReady || materializationGap || importPending || activationNotReady
        ? "attention"
        : "good";

  let headline = "Ready for go-live";
  if (hasIntegrityIssues || trustStatus === "BLOCKED") headline = "Blocking issues detected";
  else if (unresolvedReview) headline = "Review needed";
  else if (importPending) headline = "Import pending";
  else if (canonicalNotReady || materializationGap || activationNotReady) headline = "Not ready";

  let explanation = "Import and canonicalization are healthy. No operator action needed.";
  if (hasIntegrityIssues) explanation = "Integrity or failed materialization issues require action before activation.";
  else if (unresolvedReview) explanation = "Unresolved review items are preventing safe canonical activation.";
  else if (importPending) explanation = "Import/canonicalization is still running or incomplete.";
  else if (materializationGap) explanation = "Canonical entities are missing expected materialized records.";
  else if (canonicalNotReady || activationNotReady) explanation = "Canonical readiness checks have not passed yet.";

  return {
    shouldShow,
    statusTone,
    headline,
    explanation,
    pendingReviewCount,
    failedCount,
    integrityErrors,
    materialization: {
      customers: customersMaterialized,
      vehicles: vehiclesMaterialized,
      workOrders: workOrdersMaterialized,
    },
    flags: {
      importPending,
      canonicalNotReady,
      activationNotReady,
      unresolvedReview,
      hasIntegrityIssues,
      materializationGap,
    },
  };
}

export default function ShopBoostActivationPanel({ eligible = false }: { eligible?: boolean }) {
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/shop-boost/intakes/latest", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; intake?: IntakeState | null };
    if (json.ok) setIntake(json.intake ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!eligible) {
      setLoading(false);
      return;
    }
    void loadStatus();
  }, [eligible, loadStatus]);

  useEffect(() => {
    if (!intake || !ACTIVE_STATUSES.has(intake.status)) return;
    const interval = window.setInterval(() => void loadStatus(), 5000);
    return () => window.clearInterval(interval);
  }, [intake, loadStatus]);

  const percent = useMemo(() => Math.max(0, Math.min(100, intake?.progress?.progressPercent ?? 0)), [intake?.progress?.progressPercent]);
  const visibility = useMemo(() => buildVisibilityModel(intake), [intake]);

  if (!eligible || loading || !intake || !visibility.shouldShow) return null;

  const domains = intake.progress?.domainSummaries ?? {};
  const story = intake.progress?.migration_story;
  const fallbackConfidence = story ? Math.round(story.confidence_score * 100) : 0;

  return (
    <section
      className={`mb-2.5 rounded-xl border p-3 ${
        visibility.statusTone === "critical"
          ? "border-rose-400/35 bg-[linear-gradient(140deg,rgba(52,10,20,0.72),rgba(7,12,25,0.9))]"
          : "border-[var(--brand-accent,#E39A6E)]/30 bg-[linear-gradient(140deg,rgba(22,12,8,0.72),rgba(7,12,25,0.86))]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">Shop Boost Operational Status</p>
          <h3 className="text-sm font-semibold text-neutral-100">{visibility.headline}</h3>
          <p className="mt-1 text-xs text-neutral-300">{visibility.explanation}</p>
          <p className="mt-1 text-xs text-neutral-400">
            Current stage: <span className="font-medium text-neutral-100">{fmtStep(intake.progress?.currentStep ?? intake.status)}</span>
          </p>
        </div>
        <div className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-neutral-200">
          <div>Confidence Score: <span className="font-semibold">{fallbackConfidence}%</span></div>
          <div className="text-neutral-400">Derived from real row outcomes, reviews, failures, and integrity checks.</div>
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--brand-accent,#E39A6E)] transition-all" style={{ width: `${percent}%` }} /></div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
          <div className="font-medium text-neutral-100">Materialized</div>
          <div>
            Customers: {visibility.materialization.customers.toLocaleString()} • Vehicles: {visibility.materialization.vehicles.toLocaleString()} • Work orders:{" "}
            {visibility.materialization.workOrders.toLocaleString()}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
          <div className="font-medium text-neutral-100">Review pressure</div>
          <div>{visibility.pendingReviewCount.toLocaleString()} unresolved • {visibility.failedCount.toLocaleString()} failed</div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
          <div className="font-medium text-neutral-100">Readiness truth</div>
          <div>
            Import: {visibility.flags.importPending ? "Pending" : "Complete"} • Canonical: {visibility.flags.canonicalNotReady ? "Not ready" : "Ready"} • Activation:{" "}
            {visibility.flags.activationNotReady ? "Not ready" : "Ready"}
          </div>
        </div>
      </div>

      {story ? (
        <>
          <div className={`mt-3 rounded-md border p-2 text-xs ${statusTone[story.trust_status]}`}>
            <div className="font-semibold">{story.trust_status}</div>
            <div className="mt-1">{story.trust_statement}</div>
            <div className="mt-2 text-[11px] text-neutral-200">We automatically matched your records where possible. We flagged uncertain data for review. Nothing was changed without validation.</div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
              <div className="font-medium text-neutral-100">Rows processed</div>
              <div>{story.total_rows.toLocaleString()} total • {story.materialized_count.toLocaleString()} materialized • {story.linked_count.toLocaleString()} linked</div>
            </div>
            <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
              <div className="font-medium text-neutral-100">Review outcomes</div>
              <div>{story.review_resolved_count.toLocaleString()} resolved • {story.ignored_count.toLocaleString()} ignored • {story.failed_count.toLocaleString()} failed</div>
            </div>
            <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
              <div className="font-medium text-neutral-100">Risk flags</div>
              <div>Duplicates: {story.risk_flags.duplicates_detected ? "Yes" : "No"} • Missing IDs: {story.risk_flags.missing_identifiers ? "Yes" : "No"} • Inconsistent patterns: {story.risk_flags.inconsistent_data_patterns ? "Yes" : "No"}</div>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
            <div className="font-medium text-neutral-100">What we automatically fixed</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {story.key_fixes.map((fix) => (
                <li key={fix}>{fix}</li>
              ))}
            </ul>
          </div>

          {story.trust_status !== "READY" ? (
            <div className="mt-3 rounded-md border border-amber-400/35 bg-amber-950/20 p-2 text-xs text-amber-100">
              <div className="font-semibold">Exact blockers</div>
              {story.blockers.length > 0 ? (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {story.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1">Review queue still has unresolved items.</div>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {Object.keys(domains).length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {Object.entries(domains).map(([name, summary]) => (
            <div key={name} className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
              <div className="font-medium text-neutral-100">{fmtStep(name)}</div>
              <div>Inserted: {summary.inserted} • Updated: {summary.updated} • Skipped: {summary.skipped} • Failed: {summary.failed}</div>
              {summary.note ? <div className="text-neutral-400">{summary.note}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {visibility.integrityErrors.length > 0 ? (
        <div className="mt-3 rounded-md border border-rose-400/35 bg-rose-950/25 p-2 text-xs text-rose-100">
          <div className="font-semibold">Integrity blockers</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {visibility.integrityErrors.slice(0, 5).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Link href="/dashboard/setup/review" className="rounded-md border border-amber-300/35 px-2.5 py-1 text-amber-100 hover:bg-white/5">
          {visibility.flags.unresolvedReview ? "Open guided review" : "Resume import review"}
        </Link>
        <Link href="/dashboard/owner/reports" className="rounded-md border border-white/25 px-2.5 py-1 text-neutral-100 hover:bg-white/5">
          Open Shop Health
        </Link>
        <Link href={`/api/shop-boost/intakes/${intake.id}/report?download=1`} className="rounded-md border border-white/25 px-2.5 py-1 text-neutral-100 hover:bg-white/5">
          Download migration report
        </Link>
      </div>

      {intake.progress?.lastError ? <p className="mt-2 text-xs text-amber-300">{intake.progress.lastError}</p> : null}
    </section>
  );
}
