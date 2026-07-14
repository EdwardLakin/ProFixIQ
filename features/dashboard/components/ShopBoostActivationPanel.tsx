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

type CanonicalTruth = {
  rowCounts: {
    total: number;
    materialized: number;
    linked: number;
    ignored: number;
    unresolved: number;
    failed: number;
    totalCounted: number;
    mismatch: number;
  };
  materializedEntities: {
    customers: number;
    vehicles: number;
    workOrders: number;
    invoices: number;
  };
};

type IntakeState = {
  id: string;
  status: string;
  createdAt: string;
  processedAt?: string | null;
  canonicalTruth?: CanonicalTruth | null;
  progress?: {
    currentStep: string;
    progressPercent: number;
    lastError?: string | null;
    domainSummaries?: Record<string, DomainSummary>;
  } | null;
  readiness?: {
    import_complete?: boolean;
    canonical_ready?: boolean;
    activation_eligible?: boolean;
    activated?: boolean;
    verify_status?: string | null;
    blockers?: unknown[];
    ui_should_route_forward?: boolean;
  } | null;
};

const ACTIVE_STATUSES = new Set(["queued", "pending", "processing", "running"]);
const FAILED_STATUSES = new Set(["failed", "blocked", "retryable_failed", "terminal_failed"]);

function fmtStep(step: string | undefined): string {
  if (!step) return "Queued";
  return step.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
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
      headline: "No import",
      explanation: "",
      readinessLabel: "EMPTY_RESET",
      isReady: false,
      rowCounts: {
        total: 0,
        materialized: 0,
        linked: 0,
        ignored: 0,
        unresolved: 0,
        failed: 0,
        mismatch: 0,
      },
      materialization: { customers: 0, vehicles: 0, workOrders: 0 },
      showDomains: false,
    };
  }

  const rowCounts = {
    total: asNumber(intake.canonicalTruth?.rowCounts.total),
    materialized: asNumber(intake.canonicalTruth?.rowCounts.materialized),
    linked: asNumber(intake.canonicalTruth?.rowCounts.linked),
    ignored: asNumber(intake.canonicalTruth?.rowCounts.ignored),
    unresolved: asNumber(intake.canonicalTruth?.rowCounts.unresolved),
    failed: asNumber(intake.canonicalTruth?.rowCounts.failed),
    mismatch: asNumber(intake.canonicalTruth?.rowCounts.mismatch),
  };

  const materialization = {
    customers: asNumber(intake.canonicalTruth?.materializedEntities.customers),
    vehicles: asNumber(intake.canonicalTruth?.materializedEntities.vehicles),
    workOrders: asNumber(intake.canonicalTruth?.materializedEntities.workOrders),
  };

  const isRunning = ACTIVE_STATUSES.has(String(intake.status ?? "").toLowerCase());
  const hasFailedState = FAILED_STATUSES.has(String(intake.status ?? "").toLowerCase()) || rowCounts.failed > 0 || rowCounts.mismatch > 0;
  const reviewRequired = rowCounts.unresolved > 0;
  const emptyReset = rowCounts.total === 0;
  const canonicalReady = intake.readiness?.canonical_ready === true;
  const activationReady = intake.readiness?.activation_eligible === true;
  const isReady = !emptyReset && canonicalReady && activationReady && !reviewRequired && !hasFailedState;

  let readinessLabel = "IMPORT_UPLOADED";
  let headline = "Import uploaded";
  let explanation = "Files are uploaded and awaiting materialization.";

  if (emptyReset) {
    readinessLabel = "EMPTY_RESET";
    headline = "Reset / empty intake";
    explanation = "No canonical row outcomes exist for this intake yet.";
  } else if (isRunning || intake.readiness?.import_complete === false) {
    readinessLabel = "MATERIALIZATION_RUNNING";
    headline = "Materialization running";
    explanation = "Importer is currently processing this intake.";
  } else if (hasFailedState) {
    readinessLabel = "FAILED_INCONSISTENT";
    headline = "Failed or inconsistent";
    explanation = "Canonical row outcomes contain failures or accounting mismatch.";
  } else if (reviewRequired) {
    readinessLabel = "REVIEW_REQUIRED";
    headline = "Review required";
    explanation = "Unresolved review items must be completed before go-live.";
  } else if (isReady) {
    readinessLabel = "COMPLETE";
    headline = "Complete";
    explanation = "Canonical truth is complete and activation-ready.";
  }

  return {
    shouldShow: true,
    headline,
    explanation,
    readinessLabel,
    isReady,
    rowCounts,
    materialization,
    showDomains: Object.keys(intake.progress?.domainSummaries ?? {}).length > 0,
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

  return (
    <section className="mb-2.5 rounded-xl border border-cyan-400/25 bg-[var(--theme-gradient-panel)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/70">Shop Boost Operational Status</p>
          <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{visibility.headline}</h3>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{visibility.explanation}</p>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Current stage: <span className="font-medium text-[color:var(--theme-text-primary)]">{fmtStep(intake.progress?.currentStep ?? intake.status)}</span>
          </p>
        </div>
        <div className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]">
          <div>State: <span className="font-semibold">{visibility.readinessLabel}</span></div>
          <div className="text-[color:var(--theme-text-secondary)]">Derived from canonical row outcomes for this intake.</div>
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-[color:var(--theme-surface-subtle)]"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${percent}%` }} /></div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 text-xs text-[color:var(--theme-text-secondary)]">
          <div className="font-medium text-[color:var(--theme-text-primary)]">Materialized</div>
          <div>
            Customers: {visibility.materialization.customers.toLocaleString()} • Vehicles: {visibility.materialization.vehicles.toLocaleString()} • Work orders: {" "}
            {visibility.materialization.workOrders.toLocaleString()}
          </div>
        </div>
        <div className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 text-xs text-[color:var(--theme-text-secondary)]">
          <div className="font-medium text-[color:var(--theme-text-primary)]">Rows processed</div>
          <div>{visibility.rowCounts.total.toLocaleString()} total • {visibility.rowCounts.materialized.toLocaleString()} materialized • {visibility.rowCounts.linked.toLocaleString()} linked</div>
        </div>
        <div className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 text-xs text-[color:var(--theme-text-secondary)]">
          <div className="font-medium text-[color:var(--theme-text-primary)]">Integrity truth</div>
          <div>{visibility.rowCounts.unresolved.toLocaleString()} unresolved • {visibility.rowCounts.failed.toLocaleString()} failed • mismatch {visibility.rowCounts.mismatch.toLocaleString()}</div>
        </div>
      </div>

      {visibility.isReady ? (
        <div className="mt-3 rounded-md border border-emerald-400/35 bg-emerald-950/20 p-2 text-xs text-emerald-100">
          <div className="font-semibold">READY_FOR_GO_LIVE</div>
          <div className="mt-1">Canonical readiness is complete for the current intake.</div>
        </div>
      ) : null}

      {visibility.showDomains ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {Object.entries(domains).map(([name, summary]) => (
            <div key={name} className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 text-xs text-[color:var(--theme-text-secondary)]">
              <div className="font-medium text-[color:var(--theme-text-primary)]">{fmtStep(name)}</div>
              <div>Inserted: {summary.inserted} • Updated: {summary.updated} • Skipped: {summary.skipped} • Failed: {summary.failed}</div>
              {summary.note ? <div className="text-[color:var(--theme-text-secondary)]">{summary.note}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Link href="/dashboard/owner/reports" className="rounded-md border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]">
          Open Shop Health
        </Link>
        <Link href="/dashboard/setup/review" className="rounded-md border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]">
          Open legacy guided review
        </Link>
        <Link href={`/api/shop-boost/intakes/${intake.id}/report?download=1`} className="rounded-md border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]">
          Download migration report
        </Link>
      </div>

      {intake.progress?.lastError ? <p className="mt-2 text-xs text-amber-300">{intake.progress.lastError}</p> : null}
    </section>
  );
}
