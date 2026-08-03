"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, AlertTriangle } from "lucide-react";

import type {
  OwnerIntelligenceReport,
  OwnerReportRange,
} from "@/features/owner/reports/ownerIntelligenceTypes";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number | null): string {
  return value == null ? "N/A" : `${value.toFixed(1)}%`;
}

function MiniCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-[10px] leading-4 text-[color:var(--theme-text-secondary)]">
        {detail}
      </div>
    </div>
  );
}

export default function ReportsPerformanceWidget({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [range, setRange] = useState<OwnerReportRange>("monthly");
  const [report, setReport] = useState<OwnerIntelligenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/reports/owner?range=${range}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as
          | OwnerIntelligenceReport
          | { error?: string }
          | null;
        if (!response.ok || !json || !("metricVersion" in json)) {
          throw new Error(
            json && "error" in json && json.error
              ? json.error
              : "Unable to load owner intelligence",
          );
        }
        setReport(json);
      })
      .catch((fetchError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load owner intelligence",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range]);

  return (
    <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300/80">
            Owner intelligence
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
            Verified performance
          </h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Issued financials and shop-standard workforce metrics.
          </p>
        </div>
        <div className="flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-1">
          {(["weekly", "monthly"] as OwnerReportRange[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={`min-h-8 rounded-full px-3 text-[10px] font-semibold ${
                range === item
                  ? "bg-orange-400 text-slate-950"
                  : "text-[color:var(--theme-text-secondary)]"
              }`}
            >
              {item === "weekly" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 h-28 animate-pulse rounded-xl bg-[color:var(--theme-surface-inset)]" />
      ) : null}

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {!loading && report ? (
        <>
          <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
            <MiniCard
              label="Issued revenue"
              value={money(report.financial.issuedRevenue.current, report.shop.currency)}
              detail={`${report.financial.issuedInvoices.current} issued invoices`}
            />
            <MiniCard
              label="Known contribution"
              value={money(report.financial.knownContribution.current, report.shop.currency)}
              detail={`${report.financial.costCoveragePct.toFixed(0)}% cost coverage`}
            />
            <MiniCard
              label="Efficiency"
              value={pct(report.workforce.efficiencyPct)}
              detail="Billed ÷ job-clock hours"
            />
            <MiniCard
              label="Productivity"
              value={pct(report.workforce.productivityPct)}
              detail="Job-clock ÷ attendance hours"
            />
          </div>
          <Link
            href="/dashboard/owner/reports"
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-orange-300/30 bg-orange-400/10 px-3 text-xs font-semibold text-orange-200 hover:bg-orange-400/20"
          >
            Open full intelligence <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </>
      ) : null}
    </section>
  );
}
