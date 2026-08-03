"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { toDashboardFallbackMessage } from "@/features/dashboard/lib/widget-fallback";
import type { OwnerIntelligenceReport } from "@/features/owner/reports/ownerIntelligenceTypes";

function money(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN)) return "$0.00";
  return `$${Number(n).toFixed(2)}`;
}

export default function RevenueWatchWidget({
  shopId,
  goal = 10000,
  embedded = false,
}: {
  shopId: string | null;
  goal?: number;
  embedded?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revenue, setRevenue] = useState(0);
  const [knownContribution, setKnownContribution] = useState(0);
  const [issuedInvoices, setIssuedInvoices] = useState(0);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/reports/owner?range=monthly", {
          cache: "no-store",
        });
        const stats = (await response.json().catch(() => null)) as
          | OwnerIntelligenceReport
          | { error?: string }
          | null;
        if (!response.ok || !stats || !("metricVersion" in stats)) {
          throw new Error(
            stats && "error" in stats && stats.error
              ? stats.error
              : "Owner intelligence is unavailable.",
          );
        }
        if (!cancelled) {
          setRevenue(stats.financial.issuedRevenue.current);
          setKnownContribution(stats.financial.knownContribution.current);
          setIssuedInvoices(stats.financial.issuedInvoices.current);
        }
      } catch (e) {
        if (!cancelled) {
          setError(toDashboardFallbackMessage(e, "Data unavailable. Try refresh."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((revenue / goal) * 100))) : 0;

  const content = (
    <>
      {loading ? (
        <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading revenue watch…</div>
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">
          {error}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Issued revenue" value={money(revenue)} tone="primary" />
            <Metric label="Known contribution" value={money(knownContribution)} tone="accent" />
            <Metric label="Issued invoices" value={String(issuedInvoices)} />
          </div>

          <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-[11px] text-[color:var(--theme-text-secondary)]">
              <span>Revenue vs goal</span>
              <span>{pct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,_color-mix(in_srgb,var(--brand-primary)_90%,var(--theme-text-inverse)_10%),_color-mix(in_srgb,var(--brand-accent)_85%,var(--theme-text-inverse)_15%))]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
              Goal: {money(goal)}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <DashboardWidgetShell
      eyebrow="AI · Revenue Watch"
      title="Current month pace"
      subtitle="Verified monthly revenue and known contribution pulse."
      rightSlot={
        <Link
          href="/dashboard/owner/reports"
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-inset)]"
        >
          Open reports →
        </Link>
      }
      compact
    >
      {content}
    </DashboardWidgetShell>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "accent";
}) {
  const toneClass =
    tone === "primary"
      ? "text-[color:var(--brand-primary)]"
      : tone === "accent"
        ? "text-[color:var(--brand-accent)]"
        : "text-[color:var(--theme-text-primary)]";

  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">{label}</div>
      <div className={["mt-1 text-lg font-semibold", toneClass].join(" ")}>{value}</div>
    </div>
  );
}
