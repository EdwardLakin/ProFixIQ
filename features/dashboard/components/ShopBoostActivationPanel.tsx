"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DomainSummary = {
  status: "success" | "warning" | "failed";
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  note?: string | null;
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
  } | null;
};

const ACTIVE_STATUSES = new Set(["queued", "pending", "processing"]);

function fmtStep(step: string | undefined): string {
  if (!step) return "Queued";
  return step.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function completionCopy(state: string | undefined): { title: string; next: string } {
  if (state === "READY_FOR_GO_LIVE") return { title: "Your shop is ready. You can start using ProFixIQ.", next: "Start operating now" };
  if (state === "COMPLETED_WITH_REVIEW") return { title: "Import complete with items needing review.", next: "Resolve review items" };
  if (state === "PARTIAL_FAILURE") return { title: "Some data could not be fully imported.", next: "Re-run failed items" };
  if (state === "NOT_READY") return { title: "Action required before your data is usable.", next: "Resolve blockers" };
  return { title: "Migration in progress", next: "Monitor import" };
}

export default function ShopBoostActivationPanel() {
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    const res = await fetch("/api/shop-boost/intakes/latest", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; intake?: IntakeState | null };
    if (json.ok) setIntake(json.intake ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    if (!intake || !ACTIVE_STATUSES.has(intake.status)) return;
    const interval = window.setInterval(() => void loadStatus(), 5000);
    return () => window.clearInterval(interval);
  }, [intake?.id, intake?.status]);

  const percent = useMemo(() => Math.max(0, Math.min(100, intake?.progress?.progressPercent ?? 0)), [intake?.progress?.progressPercent]);

  if (loading || !intake) return null;

  const result = intake.progress?.resultSummary ?? {};
  const domains = intake.progress?.domainSummaries ?? {};
  const reviewByDomain = ((result.rowResults as { byDomain?: Record<string, { review?: number; success?: number; failed?: number }> } | undefined)?.byDomain ?? {}) || {};
  const reviewCount = Number(intake.progress?.review_count ?? 0);
  const failedCount = Number(intake.progress?.failed_count ?? 0);

  const integrityChecks = (intake.progress?.integrity?.checks as Record<string, number> | undefined) ?? {};
  const blockers =
    Number(integrityChecks.vehicles_missing_customer_linkage ?? 0) +
    Number(integrityChecks.work_orders_missing_customer_linkage ?? 0) +
    Number(integrityChecks.work_orders_missing_vehicle_linkage ?? 0) +
    Number(integrityChecks.orphan_work_order_lines ?? 0) +
    Number(integrityChecks.inventory_without_part_linkage ?? 0);
  const nonBlocking =
    Number(integrityChecks.duplicate_customer_risk ?? 0) +
    Number(integrityChecks.duplicate_vehicle_risk ?? 0) +
    Number(integrityChecks.duplicate_part_risk ?? 0) +
    reviewCount;

  const resolvedRatio = Math.max(0, Math.min(1, 1 - (reviewCount + failedCount) / Math.max(1, reviewCount + failedCount + Number(result.customersImported ?? 0) + Number(result.vehiclesImported ?? 0) + Number(result.workOrdersImported ?? 0) + Number(result.partsImported ?? 0))));
  const autoMatchRatio = Math.max(0, Math.min(1, Number(result.customersImported ?? 0) + Number(result.vehiclesImported ?? 0) > 0 ? 0.8 : 0.5));
  const reviewPenalty = Math.max(0, Math.min(1, reviewCount / Math.max(1, reviewCount + 20)));
  const failPenalty = Math.max(0, Math.min(1, failedCount / Math.max(1, failedCount + 10)));
  const overallConfidenceScore = Math.max(0, Math.min(1, (resolvedRatio * 0.45) + (autoMatchRatio * 0.25) + ((1 - reviewPenalty) * 0.2) + ((1 - failPenalty) * 0.1)));
  const confidenceLabel = overallConfidenceScore >= 0.85 ? "HIGH" : overallConfidenceScore >= 0.65 ? "MEDIUM" : "LOW";

  const completionState = intake.progress?.completionState;
  const copy = completionCopy(completionState);

  return (
    <section className="mb-2.5 rounded-xl border border-[var(--brand-accent,#E39A6E)]/30 bg-[linear-gradient(140deg,rgba(22,12,8,0.72),rgba(7,12,25,0.86))] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">Migration Confidence Summary</p>
          <h3 className="text-sm font-semibold text-neutral-100">{copy.title}</h3>
          <p className="mt-1 text-xs text-neutral-300">Status: <span className="font-medium text-neutral-100">{fmtStep(intake.progress?.currentStep ?? intake.status)}</span></p>
        </div>
        <div className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-neutral-200">
          <div>Confidence: <span className="font-semibold">{confidenceLabel} ({Math.round(overallConfidenceScore * 100)}%)</span></div>
          <div className="text-neutral-400">Weighted by resolved %, review load, and failures.</div>
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--brand-accent,#E39A6E)] transition-all" style={{ width: `${percent}%` }} /></div>

      <div className={`mt-3 rounded-md border p-2 text-xs ${blockers === 0 ? "border-emerald-400/30 bg-emerald-950/20 text-emerald-100" : "border-amber-400/35 bg-amber-950/20 text-amber-100"}`}>
        {blockers === 0 ? "You can start using ProFixIQ now." : "Complete these items before your data is ready."}
        <div className="mt-1">Operational blockers: {blockers} • Non-blocking issues: {nonBlocking}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/dashboard/setup/review" className="rounded-md border border-white/25 px-2.5 py-1 text-neutral-100 hover:bg-white/5">{blockers === 0 ? "Continue setup later" : "Resolve blockers"}</Link>
          <Link href="/dashboard/setup/review" className="rounded-md border border-amber-300/35 px-2.5 py-1 text-amber-100 hover:bg-white/5">{copy.next}</Link>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-neutral-300 md:grid-cols-2">
        {[
          ["Customers", reviewByDomain.customers],
          ["Vehicles", reviewByDomain.vehicles],
          ["Parts", reviewByDomain.parts],
          ["Work history", reviewByDomain.history],
        ].map(([label, row]) => (
          <div key={String(label)} className="rounded-md border border-white/10 bg-black/25 p-2">
            <div className="font-medium text-neutral-100">{String(label)}</div>
            <div>Imported: {Number((row as any)?.success ?? 0).toLocaleString()} • Review needed: {Number((row as any)?.review ?? 0).toLocaleString()} • Failed: {Number((row as any)?.failed ?? 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

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

      {(completionState === "READY_FOR_GO_LIVE" || intake.status === "completed") ? (
        <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2 text-xs">
          <div className="font-medium text-neutral-100">Get operational fast</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/customers" className="rounded-md border border-white/20 px-2.5 py-1 text-neutral-100 hover:bg-white/5">View your customers</Link>
            <Link href="/work-orders" className="rounded-md border border-white/20 px-2.5 py-1 text-neutral-100 hover:bg-white/5">Open your first work order</Link>
            <Link href="/parts/inventory" className="rounded-md border border-white/20 px-2.5 py-1 text-neutral-100 hover:bg-white/5">Check your inventory</Link>
            <Link href="/dashboard" className="rounded-md border border-white/20 px-2.5 py-1 text-neutral-100 hover:bg-white/5">Review recent jobs</Link>
            <Link href="/dashboard/owner/settings" className="rounded-md border border-white/20 px-2.5 py-1 text-neutral-100 hover:bg-white/5">Finish remaining setup</Link>
          </div>
        </div>
      ) : null}

      {intake.progress?.lastError ? <p className="mt-2 text-xs text-amber-300">{intake.progress.lastError}</p> : null}
    </section>
  );
}
