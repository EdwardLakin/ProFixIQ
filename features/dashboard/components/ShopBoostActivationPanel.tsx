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
  } | null;
};

const ACTIVE_STATUSES = new Set(["queued", "pending", "processing"]);

function fmtStep(step: string | undefined): string {
  if (!step) return "Queued";
  return step.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function ShopBoostActivationPanel() {
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [kickoffBusy, setKickoffBusy] = useState(false);

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

    const interval = window.setInterval(() => {
      void loadStatus();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [intake?.id, intake?.status]);

  const kickoff = async () => {
    if (!intake?.id) return;
    setKickoffBusy(true);
    try {
      await fetch("/api/shop-boost/intakes/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId: intake.id }),
      });
      await loadStatus();
    } finally {
      setKickoffBusy(false);
    }
  };

  const percent = useMemo(() => {
    const raw = intake?.progress?.progressPercent ?? 0;
    return Math.max(0, Math.min(100, raw));
  }, [intake?.progress?.progressPercent]);

  if (loading || !intake) return null;

  const result = intake.progress?.resultSummary ?? {};
  const domains = intake.progress?.domainSummaries ?? {};

  return (
    <section className="mb-2.5 rounded-xl border border-[var(--brand-accent,#E39A6E)]/30 bg-[linear-gradient(140deg,rgba(22,12,8,0.72),rgba(7,12,25,0.86))] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">Activation & Shop Boost</p>
          <h3 className="text-sm font-semibold text-neutral-100">{intake.status === "completed" ? "Your shop is live in ProFixIQ" : "Setting up your shop while you work"}</h3>
          <p className="mt-1 text-xs text-neutral-300">
            Status: <span className="font-medium text-neutral-100">{fmtStep(intake.progress?.currentStep ?? intake.status)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {(intake.status === "failed" || intake.status === "completed_with_errors") && (
            <button
              type="button"
              onClick={kickoff}
              disabled={kickoffBusy}
              className="rounded-md border border-amber-300/35 px-2.5 py-1 text-amber-100 hover:bg-white/5 disabled:opacity-60"
            >
              {kickoffBusy ? "Retrying…" : "Retry migration"}
            </button>
          )}
          <Link href="/onboarding/shop-boost" className="rounded-md border border-white/20 px-2.5 py-1 text-neutral-200 hover:bg-white/5">
            Upload more data
          </Link>
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[var(--brand-accent,#E39A6E)] transition-all" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-neutral-300 md:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-black/20 p-2">
          <div className="text-neutral-400">Customers imported</div>
          <div className="text-sm font-semibold text-white">{Number(result.customersImported ?? 0).toLocaleString()}</div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-2">
          <div className="text-neutral-400">Vehicles imported</div>
          <div className="text-sm font-semibold text-white">{Number(result.vehiclesImported ?? 0).toLocaleString()}</div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-2">
          <div className="text-neutral-400">Work history imported</div>
          <div className="text-sm font-semibold text-white">{Number(result.workOrdersImported ?? 0).toLocaleString()}</div>
        </div>
      </div>

      {Object.keys(domains).length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {Object.entries(domains).map(([name, summary]) => (
            <div key={name} className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-neutral-300">
              <div className="font-medium text-neutral-100">{fmtStep(name)}</div>
              <div>Inserted: {summary.inserted} • Updated: {summary.updated} • Skipped: {summary.skipped}</div>
              {summary.failed > 0 ? <div className="text-amber-300">Failed rows: {summary.failed}</div> : null}
              {summary.note ? <div className="text-neutral-400">{summary.note}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {(intake.status === "completed" || intake.status === "completed_with_errors") && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link href="/customers" className="rounded-md border border-white/20 px-2.5 py-1 text-neutral-100 hover:bg-white/5">View results</Link>
          <Link href="/menu_item_suggestions" className="rounded-md border border-white/20 px-2.5 py-1 text-neutral-100 hover:bg-white/5">Review suggestions</Link>
        </div>
      )}

      {intake.progress?.lastError ? <p className="mt-2 text-xs text-amber-300">{intake.progress.lastError}</p> : null}
    </section>
  );
}
