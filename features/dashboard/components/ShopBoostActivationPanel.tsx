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
  } | null;
};

const ACTIVE_STATUSES = new Set(["queued", "pending", "processing"]);
const ACTIONABLE_STATUSES = new Set(["failed", "blocked", "requires_review", "review_needed"]);
const RECENT_COMPLETED_DAYS = 14;

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

function isRecentlyProcessed(intake: IntakeState): boolean {
  const ts = intake.processedAt ?? intake.createdAt;
  if (!ts) return false;
  const ageMs = Date.now() - new Date(ts).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000;
}

function getPanelMode(intake: IntakeState | null): "hidden" | "full" | "summary" {
  if (!intake) return "hidden";
  if (ACTIVE_STATUSES.has(intake.status) || ACTIONABLE_STATUSES.has(intake.status)) return "full";

  const completionState = intake.progress?.completionState;
  const trustStatus = intake.progress?.migration_story?.trust_status;
  if (trustStatus && trustStatus !== "READY" && isRecentlyProcessed(intake)) return "full";
  const isCompletedLike =
    intake.readiness?.ui_should_route_forward === true ||
    completionState === "READY_FOR_GO_LIVE" ||
    completionState === "COMPLETED_CLEAN" ||
    completionState === "COMPLETED_WITH_REVIEW" ||
    completionState === "COMPLETED_WITH_WARNINGS" ||
    trustStatus === "READY";

  return isCompletedLike && isRecentlyProcessed(intake) ? "summary" : "hidden";
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
  const mode = useMemo(() => getPanelMode(intake), [intake]);

  if (!eligible || loading || !intake || mode === "hidden") return null;

  const domains = intake.progress?.domainSummaries ?? {};
  const story = intake.progress?.migration_story;
  const fallbackConfidence = story ? Math.round(story.confidence_score * 100) : 0;

  if (mode === "summary") {
    return (
      <section className="mb-2.5 rounded-xl border border-emerald-300/30 bg-[linear-gradient(140deg,rgba(10,26,18,0.65),rgba(7,12,25,0.84))] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/75">Shop Boost Summary</p>
            <h3 className="text-sm font-semibold text-emerald-100">Recent migration completion</h3>
            <p className="mt-1 text-xs text-emerald-100/80">
              Completed {fmtStep(intake.progress?.completionState ?? intake.status)} with confidence {fallbackConfidence}%.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/dashboard/setup/review" className="rounded-md border border-amber-300/35 px-2.5 py-1 text-amber-100 hover:bg-white/5">Open review queue</Link>
            <Link href="/dashboard" className="rounded-md border border-emerald-300/45 px-2.5 py-1 text-emerald-100 hover:bg-white/5">Open dashboard</Link>
            <Link href={`/api/shop-boost/intakes/${intake.id}/report?download=1`} className="rounded-md border border-white/25 px-2.5 py-1 text-neutral-100 hover:bg-white/5">Download report</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-2.5 rounded-xl border border-[var(--brand-accent,#E39A6E)]/30 bg-[linear-gradient(140deg,rgba(22,12,8,0.72),rgba(7,12,25,0.86))] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">Shop Boost Trust Panel</p>
          <h3 className="text-sm font-semibold text-neutral-100">Migration Mission Control</h3>
          <p className="mt-1 text-xs text-neutral-300">Status: <span className="font-medium text-neutral-100">{fmtStep(intake.progress?.currentStep ?? intake.status)}</span></p>
        </div>
        <div className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-neutral-200">
          <div>Confidence Score: <span className="font-semibold">{fallbackConfidence}%</span></div>
          <div className="text-neutral-400">Derived from real row outcomes, reviews, failures, and integrity checks.</div>
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--brand-accent,#E39A6E)] transition-all" style={{ width: `${percent}%` }} /></div>

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

      {(intake.readiness?.ui_should_route_forward === true ||
        intake.progress?.completionState === "READY_FOR_GO_LIVE" ||
        story?.trust_status === "READY") ? (
        <div className="mt-3 rounded-md border border-emerald-300/30 bg-emerald-950/20 p-2 text-xs text-emerald-100">
          <div className="font-semibold">Go live complete</div>
          <div className="mt-1">Confidence score: {fallbackConfidence}% • What you reviewed: {story?.review_resolved_count ?? 0} • What was ignored: {story?.ignored_count ?? 0}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/dashboard/setup/review" className="rounded-md border border-amber-300/35 px-2.5 py-1 text-amber-100 hover:bg-white/5">Open Shop Boost review + actions</Link>
            <Link href="/dashboard" className="rounded-md border border-emerald-300/50 px-2.5 py-1 text-emerald-100 hover:bg-white/5">Enter your system</Link>
            <Link href={`/api/shop-boost/intakes/${intake.id}/report?download=1`} className="rounded-md border border-white/25 px-2.5 py-1 text-neutral-100 hover:bg-white/5">View full migration report</Link>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link href="/dashboard/setup/review" className="rounded-md border border-amber-300/35 px-2.5 py-1 text-amber-100 hover:bg-white/5">Open Shop Boost review queue</Link>
          <Link href={`/api/shop-boost/intakes/${intake.id}/report?download=1`} className="rounded-md border border-white/25 px-2.5 py-1 text-neutral-100 hover:bg-white/5">Download migration report</Link>
        </div>
      )}

      {intake.progress?.lastError ? <p className="mt-2 text-xs text-amber-300">{intake.progress.lastError}</p> : null}
    </section>
  );
}
